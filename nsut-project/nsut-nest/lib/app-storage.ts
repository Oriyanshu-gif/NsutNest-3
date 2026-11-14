/**
 * Browser-storage keys for the signed-in IMS session, in one place so the brand
 * rename (NSUTHUB → NsutNest) cannot leave a stale key behind in a single file.
 *
 * The pre-rename keys are still read once and migrated on sight, so a student who
 * was already signed in keeps their session and remembered IMS ID.
 */

export const APP_NAME = "NsutNest";
export const ATTENDANCE_STORAGE_KEY = "nsutnest_ims_attendance";
export const ATTENDANCE_SYNC_EVENT = "nsutnest-ims-attendance";
export const PROFILE_STORAGE_KEY = "nsutnest_ims_profile";
export const PROFILE_SYNC_EVENT = "nsutnest-ims-profile";
export const TIMETABLE_STORAGE_KEY = "nsutnest_ims_timetable";
export const TIMETABLE_SYNC_EVENT = "nsutnest-ims-timetable";
export const ATTENDANCE_REFRESH_EVENT = "nsutnest-ims-refresh-request";
export const ATTENDANCE_REFRESH_STATUS_EVENT = "nsutnest-ims-refresh-status";
export const REMEMBERED_IMS_ROLL_KEY = "nsutnest_ims_roll";
export const REMEMBERED_PASSWORD_KEY = "nsutnest_ims_password";
/** Random id used only to count this browser in the live view counter. */
export const LIVE_VIEW_CLIENT_ID_KEY = "nsutnest_live_view_client";

const LEGACY_ATTENDANCE_STORAGE_KEY = "nsuthub_ims_attendance";
const LEGACY_REMEMBERED_IMS_ROLL_KEY = "nsuthub_ims_roll";

