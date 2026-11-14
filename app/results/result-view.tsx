"use client";

/**
 * Results tab: the signed-in student's record first — profile header, SGPA
 * progression, planner, simulator and grade sheet — with the leaderboard below.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, GraduationCap } from "lucide-react";
import { readStoredPhoto } from "../../lib/app-storage";
import type { Student } from "../../lib/data";
import { useStudentRecord } from "./record";
import SgpaChart from "./sgpa-chart";
import TargetPlanner from "./target-planner";
import GradeSimulator from "./grade-simulator";
import GradeSheet from "./grade-sheet";
import "./results.css";

function standing(rank: number | null, total: number): string {
  if (!rank || !total) return "Not ranked";
  const percentile = (rank / total) * 100;
  if (percentile <= 1) return "Top 1% of the gazette";
  if (percentile <= 5) return "Top 5% of the gazette";
  if (percentile <= 25) return "Top quarter of the gazette";
  if (percentile <= 50) return "Upper half of the gazette";
  return "Lower half of the gazette";
}

export default function ResultView({ students }: { students: Student[] }) {
  const { ready, record } = useStudentRecord(students);
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    setPhoto(readStoredPhoto());
  }, [record?.student.roll]);

  if (!ready) {
    return (
      <section className="rsMine rsMineEmpty">
        <span className="rsTrophy"><GraduationCap size={16} /></span>
        <div>
          <small className="panelKicker">Your result</small>
          <h2>Loading your record…</h2>
          <p>Reading the gazette, your subject marks and the attendance you saved.</p>
        </div>
      </section>
    );
  }

  if (!record) {
    return (
      <section className="rsMine rsMineEmpty">
        <span className="rsTrophy"><GraduationCap size={16} /></span>
        <div>
          <small className="panelKicker">Your result</small>
          <h2>Sign in to see your own result first</h2>
          <p>
            Connect NSUT IMS once and this page leads with your CGPA, semester-wise SGPA, a target planner,
            a grade simulator and your full grade sheet.
          </p>
        </div>
        <Link className="rsMore" href="/profile">Open My Profile <ArrowUpRight size={13} /></Link>
      </section>
    );
  }

  const latest = record.semesters[record.semesters.length - 1];
  const initials = record.student.name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <section className="rsMine" aria-labelledby="myResultTitle">
      <header className="rsProfile">
        <span className="rsAvatar" aria-hidden="true">
          {photo ? <img src={photo} alt="" /> : initials}
        </span>
        <div className="rsProfileId">
          <small className="panelKicker">Your record</small>
          <h2 id="myResultTitle">{record.student.name}</h2>
          <p>{record.student.roll} · {record.student.branch} · {record.student.year} batch</p>
        </div>
        <Link className="rsProfileLink" href={`/student/${encodeURIComponent(record.student.roll)}`}>
          Full profile <ArrowUpRight size={13} />
        </Link>
      </header>

      <div className="rsMineStats">
        <div className="rsStat">
          <small>CGPA</small>
          <b>{record.cgpa === null ? "—" : record.cgpa.toFixed(2)}</b>
          <em>{standing(record.rank, record.total)}</em>
        </div>
        <div className="rsStat">
          <small>Latest SGPA</small>
          <b>{latest ? latest.sgpa.toFixed(2) : "—"}</b>
          <em>{latest ? `Semester ${latest.semester}` : "No semester graded"}</em>
        </div>
        <div className="rsStat">
          <small>Credits earned</small>
          <b>{record.credits || "—"}</b>
          <em>{record.semesters.length} of 8 semesters graded</em>
        </div>
        <div className="rsStat">
          <small>Batch standing</small>
          <b>{record.rank ? `#${record.rank}` : "—"}</b>
          <em>
            {record.total
              ? `of ${record.total.toLocaleString("en-IN")} in ${record.cohort ?? "your batch"}`
              : "Rank unavailable"}
          </em>
        </div>
      </div>

      <div className="rsPanelGrid">
        <section className="rsPanel" aria-labelledby="sgpaChartTitle">
          <div className="rsPanelHead">
            <span className="rsPanelIcon" aria-hidden="true">↗</span>
            <div>
              <h3 id="sgpaChartTitle">SGPA progression</h3>
              <p>Every graded semester, best attempt where one was sat twice.</p>
            </div>
          </div>
          <SgpaChart semesters={record.semesters} />
        </section>

        <TargetPlanner record={record} />
      </div>

      <div className="rsPanelGrid">
        <GradeSimulator record={record} />
        <GradeSheet record={record} />
      </div>

    </section>
  );
}
