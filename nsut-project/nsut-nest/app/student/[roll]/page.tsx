"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {   ArrowLeft, GraduationCap, Trophy, TrendingUp, Info, BookOpen, Loader2, AlertTriangle,
} from "lucide-react";
import BrandLogo from "../../brand-logo";
import { LiveViewCount } from "../../live-views";
import {
  GRADE_POINTS, SEMESTERS, academicYearLabel, examPeriod, gradeDistribution, loadStudents,
  loadSubjectData, sgpaLabel, subjectCredits, weightedCgpa,
  type Student, type SubjectData, type SemesterMarks,
} from "../../../lib/data";

export default function StudentProfile() {
  const params = useParams<{ roll: string }>();
  const roll = decodeURIComponent(params.roll || "");
  const [students, setStudents] = useState<Student[] | null>(null);
  const [subjectData, setSubjectData] = useState<SubjectData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadStudents(), loadSubjectData()]).then(
      ([rows, marks]) => { if (active) { setStudents(rows); setSubjectData(marks); } },
      (err) => active && setError(err instanceof Error ? err.message : "Could not load the results data."),
    );
    return () => { active = false; };
  }, []);

  const records = useMemo(
    () => (students ?? []).filter((s) => s.roll.toLowerCase() === roll.toLowerCase())
      .sort((a, b) => a.semester - b.semester),
    [students, roll],
  );
  const student = records[0];
  const marks: Record<string, SemesterMarks> = useMemo(
    () => (student && subjectData ? subjectData.semesters[student.roll] ?? {} : {}),
    [student, subjectData],
  );

  // A semester can appear more than once (an original attempt and a re-sit), so
  // the summary keeps the better attempt and reports the session it came from.
  const semesterMap = useMemo(() => {
    const map = new Map<number, Student>();
    for (const r of records) {
      const current = map.get(r.semester);
      if (!current || (current.sgpa ?? -1) < (r.sgpa ?? -1)) map.set(r.semester, r);
    }
    return map;
  }, [records]);

  const weighted = useMemo(() => weightedCgpa(marks), [marks]);
  // Cumulative CGPA as printed in the university's CGPA tables (identical on every record).
  const officialCgpa = useMemo(() => records.find((r) => r.cgpa !== null)?.cgpa ?? null, [records]);
  const distribution = useMemo(() => gradeDistribution(marks), [marks]);
  const courseCredits = subjectData?.courseCredits ?? {};

  // Ranks are by the university's cumulative CGPA, so a student is compared on every
  // semester they have sat, not only the ones a gazette printed credits for.
  const ranking = useMemo(() => {
    if (!students) return null;
    const best = new Map<string, { branch: string; cgpa: number }>();
    for (const s of students) {
      if (s.cgpa === null) continue;
      const current = best.get(s.roll);
      if (!current || current.cgpa < s.cgpa) best.set(s.roll, { branch: s.branch, cgpa: s.cgpa });
    }
    const rows = [...best.entries()]
      .map(([rollNumber, v]) => ({ roll: rollNumber, branch: v.branch, cgpa: v.cgpa }))
      .sort((a, b) => b.cgpa - a.cgpa);
    const overall = new Map<string, number>();
    const byBranch = new Map<string, number>();
    rows.forEach((r, i) => overall.set(r.roll, i + 1));
    for (const branch of new Set(rows.map((r) => r.branch))) {
      rows.filter((r) => r.branch === branch).forEach((r, i) => byBranch.set(r.roll, i + 1));
    }
    return { overall, byBranch, rankedStudents: rows.length };
  }, [students]);

  const chartValues = SEMESTERS
    .map((sem) => ({ sem, sgpa: semesterMap.get(sem)?.sgpa ?? null }))
    .filter((x): x is { sem: number; sgpa: number } => x.sgpa !== null && x.sgpa > 0);
  const chartMin = chartValues.length
    ? Math.max(0, Math.floor((Math.min(...chartValues.map(value => value.sgpa)) - 0.5) * 2) / 2)
    : 0;
  const chartMax = chartValues.length
    ? Math.min(10, Math.ceil((Math.max(...chartValues.map(value => value.sgpa)) + 0.5) * 2) / 2)
    : 10;
  const chartRange = chartMax - chartMin;
  const chartStep = [0.25, 0.5, 1, 1.5, 2, 2.5, 5, 10].find(step => chartRange / step <= 5) ?? 10;
  const chartTicks = Array.from(
    { length: Math.floor(chartRange / chartStep + 1e-9) + 1 },
    (_, index) => chartMax - chartStep * index,
  );
  const plot = chartValues.map((x, i) => ({
    ...x,
    x: 58 + (x.sem - 1) * (530 / 7),
    y: 20 + ((chartMax - x.sgpa) / chartRange) * 140,
  }));
  const path = plot.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const highest = chartValues.length
    ? chartValues.reduce((a, b) => (b.sgpa > a.sgpa ? b : a))
    : null;
  const rank = student && ranking ? ranking.overall.get(student.roll) ?? null : null;
  const branchRank = student && ranking ? ranking.byBranch.get(student.roll) ?? null : null;
  const markedSemesters = SEMESTERS.filter((sem) => marks[sem]?.subjects?.length);

  const shell = (children: React.ReactNode) => (
    <div className="profileShell">
      <Link href="/results" className="backLink"><ArrowLeft size={16} /> Back to results</Link>
      {children}
      <footer className="profileFooter">
        <BrandLogo compact />
        <p>Unofficial student project · Verify all entries against the original gazette.</p>
      </footer>
    </div>
  );

  if (error) return shell(
    <section className="profilePanel">
      <h1>Could not load this profile</h1>
      <p>{error}</p>
    </section>,
  );

  if (!students || !subjectData) return shell(
    <section className="profilePanel loading"><Loader2 className="spin" size={22} /><p>Loading student record…</p></section>,
  );

  if (!student) return shell(
    <section className="profilePanel">
      <h1>Student not found</h1>
      <p>No record found for roll number {roll}.</p>
      <Link className="blueButton" href="/results">Return to results</Link>
    </section>,
  );

  return shell(
    <>
      <header className="profileHero">
        <div className="profileAvatar"><GraduationCap size={30} /></div>
        <div className="profileIdentity">
          <h1>{student.name}</h1>
          <p>{student.roll}</p>
          <div className="profileTags">
            <LiveViewCount />
            <span>{student.branch}</span><span>{student.year} batch</span><span>NSUT B.Tech</span>
          </div>
        </div>
        <div className="profileHeaderRight">
          <span className="verifiedDot" /> Gazette data{" "}
          <span className="profileDivider">·</span>{" "}
          {Array.from(new Set(records.map((r) => r.ay))).sort().map(academicYearLabel).join(", ")}
        </div>
      </header>

      <section className="metricGrid">
        <div className="metric greenMetric">
          <small>Total CGPA</small>
          <b>{officialCgpa === null ? "—" : officialCgpa.toFixed(2)}</b>
          <span>{officialCgpa === null ? "Not in the CGPA tables" : "Cumulative · university CGPA table"}</span>
        </div>
        <div className="metric greenMetric">
          <small>Best semester</small>
          <b>{highest ? highest.sgpa.toFixed(2) : "—"}</b>
          <span>{highest ? `Semester ${highest.sem}` : "No SGPA available"}</span>
        </div>
        <div className="metric">
          <small>Overall rank</small>
          <b>{rank ? `#${rank}` : "—"}</b>
          <span>{ranking ? `Of ${ranking.rankedStudents.toLocaleString("en-IN")} students by total CGPA` : "Unavailable"}</span>
        </div>
        <div className="metric">
          <small>Branch rank</small>
          <b>{branchRank ? `#${branchRank}` : "—"}</b>
          <span>Within {student.branch}</span>
        </div>
        <div className="metric">
          <small>Semesters found</small>
          <b>{semesterMap.size}/8</b>
          <span>{markedSemesters.length} with subject marks</span>
        </div>
      </section>

      <section className="profileContentGrid">
        <div className="profilePanel trendPanel">
          <div className="panelTitle">
            <h2>Semester SGPA trend</h2>
            {chartValues.length >= 2 && <span className="trendBadge"><TrendingUp size={13} /> Performance history</span>}
          </div>
          {plot.length ? (
            <div className="chartWrap">
              <svg viewBox="0 0 620 205" role="img" aria-label={`Semester SGPA trend chart, vertical scale ${chartMin.toFixed(1)} to ${chartMax.toFixed(1)}`}>
                {chartTicks.map((val, i) => {
                  const y = 20 + ((chartMax - val) / chartRange) * 140;
                  return (
                    <g key={i}>
                      <line x1="42" y1={y} x2="582" y2={y} className="chartGrid" />
                      <text x="5" y={y + 4} className="chartLabel">
                        {val.toFixed(chartStep < 0.5 ? 2 : chartStep < 1 || chartStep % 1 !== 0 ? 1 : 0)}
                      </text>
                    </g>
                  );
                })}
                {SEMESTERS.map(sem => {
                  const x = 58 + (sem - 1) * (530 / 7);
                  return (
                    <text key={sem} x={x} y="185" textAnchor="middle" className="chartLabel">
                      S{sem}
                    </text>
                  );
                })}
                {plot.length > 1 && <path d={path} className="chartLine" />}
                {plot.map((p) => (
                  <g key={p.sem}>
                    <circle cx={p.x} cy={p.y} r="4.2" className="chartPoint" />
                    <title>{`Semester ${p.sem}: ${p.sgpa.toFixed(2)}`}</title>
                  </g>
                ))}
              </svg>
            </div>
          ) : (
            <div className="emptyChart">
              No SGPA above zero is recorded for this student, so there is no trend to plot.
            </div>
          )}
          <p className="chartNote">
            <Info size={13} /> Semesters shown without a value are either RL (result later) or a
            semester where the student failed every subject, which the gazette prints as SGPA 0.00.
          </p>
        </div>

        <div className="profilePanel semesterSummary">
          <h2>Semester summary</h2>
          <p className="mutedText">
            {weighted.credits
              ? `${weighted.credits} registered credits · ${weighted.creditPoints} credit points recorded`
              : "No credit-level data recorded yet"}
          </p>
          <div className="semesterRows">
            {SEMESTERS.map((sem) => {
              const r = semesterMap.get(sem);
              const m = marks[sem];
              return (
                <div className="semesterRow" key={sem}>
                  <span className="semesterDot">{sem}</span>
                  <span className="semesterName">
                    Semester {sem}
                    <small>{r ? examPeriod(r.ay, sem) : "No record found"}</small>
                  </span>
                  <b className={r?.sgpa && r.sgpa > 0 ? "goodValue" : ""}>{r ? sgpaLabel(r.sgpa) : "—"}</b>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="profilePanel academicRecord">
        <div className="panelTitle">
          <div>
            <h2>Subject-wise marks</h2>
            <p className="mutedText">
              Transcribed from the subject-wise gazettes (Nov–Dec 2023, Apr–May 2024 and Nov–Dec 2025) · {distribution.length ? `${distribution.reduce((sum, d) => sum + d.count, 0)} subjects` : "none available"}
            </p>
          </div>
          <BookOpen size={20} />
        </div>

        {distribution.length > 0 && (
          <div className="gradeChips">
            {distribution.map((d) => (
              <span className="gradeChip" key={d.grade}>
                <b>{d.grade}</b> {d.count}
              </span>
            ))}
          </div>
        )}

        {markedSemesters.length ? (
          markedSemesters.map((sem) => (
            <div className="subjectBlock" key={sem}>
              <div className="subjectBlockHead">
                <h3>Semester {sem}</h3>
                <span>
                  SGPA {sgpaLabel(semesterMap.get(sem)?.sgpa ?? null)} · {marks[sem].credits} credits ·{" "}
                  {marks[sem].creditPoints} credit points · {examPeriod(marks[sem].ay, sem)}
                </span>
              </div>
              <div className="tableScroll">
                <table className="subjectTable">
                  <thead>
                    <tr><th>Course code</th><th>Grade</th><th>Grade points</th><th>Credits</th><th>Credit points</th></tr>
                  </thead>
                  <tbody>
                    {marks[sem].subjects.map((s) => (
                      <tr key={s.code}>
                        <td className="mono">{s.code}</td>
                        <td><span className={`gradeBadge g-${s.grade.replace("+", "plus")}`}>{s.grade}</span></td>
                        <td>{GRADE_POINTS[s.grade] ?? "—"}</td>
                        <td>{subjectCredits(s, courseCredits) ?? "—"}</td>
                        <td>{s.cp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : (
          <p className="mutedText">
            No subject-wise marks are available for this student. The Apr–May 2026 gazettes publish
            SGPA only, so those semesters use the semester cards above.
          </p>
        )}

        <div className="recordGrid">
          {SEMESTERS.map((sem) => {
            const r = semesterMap.get(sem);
            const m = marks[sem];
            return (
              <article className="recordCard" key={sem}>
                <header><strong>Semester {sem}</strong><b>{r ? sgpaLabel(r.sgpa) : "—"}</b></header>
                <div className="recordBody">
                  <div><span>RESULT</span><b>{!r ? "Not in gazettes" : r.sgpa === null ? "RL / unavailable" : r.sgpa === 0 ? "Failed all subjects" : "SGPA available"}</b></div>
                  <div><span>MARKS</span><b>{m?.subjects?.length ? `${m.subjects.length} subjects` : "SGPA only"}</b></div>
                  <div><span>EXAM</span><b>{r ? examPeriod(r.ay, sem) : "—"}</b></div>
                </div>
              </article>
            );
          })}
        </div>

      </section>
    </>,
  );
}
