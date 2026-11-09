"use client";

/**
 * The total website visits counter (one visit per browser tab session).
 *
 * The browser keeps a random id in localStorage and registers one visit per
 * sessionStorage session. Subsequent polls read the shared Redis total.
 *
 * The id is anonymous and never leaves the browser otherwise: it is a random
 * token, not a roll number, and it is only used to tell one browser from
 * another, so a reload does not count the same person twice.
 */

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { LIVE_VIEW_CLIENT_ID_KEY } from "../lib/app-storage";

/** How often the browser asks the server for the current total. */
const HEARTBEAT_MS = 15_000;

/**
 * A stable random id for this browser. It is generated once and kept in
 * localStorage so a reload does not look like a new visitor. Private-mode
 * storage failures fall back to a per-session id, which merely makes the count
 * slightly less accurate.
 */
function readClientId(): string {
  try {
    const existing = window.localStorage.getItem(LIVE_VIEW_CLIENT_ID_KEY);
    if (existing) return existing;
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    const id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(LIVE_VIEW_CLIENT_ID_KEY, id);
    return id;
  } catch {
    return `anon${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

const LIVE_VIEW_CACHE_KEY = "nsutnest:cached-views-total";

function readCachedLiveViews(): number | null {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(LIVE_VIEW_CACHE_KEY) : null;
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeCachedLiveViews(total: number) {
  try {
    if (typeof window !== "undefined" && Number.isFinite(total) && total > 0) {
      window.localStorage.setItem(LIVE_VIEW_CACHE_KEY, String(total));
    }
  } catch {}
}

/**
 * How many website visits have been recorded so far.
 *
 * Returns null until the first answer arrives so the caller can show a
 * placeholder instead of a misleading "0".
 */
export function useLiveViewCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const cached = readCachedLiveViews();
    if (cached !== null) setCount(cached);

    const clientId = readClientId();

    async function refresh(register = false) {
      try {
        const res = await fetch("/api/live-views", {
          method: register ? "POST" : "GET",
          ...(register ? {
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ clientId }),
          } : {}),
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { count?: number };
        if (active && typeof body.count === "number") {
          setCount(body.count);
          writeCachedLiveViews(body.count);
        }
      } catch {
        // Offline or the route is unreachable: keep the last number on screen.
      }
    }

    const SESSION_KEY = "nsutnest:visit-registered";
    let register = true;
    try { register = window.sessionStorage.getItem(SESSION_KEY) !== "1"; } catch {}
    async function initialRefresh() {
      try {
        const res = await fetch("/api/live-views", {
          method: register ? "POST" : "GET",
          headers: register ? { "content-type": "application/json" } : undefined,
          body: register ? JSON.stringify({ clientId, registerVisit: true }) : undefined,
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = await res.json() as { count?: number };
        if (active && typeof body.count === "number") {
          setCount(body.count);
          writeCachedLiveViews(body.count);
        }
        if (register) { try { window.sessionStorage.setItem(SESSION_KEY, "1"); } catch {} }
      } catch {}
    }
    void initialRefresh();
    const timer = window.setInterval(() => { void refresh(); }, HEARTBEAT_MS);

    // Coming back to the tab refreshes the tally straight away rather than
    // waiting out the rest of the interval.
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return count;
}

/**
 * The counter as it appears in the top bar: total browsing sessions.
 */
export function LiveViewCount() {
  const count = useLiveViewCount();

  if (count === null) return null;

  return (
    <span className="liveViews" title="Total website visits (one per browsing session)" suppressHydrationWarning>
      <Users size={15} />
      <b suppressHydrationWarning>{count.toLocaleString("en-IN")}</b>
      <span>total visits</span>
    </span>
  );
}
