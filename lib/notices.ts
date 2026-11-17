/**
 * Reads NSUT's IMS notice board and turns it into structured notices.
 *
 * The board (https://www.imsnsit.org/imsnsit/notifications.php) is a plain PHP
 * table: one row per notice holding a DD-MM-YYYY date and a link whose text is the
 * subject. Each link points at an encrypted `plum_url.php` token, and the
 * university only serves that token when the request carries a Referer from the
 * IMS site itself - a direct link from anywhere else comes back as "Invalid
 * operation" (or "sorry"), still as HTTP 200. The tokens are durable, so a list
 * fetched earlier stays usable and can be cached.
 *
 * `app/api/notice-file` re-issues the request server-side with that Referer, and
 * every notice links through the proxy rather than to imsnsit.org directly.
 */

export const IMS_ORIGIN = "https://www.imsnsit.org";
export const IMS_NOTICES_URL = `${IMS_ORIGIN}/imsnsit/notifications.php`;
export const IMS_ATTACH_PREFIX = `${IMS_ORIGIN}/imsnsit/plum_url.php?`;

export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type Notice = {
  /** Date exactly as printed on the board, "DD-MM-YYYY". */
  date: string;
  /** The same date as "YYYY-MM-DD", for <time> and for sorting. */
  isoDate: string;
  title: string;
  publishedBy: string;
  department: string;
  /** Same-origin path that fetches the document through our proxy. */
  href: string;
};

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&emsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");

/** Plain text for one cell, with a <br> treated as a space. */
const stripTags = (s: string) =>
  decodeEntities(s.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

// JavaScript has no inline (?i) / (?s) flags, so case-insensitivity is a flag and
// "match anything including newlines" is [\s\S] rather than the `s` flag.
const TABLE_PATTERN = /<table\b[\s\S]*?<\/table>/gi;
const NOTICE_ROW = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
const NOTICE_CELL = /<td\b[^>]*>[\s\S]*?<\/td>/gi;
/** Deliberately not global: .exec is used on a single cell, so lastIndex must stay put. */
const NOTICE_LINK = /<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/i;
const PRINTED_DATE = /^(\d{2})-(\d{2})-(\d{4})/;

export function parseNotices(html: string): Notice[] {
  // The board has two tables; the notice table is the one headed "Date | Subject".
  const tables = html.match(TABLE_PATTERN) ?? [];
  const table = tables.find((t) => />\s*Date\s*</i.test(t) && />\s*Subject\s*</i.test(t)) ?? "";

  const notices: Notice[] = [];
  for (const row of table.match(NOTICE_ROW) ?? []) {
    const [dateCell, subjectCell] = row.match(NOTICE_CELL) ?? [];
    if (!dateCell || !subjectCell) continue; // header row, or a row that is not a notice

    const printed = stripTags(dateCell).match(PRINTED_DATE);
    if (!printed) continue; // the spacer row between two notices
    const [, day, month, year] = printed;
    if (!day || !month || !year) continue;

    const anchor = NOTICE_LINK.exec(subjectCell);
    const linkUrl = anchor?.[1];
    const linkText = anchor?.[2] ?? "";
    if (!anchor || !linkUrl || !linkUrl.startsWith(IMS_ATTACH_PREFIX)) continue;

    // The "Published By:" line sits after the link, inside the same cell.
    const publishedBy = stripTags(subjectCell.slice((anchor.index ?? 0) + anchor[0].length))
      .replace(/^Published\s*By:?\s*/i, "")
      .trim();

    notices.push({
      date: `${day}-${month}-${year}`,
      isoDate: `${year}-${month}-${day}`,
      title: stripTags(linkText),
      publishedBy,
      // The board writes "Published By: NAME, DESIGNATION, DEPARTMENT".
      department: publishedBy.includes(",")
        ? publishedBy.slice(publishedBy.lastIndexOf(",") + 1).trim()
        : "",
      href: `/api/notice-file?u=${encodeURIComponent(linkUrl)}`,
    });
  }
  return notices;
}
