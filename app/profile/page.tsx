"use client";

/**
 * My Profile — the read-only IMS student profile, fetched with the same
 * authenticated session as attendance.
 *
 * The page mirrors the useful part of IMS My Profile (photograph, identity and
 * the 11 summary fields) in NSUT NEST's dark theme. Printing uses the browser's
 * print dialog against the @media print rules in globals.css, so the result is a
 * clean A4 sheet without the app chrome.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Printer, UserRound } from "lucide-react";
import HubShell from "../hub-shell";
import {
  ATTENDANCE_SYNC_EVENT,
  PROFILE_SYNC_EVENT,
  notifyProfileSync,
  readStoredProfile,
  requestAttendanceRefresh,
  writeStoredProfile,
  type StoredImsProfile,
} from "../../lib/app-storage";

/** IMS prints the student name in capitals; show it in the familiar mixed case. */
function displayName(name: string) {
  if (!name || name !== name.toUpperCase()) return name;
  return name.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "S";
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0][0]).toUpperCase();
}

function readCachedProfile(): StoredImsProfile | null {
  try {
    const raw = readStoredProfile();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredImsProfile;
    return Array.isArray(parsed?.fields) && parsed.fields.length ? parsed : null;
  } catch {
    return null;
  }
}

export default function MyProfilePage() {
  return (
    <HubShell>
      <MyProfileBody />
    </HubShell>
  );
}

