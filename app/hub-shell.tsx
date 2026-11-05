"use client";

/**
 * Shared shell for the NsutNest dashboard: fixed left sidebar and the top bar
 * with breadcrumb, notification bell and semester chip. The main content area
 * scrolls with the page; the sidebar and (on desktop) the top bar stay put.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bell, BookOpen, Briefcase, Home, Trophy, Users, type LucideIcon, LockKeyhole, RefreshCw, Eye, EyeOff, Loader2, LogOut } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ReactNode } from "react";
import BrandLogo from "./brand-logo";
import { LiveViewCount } from "./live-views";
import { withResolvedSubjectNames } from "../lib/attendance";
import {
  ATTENDANCE_REFRESH_EVENT,
  ATTENDANCE_REFRESH_STATUS_EVENT,
  ATTENDANCE_SYNC_EVENT,
  PROFILE_SYNC_EVENT,
  clearRememberedImsId,
  clearRememberedPassword,
  clearStoredAttendance,
  clearStoredProfile,
  notifyAttendanceSync,
  notifyProfileSync,
  readRememberedImsId,
  readRememberedPassword,
  readStoredAttendance,
  readStoredProfile,
  writeRememberedImsId,
  writeRememberedPassword,
  writeStoredAttendance,
  writeStoredProfile,
  type StoredImsProfile,
} from "../lib/app-storage";
import { loadStudents } from "../lib/data";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/study-material", label: "Study material", icon: BookOpen },
  { href: "/results", label: "Results", icon: Trophy },
  { href: "/tnp", label: "TNP", icon: Briefcase },
  { href: "/community", label: "Community", icon: Users },
];

function crumb(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/study-material")) return "Study material";
  if (pathname.startsWith("/tnp")) return "TNP (Training & Placement)";
  if (pathname.startsWith("/results")) return "Results";
  if (pathname.startsWith("/community")) return "Community";
  if (pathname.startsWith("/profile")) return "My Profile";
  if (pathname.startsWith("/student")) return "Student profile";
  if (pathname.startsWith("/notices")) return "Notices";
  return pathname;
}

type LiveSubject = { code: string; name: string; held: number; absent: number; present: number; percent: number; canSkip: number; mustAttend: number };
type LiveAttendance = { name: string; roll: string; semester: string; academicYear?: string; selectedSemester?: string; subjects: LiveSubject[]; syncedAt: string };
type ImsChoice = { value: string; label: string };
type AttendanceConfirmation = {
  needsConfirmation: true;
  sessionId: string;
  academicYearOptions: ImsChoice[];
  semesterOptions: ImsChoice[];
  suggested: { academicYear: string; semester: string };
  required: { academicYear: boolean; semester: boolean };
  message: string;
};
type AttendanceApiResponse = LiveAttendance | AttendanceConfirmation | { error?: string };
type RefreshApiResponse = Partial<LiveAttendance> & Partial<AttendanceConfirmation> & { error?: string; needsLogin?: boolean };

/** Server-side CAPTCHA session lifetime, in seconds (lib/ims-http.ts IMS_SESSION_SECONDS). */
const IMS_SESSION_TTL_SECONDS = 180;
/** Reuse the shown CAPTCHA only when this many seconds of validity remain. */
const SESSION_REUSE_MARGIN_SECONDS = 30;

/** One automatic profile fetch per signed-in roll, per page session. */
const profileFetchAttempts = new Set<string>();

