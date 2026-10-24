/**
 * Counts who is looking at the site right now.
 *
 * The browser sends a heartbeat carrying a random id it keeps in localStorage;
 * the server remembers that id and when it was last heard from. A viewer counts
 * as present while a heartbeat arrived inside the freshness window, so closing a
 * tab (or a laptop going to sleep) lets the number fall on its own instead of
 * needing an explicit "leave" call.
 *
 * This is deliberately dependency-free and kept in memory, in the same spirit as
 * lib/rate-limit.ts: on Vercel each serverless instance keeps its own map, so
 * the number reflects the viewers routed to that instance rather than a
 * campus-wide total. A shared store would be needed for a global figure.
 */

/**
 * How long a viewer counts as present after their last heartbeat.
 *
 * Chrome throttles timers in a hidden tab to roughly once a minute, so a
 * student who leaves NsutNest open in a background tab would drop out of the
 * count if the window were shorter than that. The window is therefore wider
 * than the browser's own throttling interval: a tab that is open still counts
 * as viewing, and a closed one fades out on its own.
 */
export const FRESHNESS_WINDOW_MS = 90_000;

/** Enough room for real traffic, bounded so a spoofed id cannot grow it forever. */
const MAX_VIEWERS = 20_000;

/** viewer id -> epoch ms of the last heartbeat. */
const viewers = new Map<string, number>();

/**
 * Viewer ids come from the browser, so they are checked before being used as a
 * map key: a short opaque token with no punctuation to abuse.
 */
export function isValidClientId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

/** Drops viewers whose heartbeat is older than the freshness window. */
function purge(now: number): void {
  for (const [id, lastSeen] of viewers) {
    if (now - lastSeen > FRESHNESS_WINDOW_MS) viewers.delete(id);
  }
  // Map iterates in insertion order, so the first keys are the oldest. Re-adding
  // an existing id keeps its original position, so the oldest entry is also the
  // one least likely to be a current viewer.
  while (viewers.size > MAX_VIEWERS) {
    const oldest = viewers.keys().next().value;
    if (oldest === undefined) break;
    viewers.delete(oldest);
  }
}

/** Records a heartbeat for one viewer and returns the current tally. */
export function recordHeartbeat(clientId: string, now: number = Date.now()): number {
  purge(now);
  viewers.set(clientId, now);
  return viewers.size;
}

/** The number of viewers seen inside the freshness window. */
export function liveViewerCount(now: number = Date.now()): number {
  purge(now);
  return viewers.size;
}

/** Clears the registry. Used by the offline checks. */
export function resetLiveViewers(): void {
  viewers.clear();
}
