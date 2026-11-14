import assert from 'node:assert/strict';
import { parseImsTimetable } from '../lib/ims-timetable';

const periods: [string, string][] = [
  ['T1', '08:00-09:00'], ['T2', '09:00-10:00'], ['T3', '10:00-11:00'],
  ['T4', '11:00-12:00'], ['T5', '12:00-01:00'], ['T6', '01:00-02:00'],
  ['T7', '02:00-03:00'], ['T8', '03:00-04:00'], ['T9', '04:00-05:00'],
  ['T10', '05:00-06:00'], ['T11', '06:00-07:00'], ['T12', '07:00-08:00'],
  ['T13', '08:00-09:00'],
];

function row(day: string, cells: Record<number, string>) {
  return `<tr><td><b>${day}</b></td>${periods.map((_, index) => `<td class="plum_fieldbig">${cells[index] ?? ''}</td>`).join('')}</tr>`;
}

const html = `<html><body>
<table>
  <tr><td colspan="10">Time Table of TEST STUDENT<br>Academic Year : 2026-27 / Semester : 3</td><td><a>Print</a></td></tr>
  <tr><td></td>${periods.map(([label, time]) => `<td><b>${label}<br>${time}</b></td>`).join('')}</tr>
  ${row('Mon', {
    2: 'MEMEC304-Sec:2,<br>Room:NB (S-01)',
    4: 'MEMEC305-Sec:2,<br>Room:NB (S-01)',
    5: 'MEMTC301-Sec:2,<br>Room:NB (S-01)',
    8: 'MEMEC303-Sec:2,Tut-1<br>Room:NB (S-01)',
    9: 'MEMEC303-Sec:2,Tut-2<br>Room:NB (S-01)',
    12: 'MEMEC304-Sec:2,<br>Room:NB (S-01)',
  })}
  ${row('Thu', {
    8: 'MEMEC302-Sec:2,Grp-1<br>Room:WS1<hr>MEMEC305-Sec:2,Grp-2<br>Room:OLD CANTE.<hr>MEMEC302-Sec:2,Grp-1<br>Room:WS1<hr>MEMEC305-Sec:2,Grp-2<br>Room:OLD CANTE.',
  })}
  ${row('Sat', {
    0: 'VAPD0304<br>Sem:3-Bat:1<br>Room:SPRT GND A',
    1: 'VAPD0304<br>Sem:3-Bat:1<br>Room:SPRT GND A',
    2: 'VAPD0304<br>Sem:3-Bat:1<br>Room:SPRT GND A',
    3: 'VAPD0304<br>Sem:3-Bat:1<br>Room:SPRT GND A',
  })}
</table>
</body></html>`;

const timetable = parseImsTimetable(html);

assert.equal(timetable.academicYear, '2026-27');
assert.equal(timetable.semester, '3');
assert.equal(timetable.slots.length, 11);

const mondayT3 = timetable.slots.find(slot => slot.day === 'Mon' && slot.period === 'T3');
assert.ok(mondayT3, 'Monday T3 is parsed');
assert.equal(mondayT3.start, '10:00');
assert.equal(mondayT3.end, '11:00');
assert.equal(mondayT3.entries[0].code, 'MEMEC304');
assert.equal(mondayT3.entries[0].section, '2');
assert.equal(mondayT3.entries[0].room, 'NB (S-01)');

const mondayT5 = timetable.slots.find(slot => slot.day === 'Mon' && slot.period === 'T5');
assert.ok(mondayT5, 'Monday T5 is parsed');
assert.equal(mondayT5.start, '12:00');
assert.equal(mondayT5.end, '13:00');

const mondayT6 = timetable.slots.find(slot => slot.day === 'Mon' && slot.period === 'T6');
assert.ok(mondayT6, 'Monday T6 rolls past noon');
assert.equal(mondayT6.start, '13:00');
assert.equal(mondayT6.end, '14:00');

const mondayTut = timetable.slots.find(slot => slot.day === 'Mon' && slot.period === 'T9');
assert.ok(mondayTut, 'Monday tutorial is parsed');
assert.equal(mondayTut.entries[0].kind, 'tutorial');
assert.equal(mondayTut.entries[0].tutorial, '1');

const thursdayLabs = timetable.slots.find(slot => slot.day === 'Thu' && slot.period === 'T9');
assert.ok(thursdayLabs, 'Thursday lab slot is parsed');
assert.equal(thursdayLabs.entries.length, 2, 'duplicate lab rows are collapsed');
assert.deepEqual(thursdayLabs.entries.map(entry => entry.group), ['1', '2']);
assert.ok(thursdayLabs.entries.every(entry => entry.kind === 'lab'));

const saturday = timetable.slots.find(slot => slot.day === 'Sat' && slot.period === 'T1');
assert.ok(saturday, 'Saturday activity is parsed');
assert.equal(saturday.entries[0].kind, 'activity');
assert.equal(saturday.entries[0].batch, '1');

const lastPeriod = timetable.slots.find(slot => slot.day === 'Sat' && slot.period === 'T4');
assert.ok(lastPeriod, 'Saturday T4 is parsed');
assert.equal(lastPeriod.start, '11:00');
assert.equal(lastPeriod.end, '12:00');

const eveningPeriod = timetable.slots.find(slot => slot.day === 'Mon' && slot.period === 'T13');
assert.ok(eveningPeriod, 'Monday T13 is parsed');
assert.equal(eveningPeriod.start, '20:00');
assert.equal(eveningPeriod.end, '21:00');

console.log(JSON.stringify({
  academicYear: timetable.academicYear,
  semester: timetable.semester,
  slots: timetable.slots.length,
  monday: timetable.slots.filter(slot => slot.day === 'Mon').map(slot => `${slot.period} ${slot.start}-${slot.end}`),
  labs: thursdayLabs.entries.map(entry => `${entry.code} Grp-${entry.group} ${entry.room}`),
}, null, 2));