export function ImsLoginGate() {
  const [open, setOpen] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [roll, setRoll] = useState("");
  /** One switch for both saved credentials, so the pair can never drift apart. */
  const [rememberCredentials, setRememberCredentials] = useState(false);
  /**
   * Whether both an ID and a password are stored on this device. When they are,
   * the gate asks only for the CAPTCHA; the saved pair is submitted behind it.
   */
  const [savedCredentials, setSavedCredentials] = useState(false);
  const [password, setPassword] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [confirmation, setConfirmation] = useState<AttendanceConfirmation | null>(null);
  const [confirmedYear, setConfirmedYear] = useState("");
  const [confirmedSemester, setConfirmedSemester] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [attendance, setAttendance] = useState<LiveAttendance | null>(null);
  /** True while re-running sign-in to refresh a snapshot that is already saved. */
  const [syncing, setSyncing] = useState(false);
  /** Why the card is open; only the copy differs between a refresh and a print. */
  const [signInPurpose, setSignInPurpose] = useState<"refresh" | "print">("refresh");
  /**
   * Whether IMS requires a human-read CAPTCHA. Always true today: the portal has
   * no sanctioned API or authorised automated verification. The flag comes from
   * the session endpoint so an officially authorised flow could omit the field.
   */
  const [captchaRequired, setCaptchaRequired] = useState(true);
  /** When the currently shown CAPTCHA session was issued, to detect expiry. */
  const issuedAtRef = useRef(0);
  const rollRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<HTMLInputElement>(null);

  async function newCaptcha(preserveError = false) {
    setCaptchaLoading(true); if (!preserveError) setError(""); setCaptchaText("");
    try {
      const res = await fetch("/api/ims/session", { method: "POST", cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not start an IMS login session.");
      setSessionId(body.sessionId);
      setCaptcha(body.captcha);
      setCaptchaRequired(body.captchaRequired !== false);
      issuedAtRef.current = Date.now();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not start sign-in right now. Please try again."); }
    finally { setCaptchaLoading(false); }
  }

  // Saved credentials are read once on mount so the next sign-in needs only the
  // CAPTCHA. The checkbox reflects storage, not a separate preference.
  useEffect(() => {
    const savedId = readRememberedImsId();
    const savedPassword = readRememberedPassword();
    if (savedId) setRoll(savedId);
    if (savedPassword) setPassword(savedPassword);
    setRememberCredentials(Boolean(savedId || savedPassword));
    setSavedCredentials(Boolean(savedId && savedPassword));
  }, []);

  // Refresh before expiry while the user is filling out the form, rather than
  // submitting an old session ID after an asynchronous refresh.
  useEffect(() => {
    if ((!open && !syncing) || confirmation || !sessionId || loading || captchaLoading) return;
    const refreshAfter = Math.max(1000, IMS_SESSION_TTL_SECONDS * 1000 - SESSION_REUSE_MARGIN_SECONDS * 1000 - (Date.now() - issuedAtRef.current));
    const timer = window.setTimeout(() => { void newCaptcha(); }, refreshAfter);
    return () => window.clearTimeout(timer);
  }, [open, syncing, confirmation, sessionId, loading, captchaLoading]);

  // Keyboard-first flow: start in the ID field, then move to the CAPTCHA once a
  // fresh image is on screen. Intentionally not re-run on every keystroke.
  useEffect(() => {
    if ((!open && !syncing) || confirmation) return;
    (roll ? captchaRef.current : rollRef.current)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, syncing, confirmation]);

  useEffect(() => {
    if (!captcha || captchaLoading || (!open && !syncing) || confirmation) return;
    // Never steal the cursor from someone who is already typing their ID or
    // password: a slow image fetch often lands mid-keystroke.
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement;
    if (typing) return;
    captchaRef.current?.focus();
  }, [captcha, captchaLoading, open, syncing, confirmation]);

  useEffect(() => {
    try {
      const cached = readStoredAttendance();
      if (cached) {
        const parsed = JSON.parse(cached) as LiveAttendance;
        if (parsed?.subjects?.length && parsed.roll?.trim() && parsed.academicYear && parsed.selectedSemester) {
          const normalized = {
            ...parsed,
            subjects: withResolvedSubjectNames(parsed.subjects),
          };
          writeStoredAttendance(JSON.stringify(normalized));
          setAttendance(normalized);
          setOpen(false);
          return;
        }
        clearStoredAttendance();
        notifyAttendanceSync();
      }
    } catch {
      setError("Could not read saved sign-in details. Check your browser storage settings.");
    }
    void newCaptcha(true);
  }, []);

  function updateRoll(value: string) {
    setRoll(value);
    if (!rememberCredentials) return;
    if (value.trim()) writeRememberedImsId(value.trim());
    else clearRememberedImsId();
  }

  function updatePassword(value: string) {
    setPassword(value);
    if (!rememberCredentials) return;
    if (value) writeRememberedPassword(value);
    else clearRememberedPassword();
  }

  /** Stores or forgets both credentials together; the checkbox is the only consent. */
  function updateRememberCredentials(remember: boolean) {
    if (remember) {
      if (roll.trim()) writeRememberedImsId(roll.trim());
      if (password) writeRememberedPassword(password);
    } else {
      clearRememberedImsId();
      clearRememberedPassword();
    }
    setRememberCredentials(remember);
    setSavedCredentials(remember && Boolean(roll.trim()) && Boolean(password));
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    // Never submit with an expired session. A refreshed CAPTCHA requires the
    // user to type its new characters; silently swapping it would also submit
    // a stale session ID from this render.
    if (!confirmation && (!sessionId || Date.now() - issuedAtRef.current >= (IMS_SESSION_TTL_SECONDS - SESSION_REUSE_MARGIN_SECONDS) * 1000)) {
      await newCaptcha();
      setError("Your CAPTCHA timed out. Enter the new characters shown and sign in again.");
      setLoading(false);
      return;
    }
    let failureMessage = "Could not load attendance right now. Please try again.";
    try {
      const isConfirming = confirmation !== null;
      const res = await fetch("/api/ims/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(isConfirming
          ? {
              sessionId: confirmation.sessionId,
              confirmChoices: true,
              academicYear: confirmedYear || confirmation.suggested.academicYear,
              semester: confirmedSemester || confirmation.suggested.semester,
            }
          : { sessionId, roll, password, captcha: captchaText }),
      });
      const body = await res.json() as AttendanceApiResponse;
      if ('needsConfirmation' in body && body.needsConfirmation) {
        setConfirmation(body);
        setSessionId(body.sessionId);
        setConfirmedYear(body.suggested.academicYear);
        setConfirmedSemester(body.suggested.semester);
        setPassword("");
        setCaptchaText("");
        issuedAtRef.current = Date.now();
        return;
      }
      if (!res.ok || !('subjects' in body)) {
        if ('error' in body && body.error) failureMessage = body.error;
        // An expired session cannot be trusted for a manual retry: the submit
        // button re-disables and the shown CAPTCHA is dead. Refresh it silently
        // and tell the user to just press Sign in again.

        throw new Error("Attendance request failed.");
      }
      const payload = {
        ...body,
        roll: body.roll || roll.trim(),
        subjects: withResolvedSubjectNames(body.subjects),
      };
      writeStoredAttendance(JSON.stringify(payload));
      notifyAttendanceSync();
      setAttendance(payload); setPassword(""); setCaptchaText(""); setConfirmation(null); setSyncing(false); setOpen(false);
    } catch {
      // A failed login consumes the portal CAPTCHA session. Start a fresh session,
      // but do not clear the error: otherwise the user sees no feedback.
      setConfirmation(null);
      await newCaptcha(true);
      setError(failureMessage);
    }    finally { setLoading(false); }
  }

  function logout() {
    clearStoredAttendance();
    // Logging out is the "forget me" action: saved credentials and the cached
    // IMS photograph go too.
    clearRememberedImsId();
    clearRememberedPassword();
    clearStoredProfile();
    profileFetchAttempts.clear();
    setRememberCredentials(false);
    setSavedCredentials(false);
    notifyAttendanceSync();
    notifyProfileSync();
    setAttendance(null); setRoll(""); setPassword(""); setCaptchaText(""); setConfirmation(null); setSessionId(""); setCaptcha(""); setSyncing(false); setOpen(true); void newCaptcha();
  }

  /**
   * Refresh attendance in the order that asks the student for the least work:
   *
   *   1. Reuse the stored IMS session — no CAPTCHA, no password.
   *   2. If IMS no longer accepts that session, ask only for the CAPTCHA. The ID
   *      and password saved on this device are submitted with it, so a remembered
   *      student never retypes credentials to refresh.
   *   3. With nothing saved, fall back to the full sign-in form.
   *
   * Every failure ends in step 2 or 3, so the button can never look dead.
   */
  async function startResync() {
    if (syncing) return;
    let failure = "";
    window.dispatchEvent(new CustomEvent(ATTENDANCE_REFRESH_STATUS_EVENT, { detail: true }));
    try {
      const res = await fetch("/api/ims/refresh", { method: "POST", cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as RefreshApiResponse;
      if (res.ok && Array.isArray(body.subjects) && body.subjects.length) {
        const payload = { ...body, subjects: withResolvedSubjectNames(body.subjects) } as LiveAttendance;
        writeStoredAttendance(JSON.stringify(payload));
        notifyAttendanceSync();
        setAttendance(payload);
        setError("");
        setSyncing(false);
        setOpen(false);
        return;
      }
      if (res.ok && body.needsConfirmation) {
        // The portal moved to a new academic year or semester: ask for the pair
        // rather than throwing a usable session away.
        const confirmationBody = body as AttendanceConfirmation;
        setConfirmation(confirmationBody);
        setSessionId(confirmationBody.sessionId);
        setConfirmedYear(confirmationBody.suggested.academicYear);
        setConfirmedSemester(confirmationBody.suggested.semester);
        setSyncing(true);
        setCaptchaText("");
        return;
      }
      if (body.error) failure = body.error;
    } catch {
      // The request never reached the server; step 2 reports it below.
    } finally {
      // The panel's "Updating attendance…" overlay must clear on every outcome,
      // including the early returns above.
      window.dispatchEvent(new CustomEvent(ATTENDANCE_REFRESH_STATUS_EVENT, { detail: false }));
    }

    const savedId = readRememberedImsId() ?? "";
    const savedPassword = readRememberedPassword() ?? "";
    setSyncing(true);
    setConfirmation(null);
    setCaptchaText("");
    // Prefill from this device. Saving them is the student's own consent from the
    // sign-in card, and logging out still erases them.
    if (savedId) setRoll(savedId);
    setPassword(savedPassword);
    setError(failure || "Your saved IMS session expired. Enter the CAPTCHA to refresh attendance.");
    await newCaptcha(true);
  }

  /** Drops the saved ID and password so the next sign-in starts blank. */
  function useDifferentAccount() {
    updateRememberCredentials(false);
    setRoll("");
    setPassword("");
    setCaptchaText("");
    setError("");
  }

  function cancelResync() {
    setSyncing(false);
    setConfirmation(null);
    setPassword("");
    setCaptchaText("");
    setError("");
    setOpen(false);
  }

  // The dashboard's refresh button fires this event because only the gate holds
  // the CAPTCHA session and the sign-in form. The ref keeps the listener mounted
  // once while still calling the latest startResync; a saved snapshot is
  // required, so a signed-out visitor never lands in the "refresh" wording.
  const resyncRef = useRef(startResync);
  resyncRef.current = startResync;
  useEffect(() => {
    const onRequest = (event: Event) => {
      // "print" only changes the wording: the profile printout is waiting for the
      // session this card establishes.
      setSignInPurpose((event as CustomEvent<string>).detail === "print" ? "print" : "refresh");
      // Signed out, the same button opens the sign-in card instead of a no-op.
      if (readStoredAttendance()) resyncRef.current();
      else setOpen(true);
    };
    window.addEventListener(ATTENDANCE_REFRESH_EVENT, onRequest);
    return () => window.removeEventListener(ATTENDANCE_REFRESH_EVENT, onRequest);
  }, []);

  const selectedYear = confirmedYear || confirmation?.suggested.academicYear || "";
  const selectedSemester = confirmedSemester || confirmation?.suggested.semester || "";
  const canConfirm = !confirmation || ((!confirmation.required.academicYear || !!selectedYear) && (!confirmation.required.semester || !!selectedSemester));
  /** Saved ID + password: the gate offers the CAPTCHA alone, not the whole form. */
  const savedAccount = !confirmation && savedCredentials && Boolean(roll.trim()) && Boolean(password);
  const printing = signInPurpose === "print";
  const gateIntro = savedAccount
    ? syncing
      ? `Enter the CAPTCHA to ${printing ? "print your IMS profile" : "refresh attendance"} for ${roll.trim()} — your saved ID and password are sent with it.`
      : `Signing in as ${roll.trim()} on this device. Enter the CAPTCHA to continue.`
    : syncing
      ? printing
        ? "Your IMS session expired. Sign in again and the printout opens by itself."
        : "Your IMS session expired. Sign in again to refresh attendance."
      : "Sign in with your NSUT IMS account.";

  return <>
    {attendance && !open && <button className="imsSessionButton" type="button" onClick={() => setOpen(true)}><Activity size={15} /> {attendance.roll || "IMS connected"}</button>}
    {attendance && open && <div className="imsLoggedInBanner"><span><b>{attendance.name || attendance.roll}</b> · attendance saved on this device{attendance.syncedAt ? ` · synced ${new Date(attendance.syncedAt).toLocaleString()}` : ""}</span><button type="button" onClick={() => startResync()}><RefreshCw size={14}/> Sync again</button><button type="button" onClick={() => setOpen(false)}>Continue to dashboard</button><button type="button" onClick={logout} aria-label="Log out of IMS"><LogOut size={15}/></button></div>}
    {((open && !attendance) || syncing) && <div className="imsGateBackdrop" role="dialog" aria-modal="true" aria-labelledby="imsGateTitle">
      <form className="imsGateCard" onSubmit={submit}>
        <div className="imsGateMark"><LockKeyhole size={23}/></div>
        <div className="imsGateEyebrow">{confirmation ? "Verify attendance period" : syncing ? (printing ? "IMS sign-in" : "Refresh saved attendance") : "IMS portal sign-in"}</div>
        <h2 id="imsGateTitle">{confirmation ? "Confirm your IMS selection" : syncing ? (printing ? "Sign in to print your profile" : "Refresh IMS attendance") : "Connect to NSUT IMS"}</h2>
        {confirmation ? <>
          <p className="imsGateIntro">{confirmation.message} Pick from the options IMS returned.</p>
          {confirmation.required.academicYear
            ? <label htmlFor="imsAcademicYear">Academic year
                <select id="imsAcademicYear" value={selectedYear} onChange={event => setConfirmedYear(event.target.value)} required>
                  <option value="">Select an academic year</option>
                  {confirmation.academicYearOptions.map(option => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            : <p className="imsDetectedSelection">Academic year detected from IMS: <b>{confirmation.academicYearOptions.find(option => option.value === selectedYear)?.label ?? selectedYear}</b></p>}
          {confirmation.required.semester
            ? <label htmlFor="imsSemester">Semester
                <select id="imsSemester" value={selectedSemester} onChange={event => setConfirmedSemester(event.target.value)} required>
                  <option value="">Select a semester</option>
                  {confirmation.semesterOptions.map(option => <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            : <p className="imsDetectedSelection">Semester detected from IMS: <b>{confirmation.semesterOptions.find(option => option.value === selectedSemester)?.label ?? selectedSemester}</b></p>}
        </> : <>
          <p className="imsGateIntro">{gateIntro}</p>
          {savedAccount ? (
            <div className="imsSavedAccount">
              <span>
                <b>{roll.trim()}</b>
                <small>ID and password saved on this device</small>
              </span>
              <button type="button" onClick={useDifferentAccount} disabled={loading || captchaLoading}>Use a different account</button>
            </div>
          ) : <>
            <label>IMS ID / Roll number<input ref={rollRef} name="username" autoComplete="username" enterKeyHint="next" value={roll} onChange={e => updateRoll(e.target.value)} required placeholder="Enter your IMS ID" /></label>
            <label>Password<span className="imsPasswordWrap"><input name="password" autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={e => updatePassword(e.target.value)} required placeholder="Enter your IMS password" /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
            <label className="imsRememberRow imsRememberCredentials">
              <input type="checkbox" checked={rememberCredentials} onChange={event => updateRememberCredentials(event.target.checked)} />
              <span><b>Remember my IMS ID and password on this device</b><small>Plain text in this browser. Avoid on shared devices; logging out erases them.</small></span>
            </label>
          </>}
          {captchaRequired && <>
            <div className="imsCaptchaHead"><label htmlFor="imsCaptchaInput">Enter the CAPTCHA from IMS</label><button type="button" onClick={() => void newCaptcha()} disabled={captchaLoading || loading} aria-label="Load a new CAPTCHA image"><RefreshCw size={14}/> Refresh</button></div>
            {captcha
              ? <img className="imsCaptchaImage" src={captcha} alt="CAPTCHA supplied by NSUT IMS" />
              : <div className="imsCaptchaPlaceholder">{captchaLoading
                  ? <><Loader2 className="imsSpin" size={17}/> Loading CAPTCHA…</>
                  : <><span>CAPTCHA unavailable</span><button type="button" onClick={() => void newCaptcha()} disabled={loading}>Try again</button></>}</div>}
            <input id="imsCaptchaInput" ref={captchaRef} value={captchaText} onChange={e => setCaptchaText(e.target.value)} required placeholder="Type the characters shown" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" aria-describedby="imsCaptchaHint" />
            <small className="imsCaptchaHint" id="imsCaptchaHint">Wrong code? Only the image reloads — your details stay.</small>
          </>}
        </>}
        {error && <div className="imsGateError" role="alert">{error}</div>}
        <button className="imsGateSubmit" type="submit" disabled={loading || captchaLoading || !canConfirm || (confirmation ? !confirmation.sessionId : !sessionId || (captchaRequired && !captcha))}>
          {loading
            ? <><Loader2 className="imsSpin" size={17}/> {confirmation ? "Loading selected attendance…" : syncing ? (printing ? "Signing in and opening the printout…" : "Signing in and updating attendance…") : "Signing in and fetching attendance…"}</>
            : confirmation ? "Confirm & load attendance" : syncing ? (printing ? "Sign in & print profile" : "Refresh attendance") : "Sign in & fetch attendance"}
        </button>
        {syncing && !confirmation && <button className="imsGateCancel" type="button" onClick={cancelResync}>Cancel refresh</button>}
        {!confirmation && <p className="imsGateFoot">Your password goes only to NSUT IMS.</p>}
      </form>
    </div>}
  </>;
}

export default function HubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const activeLabel = crumb(pathname);
  const [loggedInStudent, setLoggedInStudent] = useState<{ name: string; roll: string } | null>(null);
  const [profile, setProfile] = useState<StoredImsProfile | null>(null);
  // Bumped by a new IMS sign-in so the photograph fetch can run again.
  const [profileSyncToken, setProfileSyncToken] = useState(0);

  useEffect(() => {
    function syncStudent() {
      const cached = readStoredAttendance();
      if (!cached) {
        setLoggedInStudent(null);
        return;
      }

      try {
        const parsed = JSON.parse(cached) as Partial<LiveAttendance>;
        if (typeof parsed.name === "string" && typeof parsed.roll === "string") {
          const roll = parsed.roll.trim();
          setLoggedInStudent({ name: parsed.name.trim(), roll });
          void loadStudents().then(students => {
            const current = readStoredAttendance();
            if (!current) return;
            const currentAttendance = JSON.parse(current) as Partial<LiveAttendance>;
            if (currentAttendance.roll?.trim().toUpperCase() !== roll.toUpperCase()) return;
            const student = students.find(record => record.roll.trim().toUpperCase() === roll.toUpperCase());
            if (student) setLoggedInStudent({ name: student.name, roll });
          }).catch(error => {
            console.error("Could not resolve the signed-in student from published results.", error);
          });
          return;
        }
        setLoggedInStudent(null);
      } catch (error) {
        console.error("Could not read the saved IMS student identity.", error);
        setLoggedInStudent(null);
      }
    }

    syncStudent();
    window.addEventListener(ATTENDANCE_SYNC_EVENT, syncStudent);
    return () => window.removeEventListener(ATTENDANCE_SYNC_EVENT, syncStudent);
  }, []);

  // Keep the cached profile in sync with the profile page and logout.
  useEffect(() => {
    function syncProfile() {
      try {
        const raw = readStoredProfile();
        const parsed = raw ? JSON.parse(raw) as StoredImsProfile : null;
        const sameStudent = !parsed?.roll || !loggedInStudent?.roll
          || parsed.roll.toUpperCase() === loggedInStudent.roll.toUpperCase();
        setProfile(sameStudent && parsed?.fields?.length ? parsed : null);
      } catch {
        setProfile(null);
      }
    }

    syncProfile();
    window.addEventListener(PROFILE_SYNC_EVENT, syncProfile);
    return () => window.removeEventListener(PROFILE_SYNC_EVENT, syncProfile);
  }, [loggedInStudent?.roll]);

  // A fresh IMS sign-in may carry a new session, so allow the photograph to be
  // retried instead of waiting for a page reload.
  useEffect(() => {
    const onAttendanceSync = () => {
      profileFetchAttempts.clear();
      setProfileSyncToken(token => token + 1);
    };
    window.addEventListener(ATTENDANCE_SYNC_EVENT, onAttendanceSync);
    return () => window.removeEventListener(ATTENDANCE_SYNC_EVENT, onAttendanceSync);
  }, []);

  // Fetch the photograph once after attendance establishes the IMS session. The
  // profile page fetches its own copy, so skip the duplicate request there.
  useEffect(() => {
    if (!loggedInStudent?.roll || pathname === "/profile") return;
    if (readStoredProfile()) return;
    const key = loggedInStudent.roll.toUpperCase();
    if (profileFetchAttempts.has(key)) return;
    profileFetchAttempts.add(key);

    fetch("/api/ims/profile", { cache: "no-store" })
      .then(async response => {
        const body = await response.json() as StoredImsProfile & { error?: string };
        if (!response.ok) throw new Error(body.error || "Profile unavailable");
        return body;
      })
      .then(payload => {
        if (!payload?.fields?.length) return;
        writeStoredProfile(JSON.stringify(payload));
        notifyProfileSync();
      })
      .catch(() => {
        // Initials remain in the sidebar; the profile page reports the reason.
      });
  }, [loggedInStudent?.roll, pathname, profileSyncToken]);

  // The published student record supplies the title-cased name ("Priyanshu Kumar
  // Singh") while IMS prints it in capitals; keep the familiar form, and fall
  // back to the IMS name only when no record is available.
  const studentName = loggedInStudent?.name?.trim() || profile?.name?.trim() || loggedInStudent?.roll || "Student";
  const nameParts = studentName.split(/\s+/).filter(Boolean);
  const studentInitials = nameParts.length > 1
    ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
    : (nameParts[0]?.[0] ?? "S").toUpperCase();

  return (
    <div className="hub">
      <aside className="hubSidebar">
        <Link href="/" className="hubBrand">
          <BrandLogo />
        </Link>

        <nav className="hubNav">
          <div className="hubNavLabel">Workspace</div>
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`hubNavItem ${pathname === href ? "active" : ""}`}
            >
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="hubSidebarFooter">
          <Link href="/profile" className="hubUser hubUserLink" title={`Open ${studentName}'s My Profile`}>
            <span className="hubUserAvatar">
              {profile?.photo
                ? <img src={profile.photo} alt="" />
                : studentInitials}
            </span>
            <span className="hubUserIdentity">
              <b title={studentName}>{studentName}</b>
              <small>{loggedInStudent ? `Roll ${loggedInStudent.roll}` : "Not signed in to IMS"}</small>
            </span>
          </Link>
        </div>
      </aside>

      <nav className="mobileBottomNav" aria-label="Mobile navigation">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}
            className={`mobileBottomNavItem ${pathname === href ? "active" : ""}`}>
            <Icon size={21} strokeWidth={pathname === href ? 2.5 : 1.8} aria-hidden="true" />
            <span>{label === "Study material" ? "Study" : label === "Community" ? "Social" : label}</span>
          </Link>
        ))}
      </nav>
      <div className="hubMain">
        <header className="hubTopbar">
          <div className="hubBreadcrumb">
            <span>NSUT</span>
            <span className="crumbSlash">/</span>
            <b>{activeLabel}</b>
          </div>
          <div className="hubTopbarRight">
            <LiveViewCount />
            {/* The sidebar is hidden on phones, so the profile stays reachable here. */}
            <Link href="/profile" className="hubTopbarProfile" aria-label="Open My Profile">
              {profile?.photo ? <img src={profile.photo} alt="" /> : <span>{studentInitials}</span>}
            </Link>
            <Link href="/notices" className="hubBell" aria-label="Open IMS notices">
              <Bell size={17} />
            </Link>
            <span className={`hubSemester ${loggedInStudent ? "connected" : "idle"}`}>
              <i className="hubSemesterDot" /> {loggedInStudent ? "IMS synced" : "IMS not connected"}
            </span>
          </div>
        </header>
        <main className="hubContent">{children}</main>
      </div>
    </div>
  );
}
