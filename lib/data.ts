/**
 * Shared client-side data layer.
 *
 * The dataset is fetched at runtime from /data/*.json instead of being imported,
 * so it never has to be parsed as part of the JavaScript bundle. Both loaders
 * cache their promise, so navigating between the leaderboard and a profile page
 * reuses the same payload.
 */

export type Student = {
  roll: string;
  name: string;
  branch: string;
  year: string;
  semester: number;
  /**
   * Start year of the academic session this record belongs to. A semester can be
   * sat in more than one session, so the exam period needs this as well as the
   * semester number.
   */
  ay: number;
  /** Semester SGPA, or null when the gazette says "RL" (result later). */
  sgpa: number | null;
  /** Pre-computed lowercase haystack for the search box. */
  search: string;
  /**
   * The student's cumulative CGPA as printed in the university's CGPA tables, or
   * null when no CGPA was published for them.
   */
  cgpa: number | null;
};

export type SubjectMark = { code: string; grade: string; cp: number };
export type SemesterMarks = {
  /** Academic session the marks come from. */
  ay: number;
  /** Registered credits for the semester, as printed in the gazette. */
  credits: number;
  /** Credit points earned, as printed in the gazette. */
  creditPoints: number;
  subjects: SubjectMark[];
};
export type SubjectData = {
  /** roll -> semester -> marks */
  semesters: Record<string, Record<string, SemesterMarks>>;
  /** course code -> credits, derived from credit points ÷ grade points. */
  courseCredits: Record<string, number>;
};

/** A compact row as stored in public/data/students.json. */
type Row = [string, string, string, number, number, number | null, number, number | null];

/** A semester as stored in public/data/subjects.json. */
type SubjectRow = [number, number, [string, string, number][], number];

function decodeSubjectData(payload: {
  courseCredits: Record<string, number>;
  semesters: Record<string, Record<string, SubjectRow>>;
}): SubjectData {
  const semesters: SubjectData["semesters"] = {};
  for (const [roll, bySemester] of Object.entries(payload.semesters)) {
    const decoded: Record<string, SemesterMarks> = {};
    for (const [semester, [credits, creditPoints, subjects, ay]] of Object.entries(bySemester)) {
      decoded[semester] = {
        ay,
        credits,
        creditPoints,
        subjects: subjects.map(([code, grade, cp]) => ({ code, grade, cp })),
      };
    }
    semesters[roll] = decoded;
  }
  return { semesters, courseCredits: payload.courseCredits };
}

export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];

export const GRADE_POINTS: Record<string, number> = {
  O: 10, "A+": 9, A: 8, "B+": 7, B: 6, C: 5, D: 4, F: 0, FD: 0,
};
export const GRADE_ORDER = ["O", "A+", "A", "B+", "B", "C", "D", "F", "FD"];
export const PASSING_GRADES = new Set(["O", "A+", "A", "B+", "B", "C", "D"]);

/**
 * Exam period a semester was held in, derived from the session start year and the
 * semester number rather than hard-coded: a student admitted in 2023 sits
 * semester 1 in Nov-Dec 2023, semester 3 in Nov-Dec 2024, and so on.
 */
export function examPeriod(ay: number, semester: number): string {
  return semester % 2 === 1 ? `Nov\u2013Dec ${ay}` : `Apr\u2013May ${ay + 1}`;
}

/** "2025-26" style label for an academic session start year. */
export function academicYearLabel(ay: number): string {
  return `${ay}-${String(ay + 1).slice(2)}`;
}

export function sgpaLabel(sgpa: number | null): string {
  return sgpa === null ? "RL" : sgpa.toFixed(2);
}

export async function loadStudents(): Promise<Student[]> {
  if (!studentsPromise) {
    studentsPromise = fetch("/data/students.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load results data (HTTP ${res.status})`);
        return res.json() as Promise<Row[]>;
      })
      .then((rows) =>
        rows.map(([roll, name, branch, year, semester, sgpa, ay, cgpa]) => ({
          roll, name, branch, year: String(year), semester, ay, sgpa, cgpa: cgpa ?? null,
          search: `${name} ${roll} ${branch}`.toLowerCase(),
        })),
      )
      .catch((err) => {
        studentsPromise = null; // let the user retry
        throw err;
      });
  }
  return studentsPromise;
}

export async function loadSubjectData(): Promise<SubjectData> {
  if (!subjectsPromise) {
    subjectsPromise = fetch("/data/subjects.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Could not load subject marks (HTTP ${res.status})`);
        return res.json();
      })
      .then(decodeSubjectData)
      .catch((err) => {
        subjectsPromise = null;
        throw err;
      });
  }
  return subjectsPromise;
}

let studentsPromise: Promise<Student[]> | null = null;
let subjectsPromise: Promise<SubjectData> | null = null;

/** Credits for a subject: taken from the gazette when derivable, else from the
 * course's typical credit weight. */
export function subjectCredits(mark: SubjectMark, courseCredits: Record<string, number>): number | null {
  const points = GRADE_POINTS[mark.grade];
  if (points && mark.cp) return mark.cp / points;
  return courseCredits[mark.code] ?? null;
}

export type Weighted = {
  /** Credit-weighted CGPA, or null when no semester has credit data. */
  cgpa: number | null;
  credits: number;
  creditPoints: number;
  /** Semesters that contributed to the average. */
  semesters: number[];
};

/**
 * Official-style CGPA: total credit points ÷ total registered credits over the
 * semesters the gazette reports credits for. Semesters that only have an SGPA
 * (the even-semester gazettes) can't be weighted, so they are excluded rather
 * than guessed at.
 */
export function weightedCgpa(marks: Record<string, SemesterMarks>): Weighted {
  let credits = 0;
  let creditPoints = 0;
  const semesters: number[] = [];
  for (const [sem, m] of Object.entries(marks)) {
    if (!m || !m.credits) continue;
    credits += m.credits;
    creditPoints += m.creditPoints;
    semesters.push(Number(sem));
  }
  return {
    cgpa: credits ? creditPoints / credits : null,
    credits, creditPoints,
    semesters: semesters.sort((a, b) => a - b),
  };
}

export function gradeDistribution(
  marks: Record<string, SemesterMarks>,
): { grade: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const m of Object.values(marks)) {
    for (const s of m?.subjects ?? []) counts[s.grade] = (counts[s.grade] ?? 0) + 1;
  }
  return GRADE_ORDER.filter((g) => counts[g]).map((g) => ({ grade: g, count: counts[g] }));
}
