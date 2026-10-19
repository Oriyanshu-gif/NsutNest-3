import { resolveSubjectName, subjectNameFromText } from './attendance';

/**
 * Turns the IMS attendance tables into the payload the app stores and renders.
 *
 * Subject names are resolved in three passes: names handed in from the page text
 * (`pageNames`, where the portal prints its legend), names found inside the table
 * cells, and finally the known course-name fallback in `lib/attendance`.
 */

function clean(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export type ParsedAttendanceSubject = {
  code: string;
  name: string;
  held: number;
  absent: number;
  present: number;
  percent: number;
  canSkip: number;
  mustAttend: number;
};

export type ParsedAttendance = {
  name: string;
  roll: string;
  semester: string;
  subjects: ParsedAttendanceSubject[];
  daily: { date: string; values: Record<string, string> }[];
  statusLegend: Record<string, string>;
  attendanceLegend: Record<string, 'present' | 'absent'>;
  syncedAt: string;
};

export function attendanceDate(label: string, academicYear: string): string {
  const match = label.match(/^([A-Za-z]{3})-(\d{1,2})$/);
  const yearMatch = academicYear.match(/\b(20\d{2})\s*[-/–]\s*(20\d{2}|\d{2})\b/);
  if (!match || !yearMatch) return label;
  const month = new Date(`${match[1]} 1, 2000`).getMonth();
  if (Number.isNaN(month)) return label;
  const startYear = Number(yearMatch[1]);
  let endYear = Number(yearMatch[2]);
  if (yearMatch[2].length === 2) endYear += Math.floor(startYear / 100) * 100;
  if (endYear < startYear) endYear += 100;
  return `${month >= 6 ? startYear : endYear}-${String(month + 1).padStart(2, '0')}-${match[2].padStart(2, '0')}`;
}

export function parseAttendance(
  tables: string[][][],
  academicYear: string,
  fallbackRoll = '',
  pageNames: Record<string, string> = {},
): ParsedAttendance {
  let subjectCodes: string[] = [];
  const overallRows: Record<string, string[]> = {};
  const daily: { date: string; values: string[] }[] = [];
  let studentLine = '';
  let footerText = '';
  const subjectNameRows: string[][] = [];
  for (const table of tables) {
    const flat = table.flat().join(' ');
    subjectNameRows.push(...table);
    // Keep identity metadata separate from the full attendance table. Flattening
    // the entire table here can accidentally carry every date/subject cell into
    // the student identity line and any downstream UI that displays it.
    const identityRow = table.find(row => /Name\s*:/i.test(row.join(' ')) && /Semester\s*:/i.test(row.join(' ')));
    if (identityRow) studentLine = clean(identityRow.join(' '));
    const headerIndex = table.findIndex(row => clean(row[0] ?? '').toLowerCase() === 'days');
    if (headerIndex >= 0) {
      subjectCodes = table[headerIndex].slice(1).map(clean).filter(Boolean);
      for (const row of table.slice(headerIndex + 1)) {
        const label = clean(row[0] ?? '');
        if (/^Overall\s+Class/i.test(label)) overallRows.class = row.slice(1);
        else if (/^Overall\s+Absent/i.test(label)) overallRows.absent = row.slice(1);
        else if (/^Overall\s+Present/i.test(label)) overallRows.present = row.slice(1);
        else if (/^Overall\s*\(%\)/i.test(label) || /^Overall\s*%/i.test(label)) overallRows.percent = row.slice(1);
        else if (!/^(Total Classes|Total Absent|Total Present)$/i.test(label) && /^[A-Za-z]{3}-\d{1,2}$/.test(label)) daily.push({ date: label, values: row.slice(1) });
      }
    }
    if (/\b[A-Z]{2,}[A-Z0-9]*\s*[-–]\s*.+/.test(flat) && !/Overall\s+(Class|Absent|Present)/i.test(flat)) footerText += `\n${table.map(row => row.join('\n')).join('\n')}`;
  }
  const names: Record<string, string> = { ...pageNames };
  const statusLegend: Record<string, string> = {};
  const attendanceLegend: Record<string, 'present' | 'absent'> = {};
  for (const row of subjectNameRows) {
    for (let index = 0; index < row.length; index++) {
      const parsed = subjectNameFromText(clean(row[index]), subjectCodes);
      if (parsed) names[parsed.code] = parsed.name;
      if (subjectCodes.includes(clean(row[index]))) {
        const adjacent = subjectNameFromText(`${clean(row[index])}-${clean(row[index + 1] ?? '')}`, subjectCodes);
        if (adjacent) names[adjacent.code] = adjacent.name;
      }
    }
  }
  for (const line of footerText.split(/\n/).map(clean).filter(Boolean)) {
    // The IMS page can append the entire date-wise timetable to a footer cell.
    // It uses arrows and dates (e.g. 04-09-2026) rather than a short status
    // legend. Never treat that timetable as the explanation for GH/MS/etc.
    if (/--?>|\b\d{1,2}-\d{1,2}-20\d{2}\b|JANMASTHAMI/i.test(line) || line.length > 180) continue;
    for (const match of line.matchAll(/\b(CR|CS|GH|MB|MS|NA|NT|OD|TL)\s*[-–]\s*(.*?)(?=\s+(?:CR|CS|GH|MB|MS|NA|NT|OD|TL)\s*[-–]|$)/g)) {
      const description = clean(match[2]);
      // Status descriptions should be short labels, not page text.
      if (description && description.length <= 100 && !/--?>|\b\d{1,2}-\d{1,2}-20\d{2}\b/i.test(description)) {
        statusLegend[match[1]] = description;
      }
    }
  }
  // The portal's 0/1 legend is often in a separate row from the student identity.
  const legendText = tables.flat(2).map(clean).join(' ');
  for (const match of legendText.matchAll(/\b([01])\s*[-=]?\s*>\s*(ABSENT|PRESENT)\b/gi)) attendanceLegend[match[1]] = match[2].toLowerCase() as 'present' | 'absent';
  const roll = studentLine.match(/\(([^)]+)\)\s*,?\s*Semester/i)?.[1]?.trim() || fallbackRoll;
  const name = studentLine.match(/Name\s*:\s*(.*?)\s*\(/i)?.[1]?.trim() ?? '';
  const semester = studentLine.match(/Semester\s*:\s*(\d+)/i)?.[1] ?? '';
  const subjects = subjectCodes.map((code, index) => {
    const held = Number((overallRows.class?.[index] ?? '').replace(/[^\d.]/g, '')) || 0;
    const absent = Number((overallRows.absent?.[index] ?? '').replace(/[^\d.]/g, '')) || 0;
    const present = Number((overallRows.present?.[index] ?? '').replace(/[^\d.]/g, '')) || Math.max(0, held - absent);
    const rawPercent = overallRows.percent?.[index] ?? '';
    const percent = Number(rawPercent.replace('%', '').trim()) || (held ? present / held * 100 : 0);
    const canSkip = Math.max(0, Math.floor(present / 0.75 - held));
    const mustAttend = percent < 75 && held > 0 ? Math.max(0, Math.ceil((0.75 * held - present) / 0.25)) : 0;
    return { code, name: resolveSubjectName(code, names[code], subjectCodes), held, absent, present, percent, canSkip, mustAttend };
  });
  const dailyAttendance = daily.map(({ date, values }) => {
    const entries = subjectCodes.map((code, index): [string, string] => [code, clean(values[index] ?? '')]).filter(([, value]) => value);
    return { date: attendanceDate(date, academicYear), values: Object.fromEntries(entries) };
  }).filter(day => Object.keys(day.values).length > 0);
  return { name, roll, semester, subjects, daily: dailyAttendance, statusLegend, attendanceLegend, syncedAt: new Date().toISOString() };
}
