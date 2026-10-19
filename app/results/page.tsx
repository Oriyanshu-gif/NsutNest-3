"use client";

/**
 * Results — the original NSUT leaderboard, now living at /results behind the
 * HUB sidebar. Behaviour is unchanged: one card per student ranked by the
 * university's total CGPA, or by SGPA when a semester is selected.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Trophy, ChevronDown, Loader2, AlertTriangle } from "lucide-react";
import {
  SEMESTERS, academicYearLabel, examPeriod, loadStudents, sgpaLabel, type Student,
} from "../../lib/data";
import HubShell from "../hub-shell";

const PAGE_SIZE = 20;
const PAGE_STEP = 40;

/**
 * One leaderboard card. Every student appears once, no matter how many semester
 * records they have, so the card leads with the university's cumulative CGPA and
 * links to the profile for the per-semester detail.
 */
type BoardEntry = {
  roll: string;
  student: Student;
  /** Cumulative CGPA from the university's CGPA tables, or null when unpublished. */
  cgpa: number | null;
  /** Highest SGPA across all of the student's records. */
  best: { semester: number; sgpa: number; ay: number } | null;
  /** How many distinct semesters have a record. */
  semesters: number;
  /** Record for the selected semester, when one is selected (better attempt). */
  record: Student | null;
};

export default function Results() {
  return (
    <HubShell>
      <ResultsBoard />
    </HubShell>
  );
}

