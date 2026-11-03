/**
 * Renders the attendee-facing attendance calendar and asserts the things a student
 * needs from it: the subject name in the header, a month picker listing the months
 * that actually have records, per-month totals, a "today" marker and a legend that
 * explains the portal's own marks.
 *
 * Run with:  npm run check:attendance
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { attendanceDateLabel, SubjectAttendanceCalendar } from '../app/attendance-calendar';

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures.push(`${label}${detail ? `\n    ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
};

const today = new Date();
const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const todayDay = String(today.getDate());
const thisMonth = todayIso.slice(0, 7);
/**
 * Days the fixture writes its records on. None may be today: the calendar merges
 * every record for one date, so a collision would turn the doubled period into a
 * "×3" badge and make the totals below describe data that was never handed in.
 */
const [firstDay, secondDay, thirdDay, fourthDay] = [1, 2, 3, 4].includes(today.getDate())
  ? [9, 10, 11, 12]
  : [1, 2, 3, 4];
const fixtureDate = (day: number) => `${thisMonth}-${String(day).padStart(2, '0')}`;

const html = renderToStaticMarkup(
  <SubjectAttendanceCalendar
    subject={{ title: 'Thermal Engineering-I', code: 'MEMEC304' }}
    months={['2026-08', thisMonth]}
    month={thisMonth}
    onMonthChange={() => undefined}
    attendanceLegend={{ '0': 'absent', '1': 'present' }}
    statusLegend={{ GH: 'Gazetted Holiday', TL: 'Teacher on Leave' }}
    daily={[
      { date: fixtureDate(firstDay), values: { MEMEC304: '1' } },
      { date: fixtureDate(secondDay), values: { MEMEC304: '0' } },
      { date: fixtureDate(thirdDay), values: { MEMEC304: '1+1' } },
      { date: fixtureDate(fourthDay), values: { MEMEC304: 'GH' } },
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
// 1 on day 1, 0 on day 2, 1+1 on day 3, a holiday mark on day 4 and 1 today.
check('this month\'s totals are shown', html.includes('>4</b> present') && html.includes('>1</b> absent') && html.includes('>1</b> other marks'));
check('this month\'s percentage is shown', html.includes('>80.0%</b> this month'));
check('dated entry count is shown', html.includes('5 dated entries'));
check('today is highlighted', html.includes('attendanceCalendarDay present today'));
check('no-data days are still rendered', (html.match(/attendanceCalendarDay empty/g) ?? []).length > 0);
check('portal marks appear on their day', html.includes('<small>GH</small>'));
check('double classes are summarised', html.includes('<small>×2</small>'));
check('legend explains the portal status marks', html.includes('Gazetted Holiday') && /<b>GH<\/b>/.test(html));
// The tooltip names the real date of the selected month and marks today, so the
// expectation is derived instead of being tied to one calendar month.
const secondDate = fixtureDate(secondDay);
const secondLabel = attendanceDateLabel(secondDate);
check('day tooltips describe the record',
  html.includes(`title="${secondLabel}${secondDate === todayIso ? ' · today' : ''} — absent"`),
  html.match(/title="[^"]*"/g)?.slice(0, 3).join(' | ') ?? '');

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
