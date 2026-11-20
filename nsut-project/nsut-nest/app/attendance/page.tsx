"use client";

/**
 * Attendance tab — overall gauge, subject breakdown and, on tapping a subject,
 * the date-wise calendar for that subject.
 *
 * Reads the saved IMS snapshot (attendance, daily marks and the portal's own
 * legend) so nothing is fetched again here and the numbers match the dashboard.
 */

import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronRight, RefreshCw } from "lucide-react";
import "../attendance-tab.css";
import { SubjectSheet } from "../subject-sheet";
import {
  ATTENDANCE_REFRESH_STATUS_EVENT,
  ATTENDANCE_SYNC_EVENT,
  readStoredAttendance,
  requestAttendanceRefresh,
} from "../../lib/app-storage";
import { withResolvedSubjectNames } from "../../lib/attendance";
import HubShell from "../app-shell";
import { attendanceTone, Skeleton, useOnlineStatus } from "../ui";

const POLICY = 75;

type SubjectRow = {
  title: string;
  code: string;
  attended: number;
  held: number;
  percent: number;
};

type LiveAttendancePayload = {
  roll: string;
  semester?: string;
  subjects: { code: string; name: string; held: number; present: number; percent: number }[];
  daily?: { date: string; values: Record<string, string> }[];
  statusLegend?: Record<string, string>;
  attendanceLegend?: Record<string, "present" | "absent">;
  syncedAt: string;
};

/** Classes that can still be missed while staying at or above 75%. */
function skipBudget(attended: number, held: number): number {
  return held > 0 ? Math.max(0, Math.floor(attended / (POLICY / 100) - held)) : 0;
}

/** Consecutive classes needed to climb back to 75%. */
function attendBudget(attended: number, held: number): number {
  return held > 0 ? Math.max(0, Math.ceil((POLICY / 100) * held - attended) / (1 - POLICY / 100)) : 0;
}

function actionLine(row: SubjectRow, tone: ReturnType<typeof attendanceTone>): string {
  if (tone === "none") return "No classes held yet";
  if (row.percent < POLICY) return `Attend ${Math.ceil(attendBudget(row.attended, row.held))} consecutive classes to reach 75%`;
  if (tone === "borderline") return `Can miss ${skipBudget(row.attended, row.held)} more · you are right at the 75% line`;
  return `Can miss ${skipBudget(row.attended, row.held)} more classes and stay at 75%`;
}

const TONE_LABEL = { risk: "At risk", borderline: "Borderline", safe: "Safe", none: "No data" } as const;

function AttendanceGauge({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={`nestGauge ${clamped >= POLICY ? "safe" : "risk"}`}
      style={{ background: `conic-gradient(currentColor ${clamped}%, #26313d 0)` }}
      role="img"
      aria-label={`Overall attendance ${clamped.toFixed(1)} percent, 75 percent minimum`}
    >
      <div>
        <b>{clamped.toFixed(1)}%</b>
        <small>overall</small>
      </div>
    </div>
  );
}

export default function Attendance() {
  return (
    <HubShell>
      <AttendanceBody />
    </HubShell>
  );
}

