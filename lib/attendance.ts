/**
 * Attendance subject-name helpers.
 *
 * NSUT IMS prints the subject legend under the attendance table as one line per
 * subject, e.g. `MEMEC304-Thermal Engineering-I`. Different tabs of the portal
 * scatter the same legend across table cells, plain text lines or `<br>`-separated
 * blocks, so the extractors below accept any of those shapes. Everything here is
 * pure string work so it can run in the browser bundle as well as on the server;
 * the HTML→lines step lives in the API route (it needs cheerio).
 */

/** One live-IMS line/cell already reduced to a code plus whatever follows it. */
export type SubjectNameMatch = { code: string; name: string };

/**
 * Course codes whose legends have been observed on the live IMS portal. Used only
 * as a last resort when a page does not include its subject legend.
 */
export const SUBJECT_NAME_FALLBACK: Record<string, string> = {
  FCFO0301: 'Community Internship',
  MEMEC302: 'Manufacturing Processes-I',
  MEMEC303: 'Strength of Materials',
  MEMEC304: 'Thermal Engineering-I',
  MEMEC305: 'Fluid Mechanics & Machines',
  MEMTC301: 'Numerical Methods & Computation',
  VAPD0304: 'NCC',
};

/** A portal subject code: an uppercase letter followed by uppercase letters/digits. */
const CODE_PATTERN = /\b([A-Z][A-Z0-9]{2,})\s*[-–—:]\s*/g;

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function findCode(codes: string[], candidate: string): string | null {
  const upper = candidate.toUpperCase();
  return codes.find(code => code.trim().toUpperCase() === upper) ?? null;
}

/**
 * Drops any trailing subject code (and the separators around it) that the portal
 * appends to a subject name, e.g. `Manufacturing Processes-I MEMEC302`.
 */
export function cleanAttendanceSubjectName(name: string, subjectCodes: string[]): string {
  const normalized = collapse(name);
  const upperName = normalized.toUpperCase();
  let end = normalized.length;

  for (const code of subjectCodes) {
    const index = upperName.indexOf(code.trim().toUpperCase());
    if (index >= 0) end = Math.min(end, index);
  }

  return normalized.slice(0, end).replace(/[\s\-–,;|]+$/, '').trim();
}

/** True when the text looks like a readable subject name rather than a portal remark. */
function looksLikeSubjectName(name: string): boolean {
  if (!/^[A-Za-z]/.test(name)) return false;
  if (/[<>]/.test(name)) return false;
  // Remark lines such as `MEMEC304--->27-07-2026--->CS-REGISTRATION` must not win.
  if (/\d{2}[-/]\d{2}[-/]\d{2,4}/.test(name)) return false;
  return /[A-Za-z]{3,}/.test(name);
}

/**
 * Reads one `CODE<separator>Subject name` string. Returns null when the text is a
 * remark, a date row or a code the student is not enrolled in.
 */
export function subjectNameFromText(text: string, subjectCodes: string[]): SubjectNameMatch | null {
  const normalized = collapse(text);
  const match = normalized.match(/^([A-Z][A-Z0-9]{2,})\s*(?:[-–—:]\s*|\(\s*|\s+)(.+?)\s*\)?$/);
  if (!match) return null;
  const code = findCode(subjectCodes, match[1]);
  if (!code) return null;

  // A cell that holds only the code has no name to give.
  const name = cleanAttendanceSubjectName(match[2], subjectCodes);
  if (!name || !looksLikeSubjectName(name)) return null;
  return { code, name };
}

/**
 * Reads every `CODE-Name` pair on a single line, including lines that pack
 * several subjects together (`MEMEC302-X MEMEC303-Y`).
 */
export function subjectNamesFromLine(line: string, subjectCodes: string[]): SubjectNameMatch[] {
  const normalized = collapse(line);
  if (!normalized) return [];

  const marks: { index: number; code: string; end: number }[] = [];
  CODE_PATTERN.lastIndex = 0;
  for (const match of normalized.matchAll(CODE_PATTERN)) {
    const code = findCode(subjectCodes, match[1]);
    if (code && match.index !== undefined) marks.push({ index: match.index, code, end: match.index + match[0].length });
  }

  if (!marks.length) {
    const single = subjectNameFromText(normalized, subjectCodes);
    return single ? [single] : [];
  }

  const found: SubjectNameMatch[] = [];
  for (let index = 0; index < marks.length; index++) {
    const mark = marks[index];
    const stop = index + 1 < marks.length ? marks[index + 1].index : normalized.length;
    const tail = collapse(normalized.slice(mark.end, stop));
    if (!tail) continue;
    const name = cleanAttendanceSubjectName(tail, subjectCodes);
    if (!name || !looksLikeSubjectName(name)) continue;
    if (found.some(existing => existing.code === mark.code)) continue;
    found.push({ code: mark.code, name });
  }
  return found;
}

/** Merges the name pairs found across many lines/cells into a code→name map. */
export function subjectNamesFromLines(lines: string[], subjectCodes: string[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const line of lines) {
    for (const match of subjectNamesFromLine(line, subjectCodes)) {
      if (!names[match.code]) names[match.code] = match.name;
    }
  }
  return names;
}

/** Known course name for a code, when the portal did not supply one. */
export function fallbackSubjectName(code: string): string | null {
  return SUBJECT_NAME_FALLBACK[code.trim().toUpperCase()] ?? null;
}

/**
 * Picks the best display name for a subject: the live portal name when it carries
 * real words, otherwise the known course name, otherwise the code itself.
 */
export function resolveSubjectName(code: string, name: string | undefined, subjectCodes: string[]): string {
  const cleaned = cleanAttendanceSubjectName(name ?? '', subjectCodes);
  if (cleaned && looksLikeSubjectName(cleaned) && cleaned.toUpperCase() !== code.trim().toUpperCase()) return cleaned;
  return fallbackSubjectName(code) ?? (cleaned || code);
}

/**
 * Rewrites a payload's subjects with their best known names. Safe to run on
 * cached or freshly fetched attendance on either the server or the client.
 */
export function withResolvedSubjectNames<T extends { code: string; name?: string }>(subjects: T[]): T[] {
  const codes = subjects.map(subject => subject.code);
  return subjects.map(subject => ({ ...subject, name: resolveSubjectName(subject.code, subject.name, codes) }));
}
