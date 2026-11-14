"use client";

/**
 * Grade upgrade simulator: re-grade one course and see the SGPA and CGPA it
 * would produce, without touching anything saved.
 */

import { useMemo, useState } from "react";
import { GRADE_ORDER, GRADE_POINTS } from "../../lib/data";
import { cgpaWithSemester, sgpaWithGrade, type StudentRecord } from "./record";

export default function GradeSimulator({ record }: { record: StudentRecord }) {
  // The latest semester that actually has per-course marks is the useful one.
  const withMarks = useMemo(
    () => [...record.semesters].reverse().find((semester) => semester.marks.some((mark) => mark.credits)),
    [record.semesters],
  );
  const [code, setCode] = useState(() => withMarks?.marks[0]?.code ?? "");
  const [grade, setGrade] = useState("O");

  const course = withMarks?.marks.find((mark) => mark.code === code) ?? withMarks?.marks[0];
  const projected = withMarks && course ? sgpaWithGrade(withMarks, course.code, GRADE_POINTS[grade] ?? 0) : null;
  const projectedCgpa = withMarks && projected !== null ? cgpaWithSemester(record, withMarks.semester, projected) : null;
  const sgpaGain = withMarks && projected !== null ? projected - withMarks.sgpa : null;

  if (!withMarks || !course) {
    return (
      <section className="rsPanel" aria-labelledby="simTitle">
        <div className="rsPanelHead">
          <span className="rsPanelIcon" aria-hidden="true">↻</span>
          <div>
            <h3 id="simTitle">Grade upgrade simulator</h3>
            <p>Course-level marks are not in the gazette for this roll yet.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rsPanel" aria-labelledby="simTitle">
      <div className="rsPanelHead">
        <span className="rsPanelIcon" aria-hidden="true">↻</span>
        <div>
          <h3 id="simTitle">Grade upgrade simulator</h3>
          <p>Semester {withMarks.semester} · {course.grade} now</p>
        </div>
      </div>

      <label className="rsField">
        <small>Course</small>
        <select value={course.code} onChange={(event) => setCode(event.target.value)}>
          {withMarks.marks.map((mark) => (
            <option key={mark.code} value={mark.code}>
              {mark.code} · {mark.grade}{mark.credits ? ` · ${mark.credits} cr` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="rsField">
        <small>Target grade</small>
        <select value={grade} onChange={(event) => setGrade(event.target.value)}>
          {GRADE_ORDER.map((option) => (
            <option key={option} value={option}>
              {option} · {GRADE_POINTS[option]} points
            </option>
          ))}
        </select>
      </label>

      <dl className="rsSimOut">
        <div>
          <dt>Projected SGPA</dt>
          <dd>{projected === null ? "—" : projected.toFixed(2)}</dd>
          <em className={sgpaGain && sgpaGain > 0 ? "up" : "flat"}>
            {sgpaGain === null ? "—" : `${sgpaGain >= 0 ? "+" : ""}${sgpaGain.toFixed(2)}`}
          </em>
        </div>
        <div>
          <dt>Projected CGPA</dt>
          <dd>{projectedCgpa === null ? "—" : projectedCgpa.toFixed(2)}</dd>
          <em className={projectedCgpa !== null && record.cgpa !== null && projectedCgpa > record.cgpa ? "up" : "flat"}>
            {projectedCgpa === null || record.cgpa === null
              ? "—"
              : `${projectedCgpa >= record.cgpa ? "+" : ""}${(projectedCgpa - record.cgpa).toFixed(2)}`}
          </em>
        </div>
      </dl>

      <p className="rsSimNote">
        Projection only: the gazette stays as published. Credits come from the portal's own credit points.
      </p>
    </section>
  );
}
