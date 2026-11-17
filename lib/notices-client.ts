"use client";

/**
 * Shared browser-side state for IMS notices.
 *
 * The notice board is public data, so one payload feeds the sidebar badge, the
 * dashboard preview and the /notices page. It is cached in localStorage and
 * refreshed in the background (stale-while-revalidate), which keeps the list on
 * screen while offline instead of replacing it with an error.
 *
 * Read and pinned notice ids live next to it, also in localStorage. There is no
 * per-student notices backend, so this device is the only sensible home for that
 * state; clearing site data resets it.
 */

import { useEffect, useSyncExternalStore } from "react";

export type Notice = {
  /** Date exactly as printed on the board, "DD-MM-YYYY". */
  date: string;
  /** The same date as "YYYY-MM-DD", for sorting and <time>. */
  isoDate: string;
  title: string;
  publishedBy: string;
  department: string;
  /** Same-origin path that fetches the document through our proxy. */
  href: string;
};

export type NoticePayload = { notices: Notice[]; fetchedAt: number; source: string };
export type NoticeFilter = { mode: "unread" | "all"; department: string };

const CACHE_KEY = "nsutnest_notices_cache_v1";
const READ_KEY = "nsutnest_notices_read_v1";
const PIN_KEY = "nsutnest_notices_pinned_v1";
const FILTER_KEY = "nsutnest_notices_filter_v1";

type Store = {
  payload: NoticePayload | null;
  loading: boolean;
  error: string | null;
  /** True when the payload came from localStorage and a refresh failed. */
  usingCache: boolean;
  readIds: string[];
  pinnedIds: string[];
  filter: NoticeFilter;
};

const SERVER_SNAPSHOT: Store = {
  payload: null,
  loading: false,
  error: null,
  usingCache: false,
  readIds: [],
  pinnedIds: [],
  filter: { mode: "all", department: "All" },
};

let snapshot: Store = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let booted = false;
let inFlight: Promise<void> | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function publish(patch: Partial<Store>): void {
  snapshot = { ...snapshot, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function localStore(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStore()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStore()?.setItem(key, JSON.stringify(value));
  } catch {
    // A full quota must not stop rendering; the change simply lasts this visit.
  }
}

/**
 * A short, stable id for a notice. The IMS document href contains a rotating
 * session token, so the id is derived from the notice's content instead; the
 * same circular keeps its id (and its read/pinned state) across refetches.
 */
export function noticeId(notice: Notice): string {
  const key = `${notice.isoDate}|${notice.title}|${notice.publishedBy}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function noticeIds(notices: Notice[]): string[] {
  return notices.map(noticeId);
}

export function countUnread(notices: Notice[], readIds: string[]): number {
  const read = new Set(readIds);
  return notices.reduce((total, notice) => total + (read.has(noticeId(notice)) ? 0 : 1), 0);
}

export async function refreshNotices(): Promise<void> {
  if (inFlight) return inFlight;
  publish({ loading: true });
  inFlight = (async () => {
    try {
      const response = await fetch("/api/notices", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Partial<NoticePayload> & { error?: string };
      if (!response.ok) throw new Error(body.error || `The notice board answered HTTP ${response.status}.`);
      if (!Array.isArray(body.notices)) throw new Error("The notice board returned an unexpected response.");
      const payload: NoticePayload = {
        notices: body.notices,
        fetchedAt: typeof body.fetchedAt === "number" ? body.fetchedAt : Date.now(),
        source: typeof body.source === "string" ? body.source : "",
      };
      writeJSON(CACHE_KEY, payload);
      publish({ payload, loading: false, error: null, usingCache: false });
    } catch (failure) {
      publish({
        loading: false,
        error: failure instanceof Error ? failure.message : "Could not load notices.",
        usingCache: Boolean(snapshot.payload),
      });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function bootstrap(): void {
  if (booted || typeof window === "undefined") return;
  booted = true;

  const cached = readJSON<NoticePayload | null>(CACHE_KEY, null);
  const readIds = readJSON<string[]>(READ_KEY, []);
  const pinnedIds = readJSON<string[]>(PIN_KEY, []);
  const filter = readJSON<NoticeFilter>(FILTER_KEY, { mode: "all", department: "All" });
  const payload = cached && Array.isArray(cached.notices) ? cached : null;

  publish({
    payload,
    readIds: Array.isArray(readIds) ? readIds : [],
    pinnedIds: Array.isArray(pinnedIds) ? pinnedIds : [],
    filter: {
      mode: filter?.mode === "unread" ? "unread" : "all",
      department: typeof filter?.department === "string" && filter.department ? filter.department : "All",
    },
    loading: !payload,
  });

  void refreshNotices();
}

/** Subscribes a component to the shared notices store. */
export function useNoticeStore(): Store {
  const value = useSyncExternalStore(subscribe, () => snapshot, () => SERVER_SNAPSHOT);
  useEffect(() => {
    bootstrap();
  }, []);
  return value;
}

/** Unread count for the sidebar and bottom-tab badge. */
export function useUnreadNoticeCount(): number {
  const store = useNoticeStore();
  if (!store.payload) return 0;
  return countUnread(store.payload.notices, store.readIds);
}

export function markNoticeRead(id: string): void {
  if (!id || snapshot.readIds.includes(id)) return;
  const readIds = [...snapshot.readIds, id];
  writeJSON(READ_KEY, readIds);
  publish({ readIds });
}

export function markAllNoticesRead(notices: Notice[]): void {
  const readIds = new Set(snapshot.readIds);
  for (const notice of notices) readIds.add(noticeId(notice));
  const next = [...readIds];
  writeJSON(READ_KEY, next);
  publish({ readIds: next });
}

export function togglePinnedNotice(id: string): void {
  if (!id) return;
  const pinnedIds = snapshot.pinnedIds.includes(id)
    ? snapshot.pinnedIds.filter((current) => current !== id)
    : [...snapshot.pinnedIds, id];
  writeJSON(PIN_KEY, pinnedIds);
  publish({ pinnedIds });
}

export function setNoticeFilter(patch: Partial<NoticeFilter>): void {
  const filter = { ...snapshot.filter, ...patch };
  writeJSON(FILTER_KEY, filter);
  publish({ filter });
}

/* ------------------------------------------------------------------ */
/* Date helpers used by the list, the preview and the detail page      */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000;

function daysSince(isoDate: string, now = new Date()): number | null {
  const published = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(published)) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - published) / DAY_MS);
}

/** "Today", "Yesterday", "3 days ago" — the exact date stays in the title. */
export function relativeNoticeDate(isoDate: string, now = new Date()): string {
  const days = daysSince(isoDate, now);
  if (days === null) return isoDate;
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "1 month ago";
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} year${days >= 730 ? "s" : ""} ago`;
}

export const NOTICE_GROUPS = ["Today", "Yesterday", "This week", "Earlier"] as const;
export type NoticeGroup = (typeof NOTICE_GROUPS)[number];

export function noticeGroup(isoDate: string, now = new Date()): NoticeGroup {
  const days = daysSince(isoDate, now);
  if (days === null) return "Earlier";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return "Earlier";
}

export function exactNoticeDate(isoDate: string): string {
  const parsed = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed)) return isoDate;
  return new Date(parsed).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Title of the notice document; used by the detail page's source button. */
export function noticeSourceLabel(): string {
  return "Open original PDF";
}
