const DAY_MS = 86_400_000;

/** A notice is flagged NEW while its published date is less than three days old. */
export function isRecentNotice(isoDate: string): boolean {
  const published = Date.parse(`${isoDate}T00:00:00Z`);
  return !Number.isNaN(published) && Date.now() - published < 3 * DAY_MS;
}
