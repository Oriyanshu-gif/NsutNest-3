"use client";

/**
 * One place that turns the signed-in student's gazette rows into the record the
 * results screen renders: semesters, credits, CGPA, rank and the subject marks
 * the grade sheet and the upgrade simulator need.
 */

import { useEffect, useMemo, useState } from "react";
import { readStoredAttendance } from "../../lib/app-storage";
import {
  GRADE_POINTS,
  loadSubjectData,
  subjectCredits,
  type SemesterMarks,
  type Student,
  type SubjectMark,
} from "../../lib/data";

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
export const SEM_COUNT = 8;

export type SemesterRecord = {
  semester: number;
  ay: number;
  sgpa: number;
  /** Registered credits for the semester, 0 when the gazette has none. */
  credits: number;
  papers: number;
  marks: (SubjectMark & { credits: number | null })[];
};

export type StudentRecord = {
  student: Student;
  /** "2022 UBT" for the student's own class, null when the roll has no batch. */
  cohort: string | null;
  cgpa: number | null;
  rank: number | null;
  total: number;
  semesters: SemesterRecord[];
  /** Credits across every graded semester, when the gazette lists them. */
  credits: number;
};

/** Batch and branch as printed in the roll: 2022UBT1003 → 2022 · UBT. */
export function cohortOf(roll: string): string | null {
  const match = roll.trim().toUpperCase().match(/^(\d{4})([A-Z]{2,4})\d/);
  return match ? `${match[1]} ${match[2]}` : null;
}

export function useStudentRecord(students: Student[]) {
  const [roll, setRoll] = useState<string | null>(null);
  const [marksBySemester, setMarksBySemester] = useState<Record<string, SemesterMarks>>({});
  const [courseCredits, setCourseCredits] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    let stored: string | null = null;
    try {
      const raw = readStoredAttendance();
      stored = raw ? ((JSON.parse(raw) as { roll?: string }).roll ?? null) : null;
    } catch {
      stored = null;
    }
    setRoll(stored?.trim() ? stored.trim() : null);
    loadSubjectData()
      .then((data) => {
        if (!active) return;
        setCourseCredits(data.courseCredits);
        setMarksBySemester(stored ? (data.semesters[stored] ?? {}) : {});
      })
      .catch(() => {
        // Without subject data the grade sheet falls back to codes and credits.
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const record = useMemo<StudentRecord | null>(() => {
    if (!roll) return null;
    const rows = students.filter((student) => student.roll.toUpperCase() === roll.toUpperCase());
    if (!rows.length) return null;

    // Two attempts for one semester: the better SGPA is the one that counts.
    const best = new Map<number, Student>();
    for (const row of rows) {
      const current = best.get(row.semester);
      if (!current || (row.sgpa ?? -1) > (current.sgpa ?? -1)) best.set(row.semester, row);
    }

    const semesters: SemesterRecord[] = [...best.values()]
      .filter((row) => row.sgpa !== null)
      .sort((a, b) => a.semester - b.semester)
      .map((row) => {
        const marks = marksBySemester[String(row.semester)];
        return {
          semester: row.semester,
          ay: row.ay,
          sgpa: row.sgpa as number,
          credits: marks?.credits ?? 0,
          papers: marks?.subjects.length ?? 0,
          marks: (marks?.subjects ?? []).map((mark) => ({ ...mark, credits: subjectCredits(mark, courseCredits) })),
        };
      });

    // One entry per student, ranked inside the same batch and branch so the
    // standing answers "how am I doing in my own class", not across the college.
    const cohort = cohortOf(rows[0].roll);
    const ranked = [...new Map(students.map((student) => [student.roll, student.cgpa])).entries()]
      .filter(([value, cgpa]) => cgpa !== null && (!cohort || cohortOf(value) === cohort))
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));

    return {
      student: rows[0],
      cohort,
      cgpa: rows.find((row) => row.cgpa !== null)?.cgpa ?? null,
      rank: ranked.findIndex(([value]) => value === rows[0].roll) + 1 || null,
      total: ranked.length,
      semesters,
      credits: semesters.reduce((sum, semester) => sum + semester.credits, 0),
    };
  }, [roll, students, marksBySemester, courseCredits]);

  return { ready, record };
}

/** SGPA after one course in `semester` is re-graded, all else unchanged. */
export function sgpaWithGrade(semester: SemesterRecord, code: string, points: number): number | null {
  let total = 0;
  let credits = 0;
  for (const mark of semester.marks) {
    const weight = mark.credits ?? 0;
    if (!weight) return null;
    credits += weight;
    total += (mark.code === code ? points : GRADE_POINTS[mark.grade] ?? 0) * weight;
  }
  return credits ? total / credits : null;
}

/** CGPA once that semester's SGPA changes, weighted by the credits we know. */
export function cgpaWithSemester(record: StudentRecord, semester: number, sgpa: number): number | null {
  const weighted = record.semesters.filter((item) => item.credits > 0);
  if (weighted.some((item) => item.credits === 0)) return null;
  const credits = weighted.reduce((sum, item) => sum + item.credits, 0);
  if (!credits) return null;
  const points = weighted.reduce((sum, item) => sum + item.sgpa * item.credits, 0);
  const target = weighted.find((item) => item.semester === semester);
  if (!target) return null;
  return (points - target.sgpa * target.credits + sgpa * target.credits) / credits;
}
