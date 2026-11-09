/**
 * End-Semester Date Sheet data loader and matching helpers.
 */

export type ExamScheduleItem = {
  degree: string;
  semester: number;
  code: string;
  name: string;
  date: string; // DD-MM-YYYY
  isoDate: string; // YYYY-MM-DD
  shift: string; // "Shift 1" | "Shift 2"
  time: string; // "10:00 AM - 01:00 PM" | "02:00 PM - 05:00 PM"
  daysRemaining?: number;
  status?: 'upcoming' | 'today' | 'passed';
};

export type DatesheetPayload = {
  title: string;
  noticeNumber: string;
  noticeDate: string;
  shiftTimings: Record<string, string>;
  totalExams: number;
  totalUniqueCodes: number;
  exams: ExamScheduleItem[];
  byCode: Record<string, ExamScheduleItem[]>;
};

let cachedDatesheet: DatesheetPayload | null = null;
let loadPromise: Promise<DatesheetPayload> | null = null;

export async function loadDatesheet(): Promise<DatesheetPayload> {
  if (cachedDatesheet) return cachedDatesheet;
  if (loadPromise) return loadPromise;

  loadPromise = fetch('/data/datesheet.json')
    .then(async (res) => {
      if (!res.ok) throw new Error(`Could not load datesheet data (HTTP ${res.status})`);
      const payload = (await res.json()) as DatesheetPayload;
      cachedDatesheet = payload;
      return payload;
    })
    .catch((err) => {
      loadPromise = null;
      throw err;
    });

  return loadPromise;
}

/**
 * Match a student's enrolled subject codes with the datesheet.
 * If user semester is provided, prefers matching exams for that semester.
 */
export function matchStudentExams(
  subjectCodes: string[],
  datesheet: DatesheetPayload,
  userSemester?: number | string
): ExamScheduleItem[] {
  if (!subjectCodes?.length || !datesheet?.byCode) return [];

  const matched: ExamScheduleItem[] = [];
  const seenCodes = new Set<string>();

  const semNum = userSemester ? Number(userSemester) : null;

  for (const rawCode of subjectCodes) {
    const code = rawCode.trim().toUpperCase();
    if (seenCodes.has(code)) continue;

    const candidates = datesheet.byCode[code];
    if (candidates && candidates.length > 0) {
      seenCodes.add(code);
      // If candidates exist for multiple semesters, prefer the student's semester
      let chosen = candidates[0];
      if (semNum && candidates.length > 1) {
        const exactSem = candidates.find((c) => c.semester === semNum);
        if (exactSem) chosen = exactSem;
      }
      matched.push(chosen);
    }
  }

  // Sort matched exams in chronological order by date
  return matched.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
}

/**
 * Calculate days remaining until an exam date (based on today).
 */
export function getExamCountdown(isoDate: string, now = new Date()): { daysRemaining: number; label: string; status: 'upcoming' | 'today' | 'passed' } {
  const [y, m, d] = isoDate.split('-').map(Number);
  const examUtc = Date.UTC(y, m - 1, d);
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diffTime = examUtc - todayUtc;
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { daysRemaining: diffDays, label: 'Exam completed', status: 'passed' };
  }
  if (diffDays === 0) {
    return { daysRemaining: 0, label: 'Today', status: 'today' };
  }
  if (diffDays === 1) {
    return { daysRemaining: 1, label: 'Tomorrow', status: 'upcoming' };
  }
  return { daysRemaining: diffDays, label: `In ${diffDays} days`, status: 'upcoming' };
}

export function formatExamDate(isoDate: string): { dayOfWeek: string; formattedDate: string } {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    dayOfWeek: days[date.getUTCDay()],
    formattedDate: `${d} ${months[date.getUTCMonth()]} ${y}`,
  };
}
