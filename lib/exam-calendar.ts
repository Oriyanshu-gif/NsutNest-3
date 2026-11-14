import type { ExamScheduleItem } from "./datesheet";

const IST_OFFSET_MINUTES = 330;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Start time in IST. Falls back to the official shift timings. */
function examStart(exam: ExamScheduleItem): { hour: number; minute: number } {
  const parsed = exam.time.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (parsed) {
    let hour = Number(parsed[1]) % 12;
    if (parsed[3].toUpperCase() === "PM") hour += 12;
    return { hour, minute: Number(parsed[2]) };
  }
  return /shift\s*2/i.test(exam.shift) ? { hour: 14, minute: 0 } : { hour: 10, minute: 0 };
}

function icsDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    "00",
    "Z",
  ].join("");
}

function eventFor(exam: ExamScheduleItem): string {
  const [year, month, day] = exam.isoDate.split("-").map(Number);
  const start = examStart(exam);
  const startUtc = new Date(Date.UTC(year, month - 1, day, start.hour, start.minute) - IST_OFFSET_MINUTES * 60_000);
  const endUtc = new Date(startUtc.getTime() + 3 * 60 * 60_000);
  const stamp = icsDate(new Date());

  return [
    "BEGIN:VEVENT",
    `UID:${exam.code}-${exam.isoDate}@nsutnest`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDate(startUtc)}`,
    `DTEND:${icsDate(endUtc)}`,
    `SUMMARY:Exam: ${exam.name} (${exam.code})`,
    `DESCRIPTION:${exam.code} · ${exam.shift} · ${exam.time} · NSUT end-semester examination`,
    "LOCATION:Netaji Subhas University of Technology, Dwarka, New Delhi",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Exam tomorrow: ${exam.name}`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:Exam in 1 hour: ${exam.name}`,
    "END:VALARM",
    "END:VEVENT",
  ].join("\r\n");
}

export function buildExamCalendar(exams: ExamScheduleItem[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NSUT Nest//Exam schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:NSUT Nest exams",
    ...exams.map(eventFor),
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadExamCalendar(exams: ExamScheduleItem[], label = "nsut-nest"): void {
  if (!exams.length || typeof window === "undefined") return;
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "nsut-nest";
  const blob = new Blob([buildExamCalendar(exams)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exams.length === 1 ? `${safeLabel}-${exams[0].code.toLowerCase()}.ics` : `${safeLabel}-exams.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
