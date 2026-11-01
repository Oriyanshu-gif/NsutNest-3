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

import { useEffect, useMemo, useState } from "react";
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

  const chips = useMemo(() => {
    if (!profile) return [];
    return ["branch name", "degree", "section"]
      .map(key => profile.fields.find(field => field.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === key))
      .filter((field): field is { label: string; value: string } => Boolean(field?.value))
      .map(field => field.value);
  }, [profile]);

  function refresh() {
    setReloadToken(token => token + 1);
  }

  function printProfile() {
    if (!profile) return;
    // The @media print rules hide the shell and print only .myProfileSheet.
    window.print();
  }


  return (
    <div className="myProfilePage">
      <header className="myProfileToolbar">
        <div>
          <small className="myProfileKicker">MY PROFILE · NSUT IMS</small>
          <h1>Student Profile</h1>
          <p>Your details and photograph, straight from IMS.</p>
        </div>
        <div className="myProfileActions">
          <button className="myProfilePrintButton" type="button" onClick={printProfile} disabled={!profile}>
            <Printer size={16} /> Print Profile
          </button>
        </div>
      </header>

      {error && (
        <div className="myProfileAlert" role="alert">
          <AlertTriangle size={18} />
          <div>
            <b>{profile ? "Showing your saved IMS profile" : "Could not load your IMS profile"}</b>
            <span>{error}</span>
          </div>
          <div className="myProfileAlertActions">
            <button type="button" onClick={refresh}>Try again</button>
            <button type="button" onClick={requestAttendanceRefresh}>Sync IMS</button>
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
          <p>Sign in to NSUT IMS with the attendance flow and your profile will load here.</p>
          {error && <button type="button" onClick={requestAttendanceRefresh}>Sign in &amp; sync IMS</button>}
        </div>
      )}

      {profile && (
        <article className="myProfileSheet" id="student-profile-sheet" aria-label="IMS student profile">
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
    </div>
  );
}