function AttendanceBody() {
  const online = useOnlineStatus();
  const [liveAttendance, setLiveAttendance] = useState<LiveAttendancePayload | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetCode, setSheetCode] = useState<string | null>(null);
  const [riskFirst, setRiskFirst] = useState(false);

  useEffect(() => {
    const sync = () => {
      try {
        const cached = readStoredAttendance();
        const parsed = cached ? (JSON.parse(cached) as LiveAttendancePayload) : null;
        setLiveAttendance(parsed?.roll?.trim() ? { ...parsed, subjects: withResolvedSubjectNames(parsed.subjects) } : null);
      } catch {
        setLiveAttendance(null);
      } finally {
        setReady(true);
      }
    };
    sync();
    window.addEventListener(ATTENDANCE_SYNC_EVENT, sync);
    return () => window.removeEventListener(ATTENDANCE_SYNC_EVENT, sync);
  }, []);

  useEffect(() => {
    const onStatus = (event: Event) => setRefreshing(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(ATTENDANCE_REFRESH_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(ATTENDANCE_REFRESH_STATUS_EVENT, onStatus);
  }, []);

  const rows = useMemo<SubjectRow[]>(
    () =>
      liveAttendance?.subjects?.map((subject) => ({
        title: subject.name || subject.code,
        code: subject.code,
        attended: subject.present,
        held: subject.held,
        percent: subject.percent,
      })) ?? [],
    [liveAttendance],
  );

  const orderedRows = useMemo(() => {
    if (riskFirst) return [...rows].sort((a, b) => a.percent - b.percent);
    const rank = { risk: 0, borderline: 1, safe: 2, none: 3 } as const;
    return [...rows].sort((a, b) => rank[attendanceTone(a.percent, a.held)] - rank[attendanceTone(b.percent, b.held)]);
  }, [rows, riskFirst]);

  const attendedTotal = rows.reduce((total, row) => total + (row.held ? row.attended : 0), 0);
  const heldTotal = rows.reduce((total, row) => total + (row.held ? row.held : 0), 0);
  const overall = heldTotal ? (attendedTotal / heldTotal) * 100 : 0;
  const atRisk = rows.filter((row) => row.percent < POLICY && row.held > 0).length;

  // Tapping a subject opens its sheet: what-if numbers, then the calendar.
  const sheetRow = rows.find((row) => row.code === sheetCode) ?? null;

  return (
    <div className="nestHome attPage">
      <header className="nestHead">
        <div className="nestHeadCopy">
          <p className="nestKicker">Live status</p>
          <h1>Attendance</h1>
          <p className="nestHeadNote">
            {liveAttendance
              ? `Synced ${new Date(liveAttendance.syncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
              : "Connect NSUT IMS to load subject-wise attendance"}
          </p>
        </div>
        {liveAttendance && (
          <button className="nestRefreshBtn" type="button" onClick={() => requestAttendanceRefresh()} disabled={refreshing || !online}>
            <RefreshCw size={13} className={refreshing ? "attSpinIcon" : ""} aria-hidden="true" />
            {refreshing ? "Updating…" : online ? "Refresh IMS" : "Offline"}
          </button>
        )}
      </header>

      {!ready ? (
        <Skeleton rows={2} />
      ) : !liveAttendance || !rows.length ? (
        <div className="nestEmpty nestEmptyOnCard">
          <Activity size={22} aria-hidden="true" />
          <div><b>No attendance saved</b><p>Sign in to NSUT IMS to load real subject-wise attendance.</p></div>
          <button className="nestBtn nestBtnSmall" type="button" onClick={() => requestAttendanceRefresh()}>Connect IMS</button>
        </div>
      ) : (
        <>
          <section className="attSummary" aria-labelledby="attOverall">
            <div className="attSummaryHead">
              <div>
                <span>Overall standing</span>
                <h2 id="attOverall">{overall >= POLICY ? "Above 75% line" : "Below 75% line"}</h2>
              </div>
              <span className={`attDelta ${overall >= POLICY ? "up" : "down"}`}>
                {overall >= POLICY ? "+" : ""}{(overall - POLICY).toFixed(1)} pts
              </span>
            </div>
            <div className="attSummaryBody">
              <AttendanceGauge percent={overall} />
              <dl className="attStats">
                <div><dt>Attended</dt><dd>{attendedTotal}</dd></div>
                <div><dt>Held</dt><dd>{heldTotal}</dd></div>
                <div><dt>Subjects</dt><dd>{rows.length}</dd></div>
              </dl>
            </div>
          </section>

          <div className="nestSectionHead attSectionHead">
            <div>
              <p className="nestKicker">Subject breakdown</p>
              <h2>
                {atRisk ? `${atRisk} below 75%` : "All above 75%"}
                <span className="attCount">{rows.length}</span>
              </h2>
            </div>
            <button className="attSort" type="button" onClick={() => setRiskFirst((value) => !value)} aria-pressed={riskFirst}>
              {riskFirst ? "Default order" : "Risk first"}
            </button>
          </div>

          <div className="attList">
            {orderedRows.map((row) => {
              const tone = attendanceTone(row.percent, row.held);
              return (
                <div className={`attSubject ${tone}`} key={row.code}>
                  <button
                    className="attSubjectHead"
                    type="button"
                    onClick={() => setSheetCode(row.code)}
                    aria-haspopup="dialog"
                  >
                    <span className="attSubjectTitle">
                      <b>{row.title}</b>
                      <span className="attCode">{row.code}</span>
                    </span>
                    <strong className={tone}>{row.held ? `${row.percent.toFixed(1)}%` : "—"}</strong>
                    <ChevronRight size={15} className="attChev" aria-hidden="true" />
                    <span className="attSubjectMeta">{row.attended} of {row.held} classes</span>
                    <span className="attSubjectNote">
                      <span className={`attDot ${tone}`} aria-hidden="true" />
                      <em className={tone}>{TONE_LABEL[tone]}</em> · {actionLine(row, tone)}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {sheetRow && (
            <SubjectSheet
              subject={{
                title: sheetRow.title,
                code: sheetRow.code,
                attended: sheetRow.attended,
                held: sheetRow.held,
                percent: sheetRow.percent,
              }}
              daily={liveAttendance.daily ?? []}
              attendanceLegend={liveAttendance.attendanceLegend}
              statusLegend={liveAttendance.statusLegend}
              onClose={() => setSheetCode(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