function MyProfileBody() {
  const [profile, setProfile] = useState<StoredImsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [openingPrint, setOpeningPrint] = useState(false);
  /** The IMS printout, rendered off-screen so the browser prints IMS's own sheet. */
  const [printHtml, setPrintHtml] = useState("");
  /** True while a print waits for the sign-in card to finish an IMS session. */
  const [awaitingImsForPrint, setAwaitingImsForPrint] = useState(false);
  const [printNotice, setPrintNotice] = useState("");
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  /** Stops a refused print from bouncing between the gate and this page. */
  const printAttemptsRef = useRef(0);

  // The cached copy paints immediately, then a fresh request replaces it. This
  // keeps the sidebar photograph and the print sheet instant on every visit.
  useEffect(() => {
    const cached = readCachedProfile();
    if (cached) setProfile(cached);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    fetch("/api/ims/profile", { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as StoredImsProfile & { error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load your IMS profile.");
        return body;
      })
      .then(payload => {
        if (!active) return;
        setProfile(payload);
        setPhotoFailed(false);
        writeStoredProfile(JSON.stringify(payload));
        notifyProfileSync();
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setError(failure instanceof Error ? failure.message : "Could not load your IMS profile. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [reloadToken]);

  // A new attendance sync means a new valid IMS session, so retry the profile.
  useEffect(() => {
    const onAttendance = () => setReloadToken(token => token + 1);
    window.addEventListener(ATTENDANCE_SYNC_EVENT, onAttendance);
    return () => window.removeEventListener(ATTENDANCE_SYNC_EVENT, onAttendance);
  }, []);

  // Logout (or switching accounts) clears the cache; drop the visible profile too.
  useEffect(() => {
    const onProfileChange = () => {
      const cached = readCachedProfile();
      setProfile(cached);
      if (!cached) setPhotoFailed(false);
    };
    window.addEventListener(PROFILE_SYNC_EVENT, onProfileChange);
    return () => window.removeEventListener(PROFILE_SYNC_EVENT, onProfileChange);
  }, []);

  const fullName = displayName(profile?.name?.trim() || profile?.roll || "Student");
  const studentInitials = initials(fullName);
  const showPhoto = Boolean(profile?.photo) && !photoFailed;

  // Branch and degree stand alone; the section is just a digit in IMS, so it
  // needs its label to mean anything outside the table.
  const chips = useMemo(() => {
    if (!profile) return [];
    const pick = (key: string) => profile.fields
      .find(field => field.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === key)?.value?.trim();
    return [pick("branch name"), pick("degree"), pick("section") && `Section ${pick("section")}`]
      .filter((chip): chip is string => Boolean(chip));
  }, [profile]);

  function refresh() {
    setReloadToken(token => token + 1);
  }

  /**
   * Prints IMS's own Print Profile form, never this page.
   *
   * IMS only serves that link inside the signed-in session, so the HTML comes
   * back from `/api/ims/profile/print` (photograph already inlined) and is put in
   * a hidden same-origin iframe, whose document is what the browser prints.
   *
   * When the IMS session is alive the printout appears immediately with no
   * prompt. When it has lapsed, the shared sign-in card is opened — CAPTCHA only
   * if the ID and password are saved on this device — and the print is retried by
   * itself as soon as that session lands.
   */
  async function printProfile() {
    if (openingPrint) return;
    setOpeningPrint(true);
    setPrintNotice("");
    // Unmount the previous printout so a repeat click reloads the iframe and
    // fires its print again.
    setPrintHtml("");
    try {
      const response = await fetch("/api/ims/profile/print", { cache: "no-store" });
      if (response.status === 401) {
        printAttemptsRef.current += 1;
        if (printAttemptsRef.current > 2) {
          setPrintNotice("IMS did not accept the new session. Sign in from the dashboard, then press Print Profile again.");
          setOpeningPrint(false);
          return;
        }
        setAwaitingImsForPrint(true);
        setPrintNotice("Sign in to IMS and the printout opens by itself.");
        requestAttendanceRefresh("print");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "Could not open the IMS printout.");
      }
      printAttemptsRef.current = 0;
      setPrintHtml(await response.text());
    } catch (failure) {
      setPrintNotice(failure instanceof Error ? failure.message : "Could not open the IMS printout.");
      setOpeningPrint(false);
    }
  }

  // Latest printProfile for the sync listener below, which is mounted once per
  // pending print instead of on every render.
  const printRef = useRef(printProfile);
  printRef.current = printProfile;

  /** A finished IMS sign-in completes a print that was waiting for one. */
  useEffect(() => {
    if (!awaitingImsForPrint) return;
    const onSync = () => {
      setAwaitingImsForPrint(false);
      void printRef.current();
    };
    window.addEventListener(ATTENDANCE_SYNC_EVENT, onSync);
    // A dismissed sign-in card never syncs, so stop waiting instead of leaving
    // the button spinning forever.
    const timer = window.setTimeout(() => {
      setAwaitingImsForPrint(false);
      setOpeningPrint(false);
      setPrintNotice("Sign-in was not completed. Press Print Profile to try again.");
    }, 120_000);
    return () => {
      window.removeEventListener(ATTENDANCE_SYNC_EVENT, onSync);
      window.clearTimeout(timer);
    };
  }, [awaitingImsForPrint]);


  return (
    <div className="myProfilePage">
      <header className="myProfileToolbar">
        <div>
          <small className="myProfileKicker">MY PROFILE · NSUT IMS</small>
          <h1>Student Profile</h1>
          <p>Your details and photograph, straight from IMS.</p>
        </div>
        <div className="myProfileActions">
          <button className="myProfilePrintButton" type="button" onClick={printProfile} disabled={openingPrint && !awaitingImsForPrint}>
            {openingPrint ? <Loader2 size={16} className="attSpinIcon" /> : <Printer size={16} />}
            {openingPrint
              ? awaitingImsForPrint ? "Waiting for IMS sign-in…" : "Opening IMS printout…"
              : "Print Profile"}
          </button>
          {printNotice && <p className="myProfilePrintNotice" role="status" aria-live="polite">{printNotice}</p>}
        </div>
      </header>

      {error && !profile && (
        <div className="myProfileAlert" role="alert">
          <AlertTriangle size={18} />
          <div>
            <b>IMS profile not loaded yet</b>
            <span>{error}</span>
          </div>
          <div className="myProfileAlertActions">
            <button type="button" onClick={refresh}>Try again</button>
            <button type="button" onClick={() => requestAttendanceRefresh()}>Sync IMS</button>
          </div>
        </div>
      )}

      {!profile && loading && (
        <div className="myProfileLoading" role="status" aria-live="polite">
          <Loader2 className="attSpinIcon" size={26} />
          <b>Fetching your IMS profile…</b>
          <span>Opening My Profile → View with your IMS session.</span>
        </div>
      )}

      {!profile && !loading && (
        <div className="myProfileEmpty">
          <span className="myProfileEmptyIcon"><UserRound size={30} /></span>
          <h2>Connect your IMS profile</h2>
          <p>Sign in once on the dashboard and your IMS details and photograph appear here.</p>
          <button type="button" onClick={() => requestAttendanceRefresh()}>Sign in &amp; sync IMS</button>
        </div>
      )}

      {profile && (
        <article className="myProfileSheet" id="student-profile-sheet" aria-label="IMS student profile">
          {/* Print-only letterhead: the IMS printout opens with the institute
              name and address, so the sheet does not need the app header. */}
          <header className="myProfilePrintHead" aria-hidden="true">
            <b>NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY</b>
            <span>Azad Hind Fauz Marg, New Delhi - 110078</span>
            <small>Student Profile</small>
          </header>
          <header className="myProfileSheetHead">
            <div className="myProfilePhoto">
              {showPhoto
                ? <img src={profile.photo!} alt={`${fullName} profile photograph`} onError={() => setPhotoFailed(true)} />
                : <span>{studentInitials}</span>}
            </div>

            <div className="myProfileIdentity">
              <small>NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY</small>
              <h2>{fullName}</h2>
              <p>{profile.studentId || profile.roll}</p>
              {chips.length > 0 && (
                <div className="myProfileChips">
                  {chips.map(chip => <span key={chip}>{chip}</span>)}
                </div>
              )}
            </div>
          </header>

          <div className="myProfileSectionLabel">STUDENT PROFILE</div>

          <dl className="myProfileDetails">
            {profile.fields.map((field, index) => (
              <div className="myProfileDetailRow" key={`${field.label}-${index}`}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </article>
      )}

      {/* Off-screen by design: printing this frame prints IMS's own profile form,
          which is the sheet a student needs for verification. */}
      {printHtml && (
        <iframe
          ref={printFrameRef}
          className="imsPrintFrame"
          title="IMS Print Profile"
          srcDoc={printHtml}
          onLoad={() => {
            setOpeningPrint(false);
            const frame = printFrameRef.current;
            if (!frame?.contentWindow) return;
            try {
              frame.contentWindow.focus();
              frame.contentWindow.print();
            } catch {
              setPrintNotice("Your browser blocked the print dialog. Allow printing for this site and try again.");
            }
          }}
        />
      )}
    </div>
  );
}
