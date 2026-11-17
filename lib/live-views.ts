/**
 * Counts how many people have visited the site.
 *
 * The browser sends a heartbeat carrying the random id it keeps in localStorage;
 * the server remembers every id it has seen and answers with how many distinct
 * ids that is. A returning browser keeps its id, so one person is counted once
 * no matter how often they reload — the number only moves when somebody new
 * turns up.
 *
 * This is deliberately dependency-free and kept in memory, in the same spirit as
 * lib/rate-limit.ts: on Vercel each serverless instance keeps its own set, so
 * the figure is the visitors that instance has seen since it started rather
 * than a campus-wide all-time total, and a restart starts it again. A shared
 * store would be needed for a permanent figure.
 */

/** Enough room for real traffic, bounded so a spoofed id cannot grow it forever. */
const MAX_VISITORS = 50_000;

/** Every visitor id this instance has seen, oldest first. */
const visitors = new Set<string>();

/**
 * Visitor ids come from the browser, so they are checked before being used as a
 * set member: a short opaque token with no punctuation to abuse.
 */
export function isValidClientId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

/** Keeps the set inside its cap, dropping the ids that arrived first. */
function trim(): void {
  // Set iterates in insertion order, so the first value is the oldest. Adding an
  // id that is already present keeps its original position, so the oldest entry
  // is also the one least likely to belong to a visitor right now.
  while (visitors.size > MAX_VISITORS) {
    const oldest = visitors.values().next().value;
    if (oldest === undefined) break;
    visitors.delete(oldest);
  }
}

/**
 * Records one visitor and returns the total. Recording the same id twice does
 * not raise the number, so a reload or a second heartbeat is a no-op.
 */
export function recordVisit(clientId: string): number {
  visitors.add(clientId);
  trim();
  return visitors.size;
}

/** How many distinct people have visited this instance since it started. */
export function visitCount(): number {
  return visitors.size;
}

/** Clears the registry. Used by the offline checks. */
export function resetVisitors(): void {
  visitors.clear();
}