function ResultsBoard() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("All");
  const [semester, setSemester] = useState("All");
  const [branches, setBranches] = useState<string[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    let active = true;
    loadStudents().then(
      (rows) => active && setStudents(rows),
      (err) => active && setError(err instanceof Error ? err.message : "Could not load the results data."),
    );
    return () => { active = false; };
  }, []);

  // Batches and branches are read from the data instead of being hard-coded, so a
  // new gazette cannot leave the filters pointing at batches that do not exist.
  const years = useMemo(
    () => (students ? Array.from(new Set(students.map((s) => s.year))).sort((a, b) => Number(b) - Number(a)) : []),
    [students],
  );
  const branchList = useMemo(
    () => (students ? Array.from(new Set(students.map((s) => s.branch))).sort() : []),
    [students],
  );

  const semesterFilter = semester === "All" ? null : Number(semester);

  // One entry per student. Picking a semester switches both what the card shows and
  // how it ranks: with no semester chosen the board is the university's total CGPA.
  const board = useMemo(() => {
    if (!students) return [];
    const q = query.trim().toLowerCase();
    const byRoll = new Map<string, Student[]>();
    for (const s of students) {
      if (q && !s.search.includes(q)) continue;
      if (year !== "All" && s.year !== year) continue;
      if (branches.length !== 0 && !branches.includes(s.branch)) continue;
      const rows = byRoll.get(s.roll);
      if (rows) rows.push(s); else byRoll.set(s.roll, [s]);
    }
    const entries: BoardEntry[] = [];
    for (const [roll, rows] of byRoll) {
      const cgpa = rows.find((r) => r.cgpa !== null)?.cgpa ?? null;
      let best: BoardEntry["best"] = null;
      let record: Student | null = null;
      for (const r of rows) {
        if (r.sgpa !== null && (!best || r.sgpa > best.sgpa)) {
          best = { semester: r.semester, sgpa: r.sgpa, ay: r.ay };
        }
        if (semesterFilter !== null && r.semester === semesterFilter &&
            (!record || (record.sgpa ?? -1) < (r.sgpa ?? -1))) {
          record = r;
        }
      }
      if (semesterFilter !== null && !record) continue; // never sat that semester
      entries.push({
        roll, student: rows[0], cgpa, best, record,
        semesters: new Set(rows.map((r) => r.semester)).size,
      });
    }
    const score = (e: BoardEntry) => (semesterFilter === null ? (e.cgpa ?? -1) : (e.record?.sgpa ?? -1));
    return entries.sort((a, b) => score(b) - score(a) || a.student.name.localeCompare(b.student.name));
  }, [students, query, year, semesterFilter, branches]);

  useEffect(() => { setLimit(PAGE_SIZE); }, [query, year, semester, branches]);

  const isFiltered = query.trim() !== "" || year !== "All" || semester !== "All" || branches.length > 0;
  const shown = board.slice(0, limit);
  const toggleBranch = (b: string) =>
    setBranches((cur) => (cur.includes(b) ? cur.filter((x) => x !== b) : [...cur, b]));
  const resetFilters = () => { setQuery(""); setYear("All"); setSemester("All"); setBranches([]); };

  return (
    <main className="resultsShell">
      <section className="hero">
        <div className="eyebrow"><span /> STUDENT PERFORMANCE INDEX</div>
        <h1>Results, ranked<span className="accentDot">.</span></h1>
        <p>Search NSUT B.Tech semester results across batches and branches.</p>
      </section>

      <section className="filters">
        <label className="search">
          <Search size={21} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by student name, roll number or branch..." />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>
        <div className="filterGroup">
          <div className="label">BATCH YEAR</div>
          <div className="pills">
            <button className={`pill ${year === "All" ? "active" : ""}`} onClick={() => setYear("All")}>All</button>
            {years.map((y) => <button key={y} className={`pill ${year === y ? "active" : ""}`} onClick={() => setYear(y)}>{y}</button>)}
          </div>
        </div>
        <div className="filterGroup">
          <div className="label">SEMESTER</div>
          <div className="pills">
            <button className={`pill ${semester === "All" ? "active" : ""}`} onClick={() => setSemester("All")}>All</button>
            {SEMESTERS.map((s) => <button key={s} className={`pill ${semester === String(s) ? "active" : ""}`} onClick={() => setSemester(String(s))}>Sem {s}</button>)}
          </div>
        </div>
        <div className="filterGroup">
          <div className="label">BRANCH <span>(select multiple)</span></div>
          <div className="pills">
            <button className={`pill ${branches.length === 0 ? "active" : ""}`} onClick={() => setBranches([])}>All</button>
            {branchList.map((b) => <button key={b} className={`pill ${branches.includes(b) ? "active" : ""}`} onClick={() => toggleBranch(b)}>{b}</button>)}
          </div>
        </div>
      </section>

      <section className="leaderboard">
        <div className="boardHead">
          <div><Trophy size={19} /><h2>Student leaderboard</h2></div>
          <span>
            {students
              ? `Showing ${shown.length.toLocaleString("en-IN")} of ${board.length.toLocaleString("en-IN")} students`
              : "Loading…"}
          </span>
        </div>

        {error ? (
          <div className="empty">
            <AlertTriangle size={30} />
            <h3>Could not load the results</h3>
            <p>{error}</p>
          </div>
        ) : !students ? (
          <div className="loading"><Loader2 className="spin" size={24} /><p>Loading result records…</p></div>
        ) : !board.length ? (
          <div className="empty">
            <Search size={30} />
            <h3>No students found</h3>
            <p>Try another name, roll number, batch, or branch.</p>
            <button className="pill active" onClick={resetFilters}>Reset filters</button>
          </div>
        ) : (
          <>
            <p className="viewNote">
              {semesterFilter === null
                ? "One card per student, ranked by the university's total CGPA."
                : `One card per student, ranked by semester ${semesterFilter} SGPA (better attempt where the same semester was sat twice).`}
              {" Open a profile for the semester-by-semester breakdown."}
            </p>
            <div className="studentList">
              {shown.map((e, i) => {
                const headline = semesterFilter === null ? e.cgpa : e.record?.sgpa ?? null;
                return (
                <Link href={`/student/${encodeURIComponent(e.roll)}`} className="student studentLink" key={e.roll}>
                  <div className="studentTop">
                    <div className="rank">#{i + 1}</div>
                    <div className="identity">
                      <h3>{e.student.name}</h3>
                      <p>{e.roll}</p>
                      <div className="tags">
                        <span>{e.student.branch}</span>
                        <span>{e.student.year} batch</span>
                        <span>{e.semesters} semester{e.semesters === 1 ? "" : "s"}</span>
                        {semesterFilter !== null && (
                          <>
                            <span>SEM {semesterFilter}</span>
                            {e.record && <span>{academicYearLabel(e.record.ay)}</span>}
                          </>
                        )}
                        {i === 0 && headline !== null && (
                          <span className="topRank"><Trophy size={12} /> {isFiltered ? "BEST IN VIEW" : "TOP CGPA"}</span>
                        )}
                      </div>
                    </div>
                    <div className="cgpa">
                      <b className={headline === 0 ? "zeroScore" : ""}>{sgpaLabel(headline)}</b>
                      <small>{semesterFilter === null ? "CGPA" : "SGPA"}</small>
                      {semesterFilter !== null && e.cgpa !== null && (
                        <small className="totalCgpaPill">CGPA {e.cgpa.toFixed(2)}</small>
                      )}
                    </div>
                  </div>
                  <div className="cardFooter">
                    <span className="percentile"><i />
                      {semesterFilter === null
                        ? (e.best ? `Best semester ${e.best.semester} · ${e.best.sgpa.toFixed(2)}` : "No SGPA above zero")
                        : (e.record
                            ? (e.record.sgpa === null ? "Result later / RL" : `${examPeriod(e.record.ay, semesterFilter)} result`)
                            : "")}
                    </span>
                    <span className="pdfHint">View student profile ↗</span>
                  </div>
                </Link>
                );
              })}
            </div>
          </>
        )}

        {students && shown.length < board.length && (
          <button className="loadMore" onClick={() => setLimit((l) => l + PAGE_STEP)}>
            Show {Math.min(PAGE_STEP, board.length - shown.length)} more
            <ChevronDown size={16} />
          </button>
        )}
      </section>

      <footer>
        <p>Unofficial student project · Data imported from the 2022–23 to 2025–26 semester gazettes and CGPA tables</p>
      </footer>
    </main>
  );
}
