import { load } from 'cheerio';

/**
 * Parses the table behind IMS → My Activities → TIME TABLE → My Timetable.
 *
 * The portal returns one table: a title row, a T1–T13 header row, then Mon–Sat.
 * Empty periods are empty cells, and a busy period can hold several entries
 * separated by <hr> (different lab/tutorial groups). Every entry is reduced to
 * the code, section, room and group markers the dashboard needs; the student's
 * name is deliberately not kept.
 */

export type TimetableDay = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

export type TimetableEntryKind = 'lecture' | 'tutorial' | 'lab' | 'activity';

export type TimetableEntry = {
  code: string;
  kind: TimetableEntryKind;
  section: string | null;
  room: string | null;
  group: string | null;
  tutorial: string | null;
  batch: string | null;
  semester: string | null;
  raw: string;
};

export type TimetableSlot = {
  day: TimetableDay;
  period: string;
  /** Normalised 24-hour clock, e.g. "08:00". */
  start: string;
  end: string;
  startMinutes: number;
  endMinutes: number;
  entries: TimetableEntry[];
};

export type ParsedTimetable = {
  academicYear: string | null;
  semester: string | null;
  slots: TimetableSlot[];
};

export type TimetablePayload = ParsedTimetable & {
  roll: string;
  fetchedAt: string;
};

export const TIMETABLE_DAY_ORDER: TimetableDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_ALIASES: Record<string, TimetableDay> = {
  mon: 'Mon', monday: 'Mon',
  tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
  wed: 'Wed', weds: 'Wed', wednesday: 'Wed',
  thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu',
  fri: 'Fri', friday: 'Fri',
  sat: 'Sat', saturday: 'Sat',
};

