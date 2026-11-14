"use client";

/**
 * Semester grade sheet: one tab per graded semester, one row per course.
 */

import { useState } from "react";
import { GRADE_POINTS } from "../../lib/data";
import { ROMAN, type StudentRecord } from "./record";

export default function GradeSheet({ record }: { record: StudentRecord }) {
  const semesters = [...record.semesters].reverse();
  const [selected, setSelected] = useState(() => semesters[0]?.semester ?? 1);
  const semester = semesters.find((item) => item.semester === selected) ?? semesters[0];

  if (!semester) return null;

  return (
    <section className="rsPanel" aria-labelledby="sheetTitle">
      <div className="rsPanelHead">
        <span className="rsPanelIcon" aria-hidden="true">▤</span>
        <div>
          <h3 id="sheetTitle">Grade sheet</h3>
          <p>Course, credits and grade points as published.</p>
        </div>
      </div>

      <div className="rsTabs" role="tablist" aria-label="Semester grade sheet">
        {semesters.map((item) => (
          <button
            key={item.semester}
            type="button"
            role="tab"
            aria-selected={item.semester === semester.semester}
            className={item.semester === semester.semester ? "on" : ""}
            onClick={() => setSelected(item.semester)}
          >
            {ROMAN[item.semester - 1]}
          </button>
        ))}
      </div>

      {semester.marks.length ? (
        <div className="rsTableWrap">
          <table className="rsTable">
            <thead>
              <tr><th>Course</th><th>Cr</th><th>Grade</th><th>Points</th></tr>
            </thead>
            <tbody>
              {semester.marks.map((mark) => (
                <tr key={mark.code}>
                  <td>{mark.code}</td>
                  <td>{mark.credits ?? "—"}</td>
                  <td><span className={`rsGrade ${mark.grade}`}>{mark.grade}</span></td>
                  <td>{mark.credits ? (mark.credits * (GRADE_POINTS[mark.grade] ?? 0)).toFixed(0) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Semester {ROMAN[semester.semester - 1]}</td>
                <td>{semester.credits || "—"}</td>
                <td colSpan={2}>SGPA <b>{semester.sgpa.toFixed(2)}</b></td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="rsEmptyNote">
          Course-level marks for semester {ROMAN[semester.semester - 1]} are not in the published gazette data.
          SGPA {semester.sgpa.toFixed(2)} is still counted in the CGPA.
        </p>
      )}
    </section>
  );
}
