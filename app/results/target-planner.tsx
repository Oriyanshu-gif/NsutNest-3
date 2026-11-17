"use client";

/**
 * Target CGPA planner: pick a goal with the slider, choose whether it must be
 * reached next semester or by the end of the degree, and read the average SGPA
 * that implies. The maths lives in lib/result-plan.ts.
 */

import { useState } from "react";
import { requiredSgpa } from "../../lib/result-plan";
import { SEM_COUNT, type StudentRecord } from "./record";

type Goal = "next" | "degree";

export default function TargetPlanner({ record }: { record: StudentRecord }) {
  const graded = record.semesters.length;
  const [goal, setGoal] = useState<Goal>("degree");
  const [target, setTarget] = useState<number>(Math.min(10, Math.round(((record.cgpa ?? 7) + 0.3) * 20) / 20));

  const remaining = goal === "next" ? Math.min(1, SEM_COUNT - graded) : Math.max(0, SEM_COUNT - graded);
  const needed = requiredSgpa(
    target,
    record.semesters.map((semester) => ({ sgpa: semester.sgpa, credits: semester.credits })),
    remaining,
  );
  const feasible = needed !== null && needed <= 10;
  const done = remaining === 0;

  return (
    <section className="rsPanel" aria-labelledby="plannerTitle">
      <div className="rsPanelHead">
        <span className="rsPanelIcon" aria-hidden="true">◎</span>
        <div>
          <h3 id="plannerTitle">Target CGPA planner</h3>
          <p>What the rest of the degree has to average.</p>
        </div>
      </div>

      <div className="rsGoal">
        <button type="button" className={goal === "next" ? "on" : ""} onClick={() => setGoal("next")} aria-pressed={goal === "next"}>
          Next semester
        </button>
        <button type="button" className={goal === "degree" ? "on" : ""} onClick={() => setGoal("degree")} aria-pressed={goal === "degree"}>
          Full degree
        </button>
      </div>

      <label className="rsSlider">
        <span>
          <small>Target CGPA</small>
          <b>{target.toFixed(2)}</b>
        </span>
        <input
          type="range"
          min={4}
          max={10}
          step={0.05}
          value={target}
          aria-label="Target CGPA"
          onChange={(event) => setTarget(Number(event.target.value))}
        />
        <span className="rsSliderEnds"><em>4</em><em>10</em></span>
      </label>

      <div className={`rsVerdict ${done ? "isDone" : feasible ? "isOk" : "isHard"}`}>
        <b>
          {done
            ? "Degree complete"
            : needed === null
              ? "Not enough credit data"
              : feasible
                ? `${needed.toFixed(2)} SGPA`
                : "Not reachable"}
        </b>
        <span>
          {done
            ? "All eight semesters are graded, so the CGPA is final."
            : needed === null
              ? "The gazette lists no credits for the graded semesters, so the average cannot be worked out."
              : feasible
                ? `Average needed across the remaining ${remaining} semester${remaining === 1 ? "" : "s"} to finish on ${target.toFixed(2)}.`
                : `Even a clean 10.00 next semester cannot lift the CGPA to ${target.toFixed(2)}; the highest reachable is lower.`}
        </span>
        {!done && feasible && record.cgpa !== null && target > record.cgpa && (
          <em>{Math.max(0, target - record.cgpa).toFixed(2)} above the CGPA you hold today.</em>
        )}
      </div>
    </section>
  );
}