function clean(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Cheerio's .text() concatenates "T1<br>08:00" as "T108:00"; keep the break. */
function cellText(html: string) {
  return clean(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function parsePeriod(text: string) {
  const match = clean(text).match(/\bT\s*(\d{1,2})\b[\s\S]*?(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/i);
  if (!match) return null;
  return {
    label: `T${Number(match[1])}`,
    startHour: Number(match[2]),
    startMinute: Number(match[3]),
    endHour: Number(match[4]),
    endMinute: Number(match[5]),
  };
}

function clock(minutes: number) {
  const h = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

function parseEntry(lines: string[]): TimetableEntry | null {
  const first = lines[0] ?? '';
  const codeMatch = first.match(/^([A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*)\b/i);
  if (!codeMatch) return null;

  const joined = lines.join(' · ');
  const section = joined.match(/(?:^|[-\s,])Sec(?:tion)?\s*[:#-]?\s*([A-Za-z0-9]+)/i)?.[1] ?? null;
  const tutorial = joined.match(/(?:Tut|Tutorial)\s*[-:#]?\s*([0-9A-Za-z]+)/i)?.[1] ?? null;
  const group = joined.match(/(?:Grp|Group)\s*[-:#]?\s*([0-9A-Za-z]+)/i)?.[1] ?? null;
  const batch = joined.match(/(?:Bat|Batch)\s*[-:#]?\s*([0-9A-Za-z]+)/i)?.[1] ?? null;
  const semester = joined.match(/(?:Sem|Semester)\s*[-:#]?\s*([0-9A-Za-z]+)/i)?.[1] ?? null;
  const room = joined.match(/Room\s*[:#-]\s*(.+?)(?:\s*·\s*(?:Sem|Sec|Tut|Grp|Bat|Room)\b|$)/i)?.[1]?.trim() ?? null;

  return {
    code: codeMatch[1].toUpperCase(),
    kind: group ? 'lab' : tutorial ? 'tutorial' : batch ? 'activity' : 'lecture',
    section,
    room,
    group,
    tutorial,
    batch,
    semester,
    raw: joined,
  };
}

function parseCellEntries(html: string): TimetableEntry[] {
  const entries: TimetableEntry[] = [];
  const seen = new Set<string>();

  // The portal uses <hr> between two classes in the same period and <br> inside
  // one class. Split on <hr> first, then turn each <br> into a line.
  for (const segment of html.split(/<hr\b[^>]*>/i)) {
    if (!segment.trim()) continue;
    const $segment = load(`<div>${segment}</div>`);
    $segment('br').replaceWith('\n');
    const lines = $segment.root().text()
      .split('\n')
      .map(clean)
      .filter(Boolean);
    const entry = parseEntry(lines);
    if (!entry) continue;
    const key = [
      entry.code, entry.kind, entry.section, entry.room, entry.group,
      entry.tutorial, entry.batch, entry.semester,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  return entries;
}

export function parseImsTimetable(html: string): ParsedTimetable {
  const $ = load(html);
  const bodyText = clean($('body').text());
  const yearMatch = bodyText.match(/Academic\s+Year\s*[:\-]?\s*(20\d{2}\s*[-/–]\s*\d{2,4})/i);
  const semesterMatch = bodyText.match(/Semester\s*[:\-]?\s*([1-8])/i);
  const academicYear = yearMatch ? yearMatch[1].replace(/\s+/g, '') : null;
  const semester = semesterMatch?.[1] ?? null;

  type HeaderCell = { index: number; label: string; start: number; end: number };
  let headerCells: HeaderCell[] | null = null;
  let headerRowIndex = -1;
  let headerTable: ReturnType<typeof $> | null = null;

  const tables = $('table').toArray();
  outer: for (const table of tables) {
    const rows = $(table).find('tr').toArray();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const cells = $(rows[rowIndex]).find('td,th').toArray();
      const parsed = cells
        .map((cell, index) => ({ index, period: parsePeriod(cellText($(cell).html() ?? '')) }))
        .filter((cell): cell is { index: number; period: NonNullable<ReturnType<typeof parsePeriod>> } => cell.period !== null);
      if (parsed.length < 5) continue;

      let previousStart = -1;
      headerCells = parsed.map(({ index, period }) => {
        let start = period.startHour * 60 + period.startMinute;
        // IMS omits AM/PM. The sequence starts at 08:00 and rolls into the
        // afternoon/evening; each slot must start after the previous one.
        while (start <= previousStart) start += 12 * 60;
        let end = period.endHour * 60 + period.endMinute;
        while (end <= start) end += 12 * 60;
        previousStart = start;
        return { index, label: period.label, start, end };
      });
      headerRowIndex = rowIndex;
      headerTable = $(table);
      break outer;
    }
  }

  if (!headerCells?.length) {
    throw new Error('The IMS timetable page did not contain a T1–T13 period header.');
  }
  if (headerRowIndex < 0) {
    throw new Error('The IMS timetable period header could not be read.');
  }

  const slots: TimetableSlot[] = [];
  const rowsAfterHeader = headerTable
    ? headerTable.find('tr').toArray().slice(headerRowIndex + 1)
    : [];

  for (const row of rowsAfterHeader) {
    const cells = $(row).find('td,th').toArray();
    if (!cells.length) continue;
    const day = DAY_ALIASES[clean($(cells[0]).text()).toLowerCase().slice(0, 10)]
      ?? DAY_ALIASES[clean($(cells[0]).text()).toLowerCase().slice(0, 3)];
    if (!day) continue;

    for (const period of headerCells) {
      const cell = cells[period.index];
      if (!cell) continue;
      const entries = parseCellEntries($(cell).html() ?? '');
      if (!entries.length) continue;
      slots.push({
        day,
        period: period.label,
        start: clock(period.start),
        end: clock(period.end),
        startMinutes: period.start,
        endMinutes: period.end,
        entries,
      });
    }
  }

  if (!slots.length) {
    throw new Error('IMS opened the timetable, but no class rows could be parsed. The portal table may have changed.');
  }

  slots.sort((a, b) =>
    TIMETABLE_DAY_ORDER.indexOf(a.day) - TIMETABLE_DAY_ORDER.indexOf(b.day)
    || a.startMinutes - b.startMinutes
    || a.period.localeCompare(b.period, undefined, { numeric: true }),
  );

  return { academicYear, semester, slots };
}
