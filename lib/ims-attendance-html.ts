import { load } from 'cheerio';
import { subjectNamesFromLines } from './attendance';

/**
 * Server-side helpers that turn the IMS attendance HTML into subject names.
 *
 * The portal prints its legend (`MEMEC304-Thermal Engineering-I`) sometimes inside
 * the attendance table and sometimes as free text under it, so both the table cells
 * and every visible text line of the page are scanned.
 */

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

/** Every visible text line of a page, with block/`<br>` boundaries kept. */
export function subjectNameLinesFromHtml(html: string): string[] {
  const $ = load(html);
  $('script, style, noscript').remove();
  const withBreaks = ($.root().html() ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|tr|table|li|ul|ol|h[1-6]|td|th|font|span|section|option)>/gi, '\n');
  const text = load(`<body>${withBreaks}</body>`)('body').text();
  return text.split(/\n+/).map(clean).filter(Boolean);
}

/** Subject code→name pairs exposed by the returned pages, tables and free text alike. */
export function subjectNamesFromPages(
  pages: { html: string }[],
  tables: string[][][],
  subjectCodes: string[],
): Record<string, string> {
  const lines = pages.flatMap(page => subjectNameLinesFromHtml(page.html));
  for (const table of tables) {
    for (const row of table) {
      for (let index = 0; index < row.length; index++) {
        lines.push(row[index]);
        if (index + 1 < row.length) lines.push(`${clean(row[index])}-${clean(row[index + 1])}`);
      }
    }
  }
  return subjectNamesFromLines(lines, subjectCodes);
}

/** Subject codes as printed in the attendance table header (`Days`, then one column per subject). */
export function subjectCodesFromTables(tables: string[][][]): string[] {
  for (const table of tables) {
    const header = table.find(row => clean(row[0] ?? '').toLowerCase() === 'days');
    if (header) return header.slice(1).map(clean).filter(Boolean);
  }
  return [];
}