function store(kind: "session" | "local"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "session" ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads the stored attendance payload, migrating anything written by an older
 * build (sessionStorage, or the pre-rename key) into localStorage.
 *
 * Attendance used to live in sessionStorage, so closing the tab threw it away and
 * every new visit meant another IMS login — and therefore another CAPTCHA. The
 * payload is only ever written after a real login, so keeping it in localStorage
 * means the site stays signed in across restarts: one CAPTCHA per sync, not one
 * per browser session. Logging out still wipes it from both stores.
 */
export function readStoredAttendance(): string | null {
  const local = store("local");
  if (!local) return null;
  const current = local.getItem(ATTENDANCE_STORAGE_KEY);
  if (current) return current;

  // One-time migration of the older tab-scoped and pre-rename keys.
  const session = store("session");
  const candidates: [Storage | null, string][] = [
    [session, ATTENDANCE_STORAGE_KEY],
    [session, LEGACY_ATTENDANCE_STORAGE_KEY],
    [local, LEGACY_ATTENDANCE_STORAGE_KEY],
  ];
  for (const [source, key] of candidates) {
    const value = source?.getItem(key);
    if (!value) continue;
    local.setItem(ATTENDANCE_STORAGE_KEY, value);
    source?.removeItem(key);
    return value;
  }
  return null;
}

export function writeStoredAttendance(value: string): void {
  store("local")?.setItem(ATTENDANCE_STORAGE_KEY, value);
  // Never leave a second, tab-scoped copy behind.
  store("session")?.removeItem(ATTENDANCE_STORAGE_KEY);
  recordAttendancePoint(value);
}

/**
 * One attendance percentage per day, so the results tab can draw the trend the
 * student is actually making. IMS reports only today's snapshot, so the history
 * starts the day the app is first used and never back-fills.
 */
export type AttendancePoint = { roll: string; date: string; percent: number };
export const ATTENDANCE_HISTORY_KEY = "nsutnest_ims_attendance_history";
const HISTORY_LIMIT = 60;

function recordAttendancePoint(payload: string): void {
  try {
    const parsed = JSON.parse(payload) as { roll?: string; subjects?: { held?: number; present?: number }[] };
    let held = 0;
    let present = 0;
    for (const subject of parsed.subjects ?? []) {
      held += subject.held ?? 0;
      present += subject.present ?? 0;
    }
    if (!parsed.roll || !held) return;
    const local = store("local");
    if (!local) return;
    const point: AttendancePoint = {
      roll: parsed.roll,
      date: new Date().toISOString().slice(0, 10),
      percent: Math.round((present / held) * 1000) / 10,
    };
    const kept = readAttendanceHistory().filter(
      (item) => item.roll === point.roll && item.date !== point.date,
    );
    local.setItem(ATTENDANCE_HISTORY_KEY, JSON.stringify([...kept, point].slice(-HISTORY_LIMIT)));
  } catch {
    // A history that cannot be written must not block the attendance itself.
  }
}

export function readAttendanceHistory(): AttendancePoint[] {
  try {
    const raw = store("local")?.getItem(ATTENDANCE_HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as AttendancePoint[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearStoredAttendance(): void {
  for (const kind of ["local", "session"] as const) {
    const target = store(kind);
    target?.removeItem(ATTENDANCE_STORAGE_KEY);
    target?.removeItem(LEGACY_ATTENDANCE_STORAGE_KEY);
  }
  store("local")?.removeItem(ATTENDANCE_HISTORY_KEY);
}

/** Tells every mounted page that the stored attendance changed. */
export function notifyAttendanceSync(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ATTENDANCE_SYNC_EVENT));
}

/**
 * The IMS profile and photograph, cached so the sidebar avatar survives page
 * navigation without another IMS round-trip. The photo is a data URL returned by
 * the server; the browser never receives IMS cookies. Cleared on logout.
 */
export type StoredImsProfile = {
  studentId: string;
  name: string;
  roll: string;
  photo: string | null;
  fields: { label: string; value: string }[];
  fetchedAt: string;
};

/** The saved IMS photograph (a data URL), or null when none is stored. */
export function readStoredPhoto(): string | null {
  try {
    const raw = readStoredProfile();
    return raw ? ((JSON.parse(raw) as { photo?: string | null }).photo ?? null) : null;
  } catch {
    return null;
  }
}

export function readStoredProfile(): string | null {
  try {
    return store("local")?.getItem(PROFILE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeStoredProfile(value: string): void {
  try {
    store("local")?.setItem(PROFILE_STORAGE_KEY, value);
  } catch {
    // A full quota must not stop the profile page from rendering this visit.
  }
}

export function clearStoredProfile(): void {
  try {
    store("local")?.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
}

/**
 * The timetable is public to this browser only: it is fetched with the IMS
 * session cookie on the server and cached here so the dashboard works offline
 * and does not crawl the portal on every visit.
 */
export function readStoredTimetable(): string | null {
  try {
    return store("local")?.getItem(TIMETABLE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeStoredTimetable(value: string): void {
  try {
    store("local")?.setItem(TIMETABLE_STORAGE_KEY, value);
  } catch {
    // A full quota keeps the live timetable on screen for this visit.
  }
}

export function clearStoredTimetable(): void {
  try {
    store("local")?.removeItem(TIMETABLE_STORAGE_KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
}

export function notifyTimetableSync(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TIMETABLE_SYNC_EVENT));
}

/** Tells the sidebar and profile page that the cached profile changed. */
export function notifyProfileSync(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_SYNC_EVENT));
}

/**
 * Asks the IMS gate to re-run sign-in and pull a fresh attendance snapshot.
 *
 * Only the gate (rendered once in the root layout) holds the CAPTCHA session and
 * the credential form, so a page cannot refresh attendance by itself: it fires
 * this event and the gate opens its sign-in dialog. The optional reason only
 * changes that dialog's wording — `print` is a profile printout waiting for a
 * session, everything else is a plain refresh.
 */
export function requestAttendanceRefresh(reason: "refresh" | "print" = "refresh"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ATTENDANCE_REFRESH_EVENT, { detail: reason }));
}

/** Reads the remembered IMS ID, migrating the pre-rename key when found. */
export function readRememberedImsId(): string | null {
  const local = store("local");
  if (!local) return null;
  const current = local.getItem(REMEMBERED_IMS_ROLL_KEY);
  if (current) return current;
  const legacy = local.getItem(LEGACY_REMEMBERED_IMS_ROLL_KEY);
  if (legacy) {
    local.setItem(REMEMBERED_IMS_ROLL_KEY, legacy);
    local.removeItem(LEGACY_REMEMBERED_IMS_ROLL_KEY);
  }
  return legacy;
}

export function writeRememberedImsId(value: string): void {
  const local = store("local");
  if (!local) return;
  local.setItem(REMEMBERED_IMS_ROLL_KEY, value);
  local.removeItem(LEGACY_REMEMBERED_IMS_ROLL_KEY);
}

export function clearRememberedImsId(): void {
  const local = store("local");
  if (!local) return;
  local.removeItem(REMEMBERED_IMS_ROLL_KEY);
  local.removeItem(LEGACY_REMEMBERED_IMS_ROLL_KEY);
}

/**
 * The IMS password, stored only when the student explicitly opts in.
 *
 * This is a plain-text credential in localStorage: readable by any script on
 * this origin and by anyone using the browser profile. It exists so a refresh
 * after the 20-minute IMS session lapses needs only a CAPTCHA, and it is wiped
 * on logout and whenever the checkbox is cleared.
 */
export function readRememberedPassword(): string | null {
  try {
    return store("local")?.getItem(REMEMBERED_PASSWORD_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeRememberedPassword(value: string): void {
  try {
    store("local")?.setItem(REMEMBERED_PASSWORD_KEY, value);
  } catch {
    // Private-mode or full storage: the student still signs in, just without prefill.
  }
}

export function clearRememberedPassword(): void {
  try {
    store("local")?.removeItem(REMEMBERED_PASSWORD_KEY);
  } catch {
    // Nothing stored means nothing to clear.
  }
}
