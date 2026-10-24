/**
 * Checks that attendance subject names are read from the live IMS attendance page.
 *
 * The fixture mirrors the real portal: a `Days`-headed table with course codes as
 * columns, a remark block (`MEMEC304--->27-07-2026--->CS-REGISTRATION`) and the
 * subject legend printed as plain text under the table.
 *
 * Run with:  npm run check:attendance
 */
import { load } from 'cheerio';
import { parseAttendance } from '../lib/ims-attendance-parse';
import { subjectCodesFromTables, subjectNamesFromPages } from '../lib/ims-attendance-html';
import { resolveSubjectName, subjectNamesFromLine } from '../lib/attendance';

const CODES = ['FCFO0301', 'MEMEC302', 'MEMEC303', 'MEMEC304', 'MEMEC305', 'MEMTC301', 'VAPD0304'];
const NAMES: Record<string, string> = {
  FCFO0301: 'Community Internship',
  MEMEC302: 'Manufacturing Processes-I',
  MEMEC303: 'Strength of Materials',
  MEMEC304: 'Thermal Engineering-I',
  MEMEC305: 'Fluid Mechanics & Machines',
  MEMTC301: 'Numerical Methods & Computation',
  VAPD0304: 'NCC',
};

const header = ['Days', ...CODES];
const page = (legend: string) => `
<html><body>
<table border="1">
  <tr><td colspan="8">Name: PRIYANSHU KUMAR SINGH (2025UME4077), Semester : 3</td></tr>
  <tr><td colspan="8">0 - &gt; ABSENT , 1 - &gt; PRESENT</td></tr>
  <tr>${header.map(cell => `<td>${cell}</td>`).join('')}</tr>
  <tr><td>Jul-28</td>${CODES.map(() => '<td>1</td>').join('')}</tr>
  <tr><td>Jul-29</td>${CODES.map(() => '<td>1</td>').join('')}</tr>
  <tr><td>Overall Class</td><td>0</td><td>30</td><td>33</td><td>21</td><td>35</td><td>37</td><td>0</td></tr>
  <tr><td>Overall Absent</td><td>0</td><td>7</td><td>7</td><td>3</td><td>9</td><td>8</td><td>0</td></tr>
  <tr><td>Overall Present</td><td>0</td><td>23</td><td>26</td><td>18</td><td>26</td><td>29</td><td>0</td></tr>
  <tr><td>Overall (%)</td><td>0.00%</td><td>76.67%</td><td>78.79%</td><td>85.71%</td><td>74.29%</td><td>78.38%</td><td>0.00%</td></tr>
</table>
<div>MEMEC304--->27-07-2026--->CS-REGISTRATION</div>
<div>MEMEC302--->06-08-2026--->MB-MB</div>
${legend}
</body></html>`;

const legendOutsideTable = page(
  CODES.map(code => `${code}-${NAMES[code]}`).join('<br/>'),
);

const tablesFromHtml = (html: string) => {
  const $ = load(html);
  return $('table').toArray().map(table => $(table).find('tr').toArray()
    .map(row => $(row).find('th, td').toArray().map(cell => $(cell).text().replace(/\u00a0/g, ' ').trim())));
};

const failures: string[] = [];
const check = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures.push(`${label}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};

// 1. The legend lives outside the attendance table, as plain <br/>-separated text.
const tables = tablesFromHtml(legendOutsideTable);
const codes = subjectCodesFromTables(tables);
check('subject codes read from the table header', codes, CODES);
const namesFromFreeText = subjectNamesFromPages([{ html: legendOutsideTable }], tables, codes);
check('names read from the free-text legend', namesFromFreeText, NAMES);

// 2. The parsed payload carries those names, not just the codes.
const parsed = parseAttendance(tables, '2026-2027', '2025UME4077', namesFromFreeText);
check('every subject row shows its course name', parsed.subjects.map(subject => `${subject.code}=${subject.name}`),
  CODES.map(code => `${code}=${NAMES[code]}`));
check('roll read from the student line', parsed.roll, '2025UME4077');
check('remark lines do not become subject names', Object.values(namesFromFreeText).some(name => /REGISTRATION/.test(name)), false);

// 3. A page with no legend at all still resolves names from the known course map.
const tablesWithoutLegend = tablesFromHtml(page(''));
const parsedWithoutLegend = parseAttendance(tablesWithoutLegend, '2026-2027', '2025UME4077', {});
check('fallback map names a legend-less page', parsedWithoutLegend.subjects.map(subject => `${subject.code}=${subject.name}`),
  CODES.map(code => `${code}=${NAMES[code]}`));

// 4. Names printed only as free text outside the table are still read, even when the
//    code is not in the known-course fallback map.
const customPage = page('ZZZZ9999-Open Elective Practice<br/>MEMEC304-Thermal Engineering-I');
const customTables = tablesFromHtml(customPage);
const customCodes = subjectCodesFromTables(customTables);
check('unknown code still gets its free-text name',
  subjectNamesFromPages([{ html: customPage }], customTables, [...customCodes, 'ZZZZ9999'])['ZZZZ9999'],
  'Open Elective Practice');

// 5. A packed legend line, as some portal tabs print it.
check('packed legend line', subjectNamesFromLine('MEMEC302-Manufacturing Processes-I MEMEC303-Strength of Materials', CODES),
  [{ code: 'MEMEC302', name: 'Manufacturing Processes-I' }, { code: 'MEMEC303', name: 'Strength of Materials' }]);

// 6. Unknown codes name themselves, and a known code with a code-only name uses the map.
check('unknown code stays as the code', resolveSubjectName('XXXX9999', 'XXXX9999', ['XXXX9999']), 'XXXX9999');
check('code-only name is replaced by the course name', resolveSubjectName('MEMEC304', 'MEMEC304', CODES), 'Thermal Engineering-I');

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nAll attendance subject-name checks passed.');
