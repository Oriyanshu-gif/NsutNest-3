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
}

export function clearStoredAttendance(): void {
  for (const kind of ["local", "session"] as const) {
    const target = store(kind);
    target?.removeItem(ATTENDANCE_STORAGE_KEY);
    target?.removeItem(LEGACY_ATTENDANCE_STORAGE_KEY);
  }
}

/** Tells every mounted page that the stored attendance changed. */
export function notifyAttendanceSync(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ATTENDANCE_SYNC_EVENT));
}

/**
 * Asks the IMS gate to re-run sign-in and pull a fresh attendance snapshot.
 *
 * Only the gate (rendered once in the root layout) holds the CAPTCHA session and
 * the credential form, so a page cannot refresh attendance by itself: it fires
 * this event and the gate opens its "Refresh IMS attendance" dialog.
 */
export function requestAttendanceRefresh(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ATTENDANCE_REFRESH_EVENT));
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
