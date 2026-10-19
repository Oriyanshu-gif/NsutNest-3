/**
 * Renders the attendee-facing attendance calendar and asserts the things a student
 * needs from it: the subject name in the header, a month picker listing the months
 * that actually have records, per-month totals, a "today" marker and a legend that
 * explains the portal's own marks.
 *
 * Run with:  npm run check:attendance
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { SubjectAttendanceCalendar } from '../app/attendance-calendar';

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures.push(`${label}${detail ? `\n    ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};

const today = new Date();
const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const todayDay = String(today.getDate());
const thisMonth = todayIso.slice(0, 7);

const html = renderToStaticMarkup(
  <SubjectAttendanceCalendar
    subject={{ title: 'Thermal Engineering-I', code: 'MEMEC304' }}
    months={['2026-08', thisMonth]}
    month={thisMonth}
    onMonthChange={() => undefined}
    attendanceLegend={{ '0': 'absent', '1': 'present' }}
    statusLegend={{ GH: 'Gazetted Holiday', TL: 'Teacher on Leave' }}
    daily={[
      { date: `${thisMonth}-01`, values: { MEMEC304: '1' } },
      { date: `${thisMonth}-02`, values: { MEMEC304: '0' } },
      { date: `${thisMonth}-03`, values: { MEMEC304: '1+1' } },
      { date: `${thisMonth}-04`, values: { MEMEC304: 'GH' } },
      { date: todayIso, values: { MEMEC304: '1' } },
      { date: '2026-08-05', values: { MEMEC304: '1' } },
    ]}
  />,
);

if (process.env.DUMP_CALENDAR) console.log(html);

check('calendar leads with the subject name', html.includes('<b>Thermal Engineering-I</b>'), html.slice(0, 400));
check('calendar shows the IMS code chip after the name', /class="attCode">MEMEC304</.test(html));
check('month picker offers every month with records', (html.match(/<option/g) ?? []).length === 2);
check('month picker is labelled for screen readers', html.includes('aria-label="Choose attendance month"'));
// 1 + 1 on the 1st, 0 on the 2nd, 1+1 on the 3rd, a holiday mark on the 4th and 1 today.
check('this month\'s totals are shown', html.includes('>4</b> present') && html.includes('>1</b> absent') && html.includes('>1</b> other marks'));
check('this month\'s percentage is shown', html.includes('>80.0%</b> this month'));
check('dated entry count is shown', html.includes('5 dated entries'));
check('today is highlighted', html.includes('attendanceCalendarDay present today'));
check('no-data days are still rendered', (html.match(/attendanceCalendarDay empty/g) ?? []).length > 0);
check('portal marks appear on their day', html.includes('<small>GH</small>'));
check('double classes are summarised', html.includes('<small>×2</small>'));
check('legend explains the portal status marks', html.includes('Gazetted Holiday') && /<b>GH<\/b>/.test(html));
check('day tooltips describe the record', html.includes('title="Oct 2, 2026 — absent"'));

// A subject with no records for the selected month explains itself instead of rendering an empty grid.
const empty = renderToStaticMarkup(
  <SubjectAttendanceCalendar
    subject={{ title: 'NCC', code: 'VAPD0304' }}
    months={['2026-08']}
    month={thisMonth}
    onMonthChange={() => undefined}
    attendanceLegend={{ '0': 'absent', '1': 'present' }}
    daily={[{ date: '2026-08-05', values: { VAPD0304: '1' } }]}
  />,
);
check('a month without records explains itself', empty.includes('No date-wise attendance records'));

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nAll attendance calendar checks passed.');
