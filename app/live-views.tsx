"use client";

/**
 * The live "students viewing now" counter.
 *
 * The browser keeps one random id in localStorage and posts it as a heartbeat
 * every few seconds. The server answers with the current tally, so the number
 * on screen is the server's view of who is online right now rather than a
 * figure baked into the page.
 *
 * The id is anonymous and never leaves the browser otherwise: it is a random
 * token, not a roll number, and it is only used to tell one tab from another.
 */

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { LIVE_VIEW_CLIENT_ID_KEY } from "../lib/app-storage";

/** How often the browser tells the server it is still here. */
const HEARTBEAT_MS = 15_000;

/**
 * A stable random id for this browser. It is generated once and kept in
 * localStorage so a reload does not look like a second visitor. Private-mode
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

/**
 * Counts the students viewing the site right now.
 *
 * Returns null until the first answer arrives so the caller can show a
 * placeholder instead of a misleading "0".
 */
export function useLiveViewCount(): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const clientId = readClientId();

    async function beat() {
      try {
        const res = await fetch("/api/live-views", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId }),
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as { count?: number };
        if (active && typeof body.count === "number") setCount(body.count);
      } catch {
        // Offline or the route is unreachable: keep the last number on screen.
      }
    }

    void beat();
    const timer = window.setInterval(() => { void beat(); }, HEARTBEAT_MS);

    // Coming back to the tab refreshes the tally straight away rather than
    // waiting out the rest of the heartbeat interval.
    const onFocus = () => { void beat(); };
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
 * The counter as it appears in the top bar: how many students are on the site
 * right now.
 */
export function LiveViewCount() {
  const count = useLiveViewCount();

  return (
    <span className="liveViews" title="Students viewing NsutNest right now">
      <Eye size={15} />
      <b>{count === null ? "—" : count}</b>
      <span>viewing now</span>
    </span>
  );
}
