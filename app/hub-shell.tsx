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
import { withResolvedSubjectNames } from "../lib/attendance";
import {
  ATTENDANCE_SYNC_EVENT,
  clearRememberedImsId,
  clearStoredAttendance,
  notifyAttendanceSync,
  readRememberedImsId,
  readStoredAttendance,
  writeRememberedImsId,
  writeStoredAttendance,
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

/** Server-side CAPTCHA session lifetime, in seconds (lib/ims-http.ts IMS_SESSION_SECONDS). */
const IMS_SESSION_TTL_SECONDS = 180;
/** Reuse the shown CAPTCHA only when this many seconds of validity remain. */
const SESSION_REUSE_MARGIN_SECONDS = 30;

export function ImsLoginGate() {
  const [open, setOpen] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [roll, setRoll] = useState("");
  const [rememberRoll, setRememberRoll] = useState(false);
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
      const rememberedRoll = readRememberedImsId();
      if (rememberedRoll) {
        setRoll(rememberedRoll);
        setRememberRoll(true);
      }
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
    if (!rememberRoll) return;
    try {
      if (value.trim()) writeRememberedImsId(value.trim());
      else clearRememberedImsId();
    } catch {
      setError("Could not save the IMS ID. Check your browser storage settings.");
    }
  }

  function updateRememberRoll(remember: boolean) {
    try {
      if (remember && roll.trim()) writeRememberedImsId(roll.trim());
      else if (!remember) clearRememberedImsId();
      setRememberRoll(remember);
    } catch {
      setError("Could not update this setting. Check your browser storage settings.");
    }
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
    notifyAttendanceSync();
    setAttendance(null); if (!rememberRoll) setRoll(""); setPassword(""); setCaptchaText(""); setConfirmation(null); setSessionId(""); setCaptcha(""); setSyncing(false); setOpen(true); void newCaptcha();
  }

  /**
   * Re-run sign-in to refresh the saved snapshot without throwing it away, so the
   * dashboard keeps showing attendance while the new CAPTCHA is typed.
   */
  function startResync() {
    setOpen(false);
    setSyncing(true);
    setConfirmation(null);
    setConfirmedYear("");
    setConfirmedSemester("");
    setPassword("");
    setCaptchaText("");
    setError("");
    void newCaptcha();
  }

  function cancelResync() {
    setSyncing(false);
    setConfirmation(null);
    setPassword("");
    setCaptchaText("");
    setError("");
    setOpen(true);
  }

  const selectedYear = confirmedYear || confirmation?.suggested.academicYear || "";
  const selectedSemester = confirmedSemester || confirmation?.suggested.semester || "";
  const canConfirm = !confirmation || ((!confirmation.required.academicYear || !!selectedYear) && (!confirmation.required.semester || !!selectedSemester));

  return <>
    {attendance && !open && <button className="imsSessionButton" type="button" onClick={() => setOpen(true)}><Activity size={15} /> {attendance.roll || "IMS connected"}</button>}
    {attendance && open && <div className="imsLoggedInBanner"><span><b>{attendance.name || attendance.roll}</b> · attendance saved on this device{attendance.syncedAt ? ` · synced ${new Date(attendance.syncedAt).toLocaleString()}` : ""}</span><button type="button" onClick={startResync}><RefreshCw size={14}/> Sync again</button><button type="button" onClick={() => setOpen(false)}>Continue to dashboard</button><button type="button" onClick={logout} aria-label="Log out of IMS"><LogOut size={15}/></button></div>}
    {((open && !attendance) || syncing) && <div className="imsGateBackdrop" role="dialog" aria-modal="true" aria-labelledby="imsGateTitle">
      <form className="imsGateCard" onSubmit={submit}>
        <div className="imsGateMark"><LockKeyhole size={23}/></div>
        <div className="imsGateEyebrow">{confirmation ? "VERIFY ATTENDANCE PERIOD" : syncing ? "REFRESH SAVED ATTENDANCE" : "SECURE STUDENT ACCESS"}</div>
        <h2 id="imsGateTitle">{confirmation ? "Confirm your IMS selection" : syncing ? "Refresh IMS attendance" : "Connect to NSUT IMS"}</h2>
        {confirmation ? <>
          <p className="imsGateIntro">{confirmation.message} Choose only from the academic year and semester options returned by IMS.</p>
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
          <p className="imsGateIntro">{syncing
            ? "Your saved attendance stays visible while you refresh it. Sign in once more to pull the latest figures from IMS — your password is used only for this attempt and is not saved by NsutNest."
            : "Sign in once with your own university account and NsutNest stays signed in on this device, so you will not need the CAPTCHA on every visit. Your password is used only for this login attempt and is not saved."}</p>
          <label>IMS ID / Roll number<input ref={rollRef} name="username" autoComplete="username" enterKeyHint="next" value={roll} onChange={e => updateRoll(e.target.value)} required placeholder="Enter your IMS ID" /></label>
          <label>Password<span className="imsPasswordWrap"><input name="password" autoComplete="current-password" type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Enter your IMS password" /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></span></label>
          <label className="imsRememberRow">
            <input type="checkbox" checked={rememberRoll} onChange={event => updateRememberRoll(event.target.checked)} />
            <span><b>Remember my IMS ID on this device</b><small>Your browser may autofill a saved password; NsutNest does not store it.</small></span>
          </label>
          {captchaRequired && <>
            <div className="imsCaptchaHead"><label htmlFor="imsCaptchaInput">Enter the CAPTCHA from IMS</label><button type="button" onClick={() => void newCaptcha()} disabled={captchaLoading || loading} aria-label="Load a new CAPTCHA image"><RefreshCw size={14}/> Refresh</button></div>
            {captcha ? <img className="imsCaptchaImage" src={captcha} alt="CAPTCHA supplied by NSUT IMS" /> : <div className="imsCaptchaPlaceholder">{captchaLoading ? <><Loader2 className="imsSpin" size={17}/> Loading CAPTCHA…</> : "CAPTCHA unavailable"}</div>}
            <input id="imsCaptchaInput" ref={captchaRef} value={captchaText} onChange={e => setCaptchaText(e.target.value)} required placeholder="Type the characters shown" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" aria-describedby="imsCaptchaHint" />
            <small className="imsCaptchaHint" id="imsCaptchaHint">Read the characters from the image. If the code is wrong, your IMS ID and password stay filled in — only a new image is loaded.</small>
          </>}
        </>}
        {error && <div className="imsGateError" role="alert">{error}</div>}
        <button className="imsGateSubmit" type="submit" disabled={loading || captchaLoading || !canConfirm || (confirmation ? !confirmation.sessionId : !sessionId || (captchaRequired && !captcha))}>
          {loading
            ? <><Loader2 className="imsSpin" size={17}/> {confirmation ? "Loading selected attendance…" : "Signing in and fetching attendance…"}</>
            : confirmation ? "Confirm & load attendance" : "Sign in & fetch attendance"}
        </button>
        {syncing && !confirmation && <button className="imsGateCancel" type="button" onClick={cancelResync}>Cancel refresh</button>}
        {!confirmation && <p className="imsGateFoot">Your login is sent to the NSUT IMS portal through this website’s backend. Never use a password you don’t own.</p>}
      </form>
    </div>}
  </>;
}

export default function HubShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const activeLabel = crumb(pathname);
  const [loggedInStudent, setLoggedInStudent] = useState<{ name: string; roll: string } | null>(null);

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

  const studentName = loggedInStudent?.name || loggedInStudent?.roll || "Student";
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
          <div className="hubUser">
            <span className="hubUserAvatar" title={studentName}>{studentInitials}</span>
            <span className="hubUserIdentity">
              <b title={studentName}>{studentName}</b>
              <small>NSUT B.Tech</small>
            </span>
          </div>
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
            <Link href="/notices" className="hubBell" aria-label="IMS notices">
              <Bell size={17} />
              <i className="hubBellDot" />
            </Link>
            <span className="hubSemester">
              <i className="hubSemesterDot" /> IMS attendance sync
            </span>
          </div>
        </header>
        <main className="hubContent">{children}</main>
      </div>
    </div>
  );
}
