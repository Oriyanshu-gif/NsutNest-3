"use client";

/**
 * One subject's attendance, opened as a sheet from the dashboard or the
 * attendance tab: what the next class does to the percentage, then the
 * date-wise calendar for that subject.
 */

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { SubjectAttendanceCalendar } from "./attendance-calendar";

const POLICY = 75;

export type SheetSubject = {
  title: string;
  code: string;
  attended: number;
  held: number;
  percent: number;
};

/** Percentage after missing one more class. */
export function percentIfMissed(attended: number, held: number): number {
  return (attended / (held + 1)) * 100;
}

/** Percentage after attending one more class. */
export function percentIfAttended(attended: number, held: number): number {
  return ((attended + 1) / (held + 1)) * 100;
}

/** Classes that can still be missed at 75%. */
export function skippable(attended: number, held: number): number {
  return held > 0 ? Math.max(0, Math.floor(attended / (POLICY / 100) - held)) : 0;
}

/** Consecutive classes needed to climb back to 75%: (75·held − 100·attended) / 25. */
export function classesToRecover(attended: number, held: number): number {
  return held > 0 ? Math.max(0, Math.ceil((POLICY * held - 100 * attended) / (100 - POLICY))) : 0;
}

export function SubjectSheet({
  subject,
  daily = [],
  attendanceLegend,
  statusLegend,
  onClose,
}: {
  subject: SheetSubject;
  daily?: { date: string; values: Record<string, string> }[];
  attendanceLegend?: Record<string, "present" | "absent">;
  statusLegend?: Record<string, string>;
  onClose: () => void;
}) {
  const months = useMemo(
    () => [...new Set(daily.filter((day) => day.values[subject.code]).map((day) => day.date.slice(0, 7)))].sort().reverse(),
    [daily, subject.code],
  );
  const [month, setMonth] = useState(months[0] ?? "");
  const [missCount, setMissCount] = useState(0);
  const [attendCount, setAttendCount] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const skip = skippable(subject.attended, subject.held);
  const recover = classesToRecover(subject.attended, subject.held);
  // Simulator: the same subject's record with N more misses or N more attends.
  const afterMiss = (subject.attended / (subject.held + missCount || 1)) * 100;
  const afterAttend = ((subject.attended + attendCount) / (subject.held + attendCount || 1)) * 100;

  return (
    <div className="sheetBackdrop" role="presentation" onClick={onClose}>
      <div
        className="sheetPanel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheetTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheetHead">
          <div>
            <h2 id="sheetTitle">{subject.title}</h2>
            <p>{subject.code} · {subject.attended} attended of {subject.held}</p>
          </div>
          <button className="sheetClose" type="button" onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="sheetStats">
          <div><span>Current</span><b>{subject.held ? `${subject.percent.toFixed(1)}%` : "—"}</b></div>
          <div><span>Attended</span><b>{subject.attended}</b></div>
          <div><span>Held</span><b>{subject.held}</b></div>
        </div>

        {subject.held > 0 && (
          <div className="sim" aria-label="What-if simulator">
            <div className="simRow">
              <span className="simLabel">If I miss <b>{missCount}</b> {missCount === 1 ? "class" : "classes"}</span>
              <span className="simStep">
                <button type="button" onClick={() => setMissCount((value) => Math.max(0, value - 1))} disabled={!missCount} aria-label="One class less">−</button>
                <button type="button" onClick={() => setMissCount((value) => Math.min(60, value + 1))} aria-label="One class more">+</button>
              </span>
              <strong className={afterMiss < POLICY ? "bad" : "good"}>{afterMiss.toFixed(1)}%</strong>
            </div>
            <div className="simRow">
              <span className="simLabel">If I attend <b>{attendCount}</b> {attendCount === 1 ? "class" : "classes"}</span>
              <span className="simStep">
                <button type="button" onClick={() => setAttendCount((value) => Math.max(0, value - 1))} disabled={!attendCount} aria-label="One class less">−</button>
                <button type="button" onClick={() => setAttendCount((value) => Math.min(60, value + 1))} aria-label="One class more">+</button>
              </span>
              <strong className={afterAttend < POLICY ? "bad" : "good"}>{afterAttend.toFixed(1)}%</strong>
            </div>
            <p className="simNote">
              {subject.percent < POLICY
                ? <>Attend <b>{recover}</b> consecutive classes to reach 75%</>
                : <>You can still miss <b>{skip}</b> classes and stay at 75%</>}
            </p>
          </div>
        )}

        <SubjectAttendanceCalendar
          subject={{ title: subject.title, code: subject.code }}
          daily={daily}
          attendanceLegend={attendanceLegend}
          statusLegend={statusLegend}
          month={month || months[0] || ""}
          months={months}
          onMonthChange={setMonth}
        />
      </div>
    </div>
  );
}
