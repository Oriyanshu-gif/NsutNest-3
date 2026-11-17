"use client";

/**
 * Results — the NSUT leaderboard, restyled to match the rest of the hub
 * (same header, panel-card and chip language as Study material / TNP).
 * Behaviour is unchanged: one card per student ranked by the university's
 * total CGPA, or by SGPA when a semester is selected.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Trophy, ChevronDown, Loader2, TriangleAlert, GraduationCap, ArrowUpRight, RotateCcw } from "lucide-react";
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
    <div className="rsShell">
      <header className="rsHead">
        <div>
          <small className="panelKicker">Gazette · B.Tech results</small>
          <h1>Results<span className="rsAccent">, ranked</span></h1>
          <p>Every semester gazette and CGPA table, searchable by name, roll number, batch or branch.</p>
        </div>
      </header>

      <section className="hubCard rsFilterPanel">
        <label className="rsSearch">
          <Search size={18} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, roll number or branch"
            aria-label="Search students by name, roll number or branch" />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>

        <div className="rsFilterRow">
          <span className="rsFilterLabel">Batch</span>
          <div className="pills">
            <button className={`rsChip ${year === "All" ? "rsChipOn" : ""}`} onClick={() => setYear("All")}>All years</button>
            {years.map((y) => <button key={y} className={`rsChip ${year === y ? "rsChipOn" : ""}`} onClick={() => setYear(y)}>{y} batch</button>)}
          </div>
        </div>
        <div className="rsFilterRow">
          <span className="rsFilterLabel">Semester</span>
          <div className="pills">
            <button className={`rsChip ${semester === "All" ? "rsChipOn" : ""}`} onClick={() => setSemester("All")}>All semesters</button>
            {SEMESTERS.map((s) => <button key={s} className={`rsChip ${semester === String(s) ? "rsChipOn" : ""}`} onClick={() => setSemester(String(s))}>Sem {s}</button>)}
          </div>
        </div>
        <div className="rsFilterRow">
          <span className="rsFilterLabel">Branch<br /><small>multiple</small></span>
          <div className="pills">
            <button className={`rsChip ${branches.length === 0 ? "rsChipOn" : ""}`} onClick={() => setBranches([])}>All branches</button>
            {branchList.map((b) => <button key={b} className={`rsChip ${branches.includes(b) ? "rsChipOn" : ""}`} onClick={() => toggleBranch(b)}>{b}</button>)}
          </div>
        </div>

        {isFiltered && (
          <button className="rsReset" onClick={resetFilters}>
            <RotateCcw size={13} /> Reset filters
          </button>
        )}
      </section>

      <section className="hubCard rsBoard">
        <div className="rsBoardHead">
          <div className="rsBoardTitle">
            <span className="rsTrophy"><Trophy size={16} /></span>
            <div>
              <small className="panelKicker">Student leaderboard</small>
              <h2>{semesterFilter === null ? "Ranked by total CGPA" : `Ranked by semester ${semesterFilter} SGPA`}</h2>
            </div>
          </div>
          <span className="rsBoardCount" aria-live="polite">
            {students
              ? `Showing ${shown.length.toLocaleString("en-IN")} of ${board.length.toLocaleString("en-IN")} students`
              : "…"}
          </span>
        </div>

        {error ? (
          <div className="empty">
            <TriangleAlert size={30} />
            <h3>Could not load the results</h3>
            <p>{error}</p>
            <button className="rsMore" onClick={() => window.location.reload()}>Reload page</button>
          </div>
        ) : !students ? (
          <div className="loading"><Loader2 className="spin" size={24} /><p>Loading result records…</p></div>
        ) : !board.length ? (
          <div className="empty">
            <GraduationCap size={30} />
            <h3>No students found</h3>
            <p>Try another name, roll number, batch, or branch.</p>
            <button className="rsMore" onClick={resetFilters}>Reset filters</button>
          </div>
        ) : (
          <>
            <p className="rsNote">
              {semesterFilter === null
                ? "One card per student, ranked by the university's total CGPA."
                : `One card per student, ranked by semester ${semesterFilter} SGPA (better attempt where the same semester was sat twice).`}
              {" Open a profile for the semester-by-semester breakdown."}
            </p>
            <div className="rsGrid">
              {shown.map((e, i) => {
                const headline = semesterFilter === null ? e.cgpa : e.record?.sgpa ?? null;
                return (
                  <Link href={`/student/${encodeURIComponent(e.roll)}`} className="rsCard" key={e.roll}>
                    <div className="rsCardTop">
                      <div className={`rsRank${i < 3 ? ` rsRank${i + 1}` : ""}`}>#{i + 1}</div>
                      <div className="rsIdentity">
                        <h3>{e.student.name}</h3>
                        <p>{e.roll}</p>
                        <div className="rsTags">
                          <span>{e.student.branch}</span>
                          <span className="rsTagMuted">{e.student.year} batch</span>
                          <span className="rsTagMuted">{e.semesters} semester{e.semesters === 1 ? "" : "s"}</span>
                        </div>
                      </div>
                      <div className="rsScore">
                        <b className={headline === 0 ? "zeroScore" : ""}>{sgpaLabel(headline)}</b>
                        <small>{semesterFilter === null ? "CGPA" : "SGPA"}</small>
                        {semesterFilter !== null && e.cgpa !== null && (
                          <small className="totalCgpaPill">CGPA {e.cgpa.toFixed(2)}</small>
                        )}
                      </div>
                    </div>
                    {semesterFilter !== null && e.record && (
                      <div className="rsSemMeta">
                        <span className="rsSemBadge">Sem {semesterFilter}</span>
                        <span className="rsSemYear">{academicYearLabel(e.record.ay)}</span>
                      </div>
                    )}
                    <div className="rsCardFoot">
                      <span className="rsFootMeta">
                        {semesterFilter === null
                          ? (e.best
                              ? <>Best semester <b>{e.best.semester}</b> · <b>{e.best.sgpa.toFixed(2)}</b> SGPA</>
                              : "No SGPA above zero")
                          : (e.record
                              ? (e.record.sgpa === null ? "Result later (RL) announced by the university" : `${examPeriod(e.record.ay, semesterFilter)} result`)
                              : "")}
                      </span>
                      <span className="rsProfileLink">Profile <ArrowUpRight size={13} /></span>
                    </div>
                    {i === 0 && headline !== null && (
                      <span className="rsTopBadge"><Trophy size={12} /> {isFiltered ? "Best in view" : "Top CGPA"}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {students && shown.length < board.length && (
          <button className="rsMore" onClick={() => setLimit((l) => l + PAGE_STEP)}>
            Show {Math.min(PAGE_STEP, board.length - shown.length)} more students
            <ChevronDown size={16} />
          </button>
        )}
      </section>

      <footer className="hubFooter">
        <p>NsutNest · unofficial student project</p>
        <small>Compiled from the 2022–23 to 2025–26 semester gazettes and CGPA tables.</small>
      </footer>
    </div>
  );
}
