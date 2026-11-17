"use client";

/**
 * Date-wise attendance calendar for one subject, shown when an attendance row on
 * the dashboard is expanded.
 *
 * It leads with the subject name, lets the student jump straight to any month the
 * portal has records for, summarises that month (present / absent / percentage)
 * and explains the portal's own marks (GH, TL, MS …) in the legend.
 */

import { ArrowLeft, ArrowRight } from "lucide-react";

export type AttendanceCalendarSubject = { title: string; code: string };
export type AttendanceCalendarDay = { date: string; values: Record<string, string> };

export type SubjectAttendanceCalendarProps = {
  subject: AttendanceCalendarSubject;
  daily: AttendanceCalendarDay[];
  attendanceLegend?: Record<string, "present" | "absent">;
  statusLegend?: Record<string, string>;
  month: string;
  months: string[];
  onMonthChange: (month: string) => void;
};

export function attendanceDateLabel(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function monthLabel(value: string): string {
  const [year, index] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, index - 1, 1)));
}

export function SubjectAttendanceCalendar({
  subject,
  daily,
  attendanceLegend,
  statusLegend,
  month,
  months,
  onMonthChange,
}: SubjectAttendanceCalendarProps) {
  const monthIndex = months.indexOf(month);
  const [yearValue, monthValue] = month.split("-").map(Number);
  const firstDate = new Date(Date.UTC(yearValue, monthValue - 1, 1));
  const dayCount = new Date(Date.UTC(yearValue, monthValue, 0)).getUTCDate();
  const dailyMarks = new Map<number, string[]>();
  const monthStatuses = new Set<string>();
  let monthPresent = 0;
  let monthAbsent = 0;
  let monthOther = 0;
  let monthRecords = 0;

  for (const day of daily) {
    if (!day.date.startsWith(`${month}-`) || !day.values[subject.code]) continue;
    const dayNumber = Number(day.date.slice(8, 10));
    const marks = day.values[subject.code].split("+").map(mark => mark.trim()).filter(Boolean);
    dailyMarks.set(dayNumber, [...(dailyMarks.get(dayNumber) ?? []), ...marks]);
    monthRecords += 1;
    for (const mark of marks) {
      const state = attendanceLegend?.[mark];
      if (state === "present") monthPresent += 1;
      else if (state === "absent") monthAbsent += 1;
      else { monthOther += 1; monthStatuses.add(mark); }
    }
  }

  const monthScored = monthPresent + monthAbsent;
  const monthPercent = monthScored ? (monthPresent / monthScored) * 100 : 0;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  if (monthIndex < 0 || !dayCount) {
    return <div className="attendanceCalendarEmpty">No date-wise attendance records are available for this subject.</div>;
  }

  return (
    <div className="attendanceCalendar" aria-label={`${subject.title} attendance calendar`}>
      <div className="attendanceCalendarTop">
        <div className="attendanceCalendarSubject">
          <small>Date-wise attendance</small>
          <b>{subject.title}</b>
          {subject.title !== subject.code && <span className="attCode">{subject.code}</span>}
        </div>
        <div className="attendanceCalendarHead">
          <button type="button" aria-label="Previous attendance month" disabled={monthIndex <= 0} onClick={() => onMonthChange(months[monthIndex - 1])}>
            <ArrowLeft size={15} />
          </button>
          <label className="attendanceCalendarMonth">
            <span className="attendanceCalendarMonthLabel">{monthLabel(month)}</span>
            <select value={month} aria-label="Choose attendance month" onChange={(event) => onMonthChange(event.target.value)}>
              {months.map(value => <option key={value} value={value}>{monthLabel(value)}</option>)}
            </select>
          </label>
          <button type="button" aria-label="Next attendance month" disabled={monthIndex >= months.length - 1} onClick={() => onMonthChange(months[monthIndex + 1])}>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>

      <div className="attendanceCalendarStats">
        <span className="present"><b>{monthPresent}</b> present</span>
        <span className="absent"><b>{monthAbsent}</b> absent</span>
        {monthOther > 0 && <span className="other"><b>{monthOther}</b> other marks</span>}
        <span className="percent"><b>{monthScored ? `${monthPercent.toFixed(1)}%` : "—"}</b> this month</span>
        <span className="records">{monthRecords} dated {monthRecords === 1 ? "entry" : "entries"}</span>
      </div>

      <div className="attendanceCalendarGrid" role="grid" aria-label={`${subject.title} attendance dates`}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <span className="attendanceCalendarWeekday" role="columnheader" key={day}>{day}</span>
        ))}
        {Array.from({ length: firstDate.getUTCDay() }, (_, index) => (
          <span className="attendanceCalendarBlank" role="gridcell" key={`blank-${index}`} />
        ))}
        {Array.from({ length: dayCount }, (_, index) => {
          const dayNumber = index + 1;
          const marks = dailyMarks.get(dayNumber) ?? [];
          const states = marks.map(mark => attendanceLegend?.[mark]).filter((state): state is "present" | "absent" => !!state);
          const state = states.includes("absent") ? "absent" : states.includes("present") ? "present" : marks.length ? "other" : "empty";
          const date = `${month}-${String(dayNumber).padStart(2, "0")}`;
          const meaning = marks.map(mark => attendanceLegend?.[mark] ?? statusLegend?.[mark] ?? mark).join(", ");
          const statusMarks = marks.filter(mark => !/^[01]$/.test(mark));
          const classCount = marks.filter(mark => /^[01]$/.test(mark)).length;
          const badge = statusMarks.length ? statusMarks.join("+") : classCount > 1 ? `×${classCount}` : "";
          const isToday = date === todayIso;
          return (
            <span
              key={date}
              className={`attendanceCalendarDay ${state}${isToday ? " today" : ""}`}
              role="gridcell"
              aria-label={`${attendanceDateLabel(date)}${isToday ? " (today)" : ""}${meaning ? `: ${meaning}` : ": no attendance record"}`}
              title={`${attendanceDateLabel(date)}${isToday ? " · today" : ""} — ${meaning || "no attendance record"}`}
            >
              <b>{dayNumber}</b>
              {badge && <small>{badge}</small>}
            </span>
          );
        })}
      </div>

      <div className="attendanceCalendarLegend">
        <span><i className="present" /> Present</span>
        <span><i className="absent" /> Absent</span>
        <span><i className="other" /> Portal status / no class mark</span>
        {[...monthStatuses].sort().map(code => (
          <span key={code} className="status"><b>{code}</b> {statusLegend?.[code] ?? "Portal status"}</span>
        ))}
      </div>
    </div>
  );
}
