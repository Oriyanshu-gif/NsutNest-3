"use client";

/**
 * NsutNest dashboard.
 *
 * Order: greeting + identity, a data-driven "needs attention" strip, four metric
 * cards, the personalised exam date sheet, attendance beside notices, then campus spots.
 *
 * Every figure is read from data already on this device (IMS attendance), the
 * published results dataset, the COE date sheet, or the live notice board. There
 * are no estimated percentages and no fabricated exam dates.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  ArrowUpRight,
  BellRing,
  CalendarDays,
  ChevronRight,
  Clock,
  ExternalLink,
  GraduationCap,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react";
import { loadStudents, type Student } from "../lib/data";
import { withResolvedSubjectNames } from "../lib/attendance";
import {
  ATTENDANCE_REFRESH_STATUS_EVENT,
  ATTENDANCE_SYNC_EVENT,
  PROFILE_SYNC_EVENT,
  readStoredAttendance,
  readStoredProfile,
  requestAttendanceRefresh,
} from "../lib/app-storage";
import {
  refreshNotices,
  relativeNoticeDate,
  useNoticeStore,
} from "../lib/notices-client";
import {
  formatExamDate,
  getExamCountdown,
  loadDatesheet,
  matchStudentExams,
  type DatesheetPayload,
} from "../lib/datesheet";
import HubShell from "./app-shell";
import { SubjectAttendanceCalendar } from "./attendance-calendar";
import {
  attendanceTone,
  OfflineBanner,
  Skeleton,
  StatusChip,
  useOnlineStatus,
} from "./ui";

type SubjectRow = {
  title: string;
  code: string;
  attended: number;
  held: number;
  percent: number;
  canSkip: number;
  mustAttend: number;
};

type LiveAttendancePayload = {
  name: string;
  roll: string;
  semester: string;
  academicYear?: string;
  selectedSemester?: string;
  subjects: { code: string; name: string; held: number; absent: number; present: number; percent: number; canSkip: number; mustAttend: number }[];
  daily?: { date: string; values: Record<string, string> }[];
  statusLegend?: Record<string, string>;
  attendanceLegend?: Record<string, "present" | "absent">;
  syncedAt: string;
};

const POLICY = 75;

const SHARED_HANGOUTS = [
  { name: "Grover Sweets", place: "Sweets & snacks", url: "https://share.google/QWKzCOF5mPXxIsLR8", img: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80", alt: "Indian sweets and snacks" },
  { name: "Nescafé – NSUT Delhi", place: "Coffee & café", url: "https://share.google/3VLepXCwTjoKprx1q", img: "/images/hangouts/nescafe-nsut.png", alt: "Nescafé café at NSUT, photo supplied by the user" },
  { name: "Mehfil Restaurant", place: "New Delhi · Restaurant", url: "https://share.google/qwWGaFPImDuVKFjgm", img: "/images/hangouts/mehfil-restaurant.png", alt: "Mehfil Restaurant signboard, photo supplied by the user" },
] as const;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function subjectAttendanceMonths(daily: LiveAttendancePayload["daily"], code: string): string[] {
  return Array.from(
    new Set(
      (daily ?? [])
        .filter((day) => day.values[code] && /^\d{4}-\d{2}-\d{2}$/.test(day.date))
        .map((day) => day.date.slice(0, 7)),
    ),
  ).sort();
}

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
  if (tone === "borderline") return `Can miss ${skipBudget(row.attended, row.held)} more classes. You are right at the 75% line.`;
  return `Can miss ${skipBudget(row.attended, row.held)} more classes and stay at 75%`;
}

/* ---------- Circular gauge with a visible 75% marker ---------- */
function Gauge({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const good = clamped >= POLICY;

  return (
    <div className="gauge">
      <svg viewBox="0 0 120 120" width="132" height="132" role="img" aria-label={`Overall attendance ${clamped.toFixed(1)} percent, 75 percent minimum`}>
        <circle cx="60" cy="60" r={radius} fill="none" className="gaugeTrack" strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          className={`gaugeArcLine ${good ? "good" : "low"}`}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 60 60)"
        />
        {/* 75% sits exactly at the left of the ring. */}
        <line x1="3" y1="60" x2="15" y2="60" className="gaugeTick" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="gaugeCenter">
        <b>{clamped.toFixed(1)}%</b>
        <small>overall</small>
      </div>
    </div>
  );
}

function SkipEstimator({ subject }: { subject: SubjectRow }) {
  const [mode, setMode] = useState<"miss" | "attend">("miss");
  const [count, setCount] = useState(0);
  const isAttend = mode === "attend";
  const projected = isAttend
    ? ((subject.attended + count) / (subject.held + count)) * 100
    : (subject.attended / (subject.held + count)) * 100;
  const below = projected < POLICY;

  return (
    <div className="skipEstimator">
      <div className="skipHead">
        <div className="skipHeadText">
          <span className="skipTitle">What if…</span>
          <small className="skipSub">Project your attendance</small>
        </div>
        <span className="skipTag">Estimate</span>
      </div>
      <div className="skipModes" role="group" aria-label="Choose an attendance scenario">
        <button
          type="button"
          className={!isAttend ? "active" : ""}
          aria-pressed={!isAttend}
          onClick={() => setMode("miss")}
        >
          I miss classes
        </button>
        <button
          type="button"
          className={isAttend ? "active" : ""}
          aria-pressed={isAttend}
          onClick={() => setMode("attend")}
        >
          I attend classes
        </button>
      </div>
      <div className="skipBody">
        <div className="skipStepper" role="group" aria-label={`Number of classes to ${isAttend ? "attend" : "miss"}`}>
          <button type="button" onClick={() => setCount((value) => Math.max(0, value - 1))} disabled={count === 0} aria-label={`${isAttend ? "Attend" : "Miss"} one fewer class`}>
            <Minus size={16} aria-hidden="true" />
          </button>
          <span className="skipValue"><b>{count}</b><small>class{count === 1 ? "" : "es"}</small></span>
          <button type="button" onClick={() => setCount((value) => Math.min(20, value + 1))} disabled={count >= 20} aria-label={`${isAttend ? "Attend" : "Miss"} one more class`}>
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="skipResult" aria-live="polite">
          Projected <b className={below ? "low" : ""}>{projected.toFixed(1)}%</b>
          <span className={`skipVerdict ${below ? "low" : "good"}`}>{below ? "Below 75%" : "Above 75%"}</span>
        </p>
      </div>
      <small className="skipNote">
        {isAttend
          ? "Assumes those future classes are held and you attend every one."
          : "Assumes those future classes are held and you miss every one."}
      </small>
    </div>
  );
}

export default function Overview() {
  return (
    <HubShell>
      <OverviewBody />
    </HubShell>
  );
}

function OverviewBody() {
  const noticeStore = useNoticeStore();
  const online = useOnlineStatus();
  const [students, setStudents] = useState<Student[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveAttendance, setLiveAttendance] = useState<LiveAttendancePayload | null>(null);
  const [attendanceReady, setAttendanceReady] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [attendanceRefreshing, setAttendanceRefreshing] = useState(false);
  const [retryingNotices, setRetryingNotices] = useState(false);
  const [selectedAttendanceSubject, setSelectedAttendanceSubject] = useState<string | null>(null);
  const [attendanceCalendarMonth, setAttendanceCalendarMonth] = useState("");
  const [sortByRisk, setSortByRisk] = useState(true);
  const [campusMapOpen, setCampusMapOpen] = useState(false);
  const [greetingText, setGreetingText] = useState("Welcome");
  const [dateLine, setDateLine] = useState("");
  const [datesheet, setDatesheet] = useState<DatesheetPayload | null>(null);

  useEffect(() => {
    const onStatus = (event: Event) => setAttendanceRefreshing((event as CustomEvent<boolean>).detail);
    window.addEventListener(ATTENDANCE_REFRESH_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(ATTENDANCE_REFRESH_STATUS_EVENT, onStatus);
  }, []);

  useEffect(() => {
    let active = true;
    loadDatesheet()
      .then((payload) => {
        if (active) setDatesheet(payload);
      })
      .catch(() => {
        // The schedule simply stays unset; attendance and notices still render.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const now = new Date();
    setGreetingText(greeting(now));
    setDateLine(`${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`);
  }, []);

  useEffect(() => {
    const sync = () => {
      try {
        const profile = readStoredProfile();
        if (profile) {
          const parsedProfile = JSON.parse(profile) as { name?: string };
          setProfileName(parsedProfile.name?.trim() ?? "");
        }
        const cached = readStoredAttendance();
        const parsed = cached ? (JSON.parse(cached) as LiveAttendancePayload) : null;
        if (!parsed?.roll?.trim()) {
          setLiveAttendance(null);
          setAttendanceReady(true);
          return;
        }
        setLiveAttendance({ ...parsed, subjects: withResolvedSubjectNames(parsed.subjects) });
      } catch {
        setLiveAttendance(null);
      } finally {
        setAttendanceReady(true);
      }
    };
    sync();
    window.addEventListener(ATTENDANCE_SYNC_EVENT, sync);
    window.addEventListener(PROFILE_SYNC_EVENT, sync);
    return () => {
      window.removeEventListener(ATTENDANCE_SYNC_EVENT, sync);
      window.removeEventListener(PROFILE_SYNC_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    let active = true;
    loadStudents().then(
      (rows) => active && setStudents(rows),
      (failure) => active && setError(failure instanceof Error ? failure.message : "Could not load results data."),
    );
    return () => {
      active = false;
    };
  }, []);

  const me = useMemo<Student | null>(() => {
    const roll = liveAttendance?.roll.trim().toUpperCase();
    if (!students?.length || !roll) return null;
    return students
      .filter((student) => student.roll.trim().toUpperCase() === roll)
      .reduce<Student | null>((latest, student) => {
        if (!latest || student.ay > latest.ay || (student.ay === latest.ay && student.semester > latest.semester)) return student;
        return latest;
      }, null);
  }, [students, liveAttendance?.roll]);

  const subjectRows = useMemo<SubjectRow[]>(
    () =>
      liveAttendance?.subjects?.map((subject) => ({
        title: subject.name || subject.code,
        code: subject.code,
        attended: subject.present,
        held: subject.held,
        percent: subject.percent,
        canSkip: subject.canSkip,
        mustAttend: subject.mustAttend,
      })) ?? [],
    [liveAttendance],
  );

  const attendedTotal = subjectRows.reduce((total, row) => total + (row.held ? row.attended : 0), 0);
  const heldTotal = subjectRows.reduce((total, row) => total + (row.held ? row.held : 0), 0);
  const overall = heldTotal ? (attendedTotal / heldTotal) * 100 : 0;

  const needsAttention = useMemo(
    () =>
      subjectRows
        .filter((row) => {
          const tone = attendanceTone(row.percent, row.held);
          return tone === "risk" || tone === "borderline";
        })
        .sort((a, b) => a.percent - b.percent),
    [subjectRows],
  );
  const atRiskCount = needsAttention.filter((row) => row.percent < POLICY).length;
  const borderlineCount = needsAttention.length - atRiskCount;

  const orderedRows = useMemo(() => {
    if (!sortByRisk) return subjectRows;
    const rank = { risk: 0, borderline: 1, safe: 2, none: 3 } as const;
    return [...subjectRows].sort((a, b) => {
      const toneA = attendanceTone(a.percent, a.held);
      const toneB = attendanceTone(b.percent, b.held);
      return rank[toneA] - rank[toneB] || a.percent - b.percent;
    });
  }, [subjectRows, sortByRisk]);


  const notices = noticeStore.payload?.notices ?? [];
  const noticesPreview = notices.slice(0, 4);
  const newThisWeek = useMemo(() => {
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    return notices.filter((notice) => notice.isoDate >= week).length;
  }, [notices]);
  const noticesUsingCache = noticeStore.usingCache || (!online && Boolean(noticeStore.payload));

  const studentExams = useMemo(() => {
    if (!datesheet || !liveAttendance?.subjects?.length) return [];
    return matchStudentExams(
      liveAttendance.subjects.map((subject) => subject.code),
      datesheet,
      liveAttendance.selectedSemester || liveAttendance.semester,
    );
  }, [datesheet, liveAttendance]);

  const nextExam = useMemo(() => {
    const now = new Date();
    return (
      studentExams.find((exam) => {
        const { status } = getExamCountdown(exam.isoDate, now);
        return status === "today" || status === "upcoming";
      }) ?? null
    );
  }, [studentExams]);

  const laterExams = nextExam ? studentExams.filter((exam) => exam.code !== nextExam.code) : studentExams;
  const nextCountdown = nextExam ? getExamCountdown(nextExam.isoDate) : null;

  const summaryLine = useMemo(() => {
    if (nextExam && nextCountdown) {
      const when = nextCountdown.status === "today"
        ? "today"
        : `in ${nextCountdown.daysRemaining} day${nextCountdown.daysRemaining === 1 ? "" : "s"}`;
      if (needsAttention.length) {
        return `Your next exam is ${when} and ${needsAttention.length} subject${needsAttention.length === 1 ? "" : "s"} need attention.`;
      }
      return `Your next exam is ${when}. Attendance is above the 75% line.`;
    }
    if (needsAttention.length) {
      const base = `${atRiskCount} subject${atRiskCount === 1 ? " is" : "s are"} below the 75% line`;
      return borderlineCount
        ? `${base} and ${borderlineCount} more ${borderlineCount === 1 ? "is" : "are"} close to it.`
        : `${base}.`;
    }
    if (heldTotal) return "Every subject is above the 75% attendance line.";
    return "Sign in with NSUT IMS to see attendance, exam dates and notices.";
  }, [nextExam, nextCountdown, needsAttention.length, atRiskCount, borderlineCount, heldTotal]);

  if (error) {
    return (
      <div className="empty">
        <AlertTriangle size={30} />
        <h3>Could not load the dashboard</h3>
        <p>{error}</p>
      </div>
    );
  }

  const attendanceFresh =
    !!liveAttendance && Date.now() - new Date(liveAttendance.syncedAt).getTime() < 6 * 60 * 60 * 1000;
  const rawName = (liveAttendance?.name || profileName).trim();
  const firstName = rawName
    ? rawName
        .toLowerCase()
        .replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
        .split(/\s+/)[0]
    : "";
  const latestSgpa = me?.sgpa ?? null;

  async function retryNotices() {
    if (retryingNotices) return;
    setRetryingNotices(true);
    try {
      await refreshNotices();
    } finally {
      setRetryingNotices(false);
    }
  }

  function renderNoticePreview() {
    if (noticeStore.error && !noticeStore.payload) {
      return (
        <div className="attEmpty">
          <AlertTriangle size={24} />
          <p>{noticeStore.error}</p>
          <button className="ntSecondary" type="button" onClick={retryNotices} disabled={retryingNotices}>
            <RefreshCw size={13} className={retryingNotices ? "attSpinIcon" : ""} /> Retry
          </button>
        </div>
      );
    }
    if (!noticeStore.payload) {
      return <Skeleton rows={4} />;
    }
    if (!noticesPreview.length) {
      return (
        <div className="attEmpty">
          <BellRing size={24} />
          <p>No notices on the board right now.</p>
        </div>
      );
    }
    return (
      <div className="hubNoticeList">
        {noticesPreview.map((notice) => (
          <a
            className="hubNoticeRow"
            key={`${notice.isoDate}-${notice.title}`}
            href={notice.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open PDF: ${notice.title}`}
          >
            <span className="hubNoticeText">
              <h4>{notice.title}</h4>
              <p>
                {notice.department || "NSUT"} ·{" "}
                <time dateTime={notice.isoDate}>{relativeNoticeDate(notice.isoDate)}</time>
              </p>
            </span>
            <ExternalLink size={16} className="hubNoticeChev" aria-hidden="true" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <>
      {(!online || noticesUsingCache) && attendanceReady && (
        <OfflineBanner
          lastSynced={liveAttendance?.syncedAt ?? noticeStore.payload?.fetchedAt ?? null}
          onRetry={retryNotices}
          retrying={retryingNotices}
        />
      )}

      {/* ---- Greeting + identity + dynamic summary ---- */}
      <section className="hubHero">
        <div className="hubHeroText" suppressHydrationWarning>
          {dateLine && <div className="hubDateLine">{dateLine}</div>}
          <h1>
            {greetingText}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="hubSummary">{summaryLine}</p>
        </div>
        <div className="rollCard" suppressHydrationWarning>
          <small>Student roll</small>
          <b>{liveAttendance ? liveAttendance.roll || "IMS connected" : "IMS not connected"}</b>
          <span className="rollMeta">
            {liveAttendance
              ? `${attendanceFresh ? "Live IMS" : "Saved attendance"} · synced ${new Date(liveAttendance.syncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
              : "Sign in to load your attendance"}
          </span>
        </div>
      </section>

      {/* ---- Metric cards ---- */}
      <section className="summaryCards">
        <div className="summaryCard attCard">
          <Activity className="scIcon att" size={20} aria-hidden="true" />
          <small>Overall attendance</small>
          <b>{heldTotal ? `${overall.toFixed(1)}%` : "—"}</b>
          <span className="scFoot">
            {liveAttendance ? (attendanceFresh ? "Fetched from NSUT IMS" : "Saved from NSUT IMS") : "Connect to IMS first"}
          </span>
        </div>
        <a className="summaryCard sgpaCard" href={me ? `/student/${encodeURIComponent(me.roll)}` : "/results"}>
          <GraduationCap className="scIcon sgpa" size={20} aria-hidden="true" />
          <small>Latest SGPA</small>
          <b>{latestSgpa !== null ? latestSgpa.toFixed(2) : "—"}</b>
          <span className="scFoot">
            {me ? `Sem ${me.semester} · ${me.ay}-${String(me.ay + 1).slice(-2)} · ` : ""}
            Result details <ArrowUpRight size={12} aria-hidden="true" />
          </span>
        </a>
        <Link className="summaryCard notCard" href="/notices">
          <span className="scIcon not"><BellRing size={18} aria-hidden="true" /></span>
          <small>Notices this week</small>
          <b>{noticeStore.payload ? String(newThisWeek).padStart(2, "0") : "—"}</b>
          <span className="scFoot">
            {noticeStore.payload ? "Latest from the IMS board" : "Loading notices"}
            <ArrowUpRight size={12} aria-hidden="true" />
          </span>
        </Link>
        <a className="summaryCard examCard" href="#exams">
          <CalendarDays className="scIcon exam" size={20} aria-hidden="true" />
          <small>Upcoming examination</small>
          <b>
            {nextCountdown
              ? nextCountdown.status === "today"
                ? "Today"
                : `${nextCountdown.daysRemaining}`
              : "—"}
            {nextCountdown && nextCountdown.status !== "today" && <span className="scUnit"> days</span>}
          </b>
          <span className="scFoot">
            {nextExam
              ? `${nextExam.code} · ${formatExamDate(nextExam.isoDate).formattedDate}`
              : studentExams.length
                ? "No upcoming exam on the sheet"
                : "Sign in to match your date sheet"}
            {nextExam && <ArrowUpRight size={12} aria-hidden="true" />}
          </span>
        </a>
      </section>

      {/* ---- Personalised date sheet ---- */}
      <section className="examScheduleSection" id="exams">
        <div className="hubCard examScheduleCard">
          <div className="examPrintLetterhead" suppressHydrationWarning>
            <b>NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY</b>
            <span>Azad Hind Fauj Marg, Sector-3, Dwarka, New Delhi - 110078</span>
            <small>OFFICE OF THE CONTROLLER OF EXAMINATION</small>
            <h3>End-Semester Examination Date Sheet (Odd Semester 2026-27)</h3>
            <div className="examPrintStudentMeta">
              <span><b>Student:</b> {rawName || "Student"}</span>
              <span><b>Roll No:</b> {liveAttendance?.roll || "—"}</span>
              <span><b>Semester:</b> {liveAttendance?.selectedSemester || liveAttendance?.semester || "—"}</span>
            </div>
          </div>

          <div className="hubCardHead examCardHead">
            <div>
              <small className="panelKicker">End-sem date sheet · Odd Semester 2026-27</small>
              <h2>{liveAttendance ? "Your exam schedule" : "End-sem exam schedule"}</h2>
            </div>
            <div className="examScheduleActions">
              <span className="examScheduleNoticeTag">Tentative · COE 06/11/2026</span>
              {liveAttendance && studentExams.length > 0 && (
                <button
                  type="button"
                  className="panelLink examPrintButton"
                  onClick={() => window.print()}
                  title="Print your end-sem exam schedule"
                >
                  <Printer size={13} aria-hidden="true" /> Print date sheet
                </button>
              )}
            </div>
          </div>

          {!liveAttendance ? (
            <div className="examScheduleUnsigned">
              <CalendarDays size={26} className="examScheduleUnsignedIcon" aria-hidden="true" />
              <div className="examScheduleUnsignedText">
                <h3>Personalised exam dates for your subjects</h3>
                <p>Sign in to NSUT IMS above to match your registered subjects with the official end-sem date sheet.</p>
              </div>
            </div>
          ) : studentExams.length === 0 ? (
            <div className="examScheduleUnsigned">
              <CalendarDays size={26} className="examScheduleUnsignedIcon" aria-hidden="true" />
              <div className="examScheduleUnsignedText">
                <h3>No written exams scheduled in the tentative date sheet</h3>
                <p>Your current subjects are practical or continuous-evaluation courses.</p>
              </div>
            </div>
          ) : (
            <>
              {nextExam && nextCountdown && (
                <div className="examNextSpotlight">
                  <div className="examNextSpotlightContent">
                    <span className="examNextBadge">Next upcoming exam</span>
                    <h3>{nextExam.name}</h3>
                    <div className="examNextDetails">
                      <span className="examNextCode">{nextExam.code}</span>
                      <span>
                        {formatExamDate(nextExam.isoDate).dayOfWeek}, {formatExamDate(nextExam.isoDate).formattedDate}
                      </span>
                      <span className="examNextShift">
                        <Clock size={12} aria-hidden="true" /> {nextExam.shift} · {nextExam.time}
                      </span>
                    </div>
                  </div>
                  <div className="examNextCountdown">
                    <span className={`examCountdownBadge ${nextCountdown.status}`}>{nextCountdown.label}</span>
                  </div>
                </div>
              )}

              <div className="studentExamList">
                {laterExams.map((exam) => {
                  const countdown = getExamCountdown(exam.isoDate);
                  const { dayOfWeek, formattedDate } = formatExamDate(exam.isoDate);
                  return (
                    <div key={exam.code} className={`studentExamRow ${countdown.status === "passed" ? "isPassed" : ""}`}>
                      <div className="studentExamDate">
                        <b>{formattedDate.split(" ")[0]}</b>
                        <span>{formattedDate.split(" ")[1]}</span>
                        <small>{dayOfWeek.slice(0, 3)}</small>
                      </div>
                      <div className="studentExamBody">
                        <div className="studentExamTitleRow">
                          <h4>{exam.name}</h4>
                          <span className="attCode">{exam.code}</span>
                        </div>
                        <div className="studentExamSubRow">
                          <span className="studentExamShift">
                            <Clock size={12} aria-hidden="true" /> {exam.shift} · {exam.time}
                          </span>
                        </div>
                      </div>
                      <div className="studentExamStatus">
                        <span className={`examCountdownBadge ${countdown.status}`}>{countdown.label}</span>
                      </div>
                    </div>
                  );
                })}
                {!nextExam && !laterExams.length && (
                  <p className="examEmptyList">No exams are left on this date sheet.</p>
                )}
              </div>

              <div className="examScheduleFooter">
                <span>Shift 1: 10:00 AM – 01:00 PM · Shift 2: 02:00 PM – 05:00 PM</span>
                <span className="examDiscrepancy">
                  Clashes or discrepancies? Email <a href="mailto:examination@nsut.ac.in">examination@nsut.ac.in</a>
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ---- Attendance + notices/rail ---- */}
      <section className="duoGrid">
        <div className="hubCard attPanel" id="attendance">
          {attendanceRefreshing && (
            <div className="attRefreshOverlay" role="status" aria-live="polite">
              <div className="attRefreshOverlayInner">
                <Loader2 size={34} className="attSpinIcon" aria-hidden="true" />
                <strong>Updating attendance…</strong>
                <span>Fetching the latest records from IMS</span>
              </div>
            </div>
          )}

          <div className="hubCardHead attHead">
            <div className="attHeadText">
              <small className="panelKicker attKicker">
                <span className="attLiveDot" aria-hidden="true" />
                Live status
              </small>
              <h2>Attendance</h2>
              <span className="attSyncedInline">
                {liveAttendance
                  ? `Synced ${new Date(liveAttendance.syncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
                  : "Not synced yet"}
              </span>
            </div>
            <div className="attPanelActions">
              {liveAttendance && (
                <button
                  className="attRefreshButton"
                  type="button"
                  onClick={() => requestAttendanceRefresh()}
                  disabled={attendanceRefreshing || !online}
                  aria-label={online ? "Refresh attendance from IMS" : "Offline. Reconnect to refresh attendance."}
                  title={
                    online
                      ? "Fetch the latest attendance from NSUT IMS. If your IMS ID is saved on this device, only the CAPTCHA is asked for."
                      : "You are offline. Reconnect to refresh attendance."
                  }
                >
                  <RefreshCw size={14} className={attendanceRefreshing ? "attSpinIcon" : undefined} aria-hidden="true" />
                  {attendanceRefreshing ? "Updating…" : online ? "Refresh IMS" : "Offline"}
                </button>
              )}
            </div>
          </div>

          {!attendanceReady ? (
            <Skeleton rows={5} />
          ) : !liveAttendance || !subjectRows.length ? (
            <div className="attEmpty">
              <TrendingUp size={26} aria-hidden="true" />
              <p>Sign in to NSUT IMS to load your real subject-wise attendance. No estimated attendance is shown.</p>
            </div>
          ) : (
            <div className="attSummary">
              <Gauge percent={overall} />
              <div className="attSummaryText">
                <div className="attSummaryTop">
                  <div>
                    <span className="attSummaryEyebrow">Overall standing</span>
                    <h3>{overall >= POLICY ? "Above 75% line" : "Below 75% line"}</h3>
                  </div>
                  <span className={`attDelta ${overall >= POLICY ? "good" : "low"}`}>
                    {overall >= POLICY ? "+" : "−"}{Math.abs(overall - POLICY).toFixed(1)} pts
                  </span>
                </div>
                <div className="attSummaryStats">
                  <div><b>{attendedTotal}</b><span>attended</span></div>
                  <div><b>{heldTotal}</b><span>classes</span></div>
                  <div><b>{subjectRows.length}</b><span>subjects</span></div>
                </div>
              </div>
            </div>
          )}

          {subjectRows.length > 0 && (
            <>
              <div className="attListTools">
                <span className="attListLabel">
                  Subject breakdown
                  <small>{subjectRows.length}</small>
                </span>
                <div className="attListActions">
                  <button
                    className="attToolButton"
                    type="button"
                    onClick={() => setSortByRisk((value) => !value)}
                    aria-pressed={sortByRisk}
                  >
                    <ArrowDownUp size={14} aria-hidden="true" />
                    {sortByRisk ? "Risk first" : "Default order"}
                  </button>
                </div>
              </div>

              <div className="attRows">
                {orderedRows.map((row) => {
                  const expanded = selectedAttendanceSubject === row.code;
                  const tone = attendanceTone(row.percent, row.held);
                  const months = subjectAttendanceMonths(liveAttendance?.daily, row.code);
                  const percentLabel = row.held ? `${row.percent.toFixed(1)}%` : "";
                  return (
                    <div className={`attRow attRow--${tone} ${expanded ? "expanded" : ""}`} key={row.code} id={`att-row-${row.code}`}>
                      <button
                        className="attSubjectButton"
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => {
                          if (expanded) {
                            setSelectedAttendanceSubject(null);
                          } else {
                            setSelectedAttendanceSubject(row.code);
                            setAttendanceCalendarMonth(months.length ? months[months.length - 1] : "");
                          }
                        }}
                      >
                        <span className="attRowText">
                          <span className="attRowTitle">
                            {row.title}
                            {row.title !== row.code && <span className="attCode">{row.code}</span>}
                          </span>
                          <span className="attRowStats">
                            {row.held ? <><b>{row.attended}</b> of <b>{row.held}</b> classes</> : "No classes held yet"}
                          </span>
                          {row.held > 0 && (
                            <span className="attRowFoot">
                              <StatusChip tone={tone} />
                              <span className={`attAction ${tone}`}>{actionLine(row, tone)}</span>
                            </span>
                          )}
                        </span>
                        <span className="attSubjectActions">
                          {percentLabel && <b className={`attPct ${tone}`}>{percentLabel}</b>}
                          <ChevronRight size={16} className={expanded ? "attSubjectChevron expanded" : "attSubjectChevron"} aria-hidden="true" />
                        </span>
                      </button>

                      {expanded && liveAttendance && (
                        <div className="attExpanded">
                          {row.held > 0 && <SkipEstimator subject={row} />}
                          <SubjectAttendanceCalendar
                            subject={row}
                            daily={liveAttendance.daily ?? []}
                            attendanceLegend={liveAttendance.attendanceLegend}
                            statusLegend={liveAttendance.statusLegend}
                            month={attendanceCalendarMonth}
                            months={months}
                            onMonthChange={setAttendanceCalendarMonth}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="duoRail">
          <div className="hubCard noticesPanel">
            <div className="hubCardHead">
              <div>
                <small className="panelKicker">Circulars &amp; orders</small>
                <h2>Important notices</h2>
              </div>
              <Link className="panelLink" href="/notices">
                View all notices <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </div>

            {noticesUsingCache && noticeStore.payload && (
              <p className="panelOffline">
                Offline · saved {relativeNoticeDate(new Date(noticeStore.payload.fetchedAt).toISOString().slice(0, 10))}
              </p>
            )}

            {renderNoticePreview()}
          </div>
        </div>
      </section>

      {/* ---- Campus spots ---- */}
      <section className="hangouts">
        <div className="hubCardHead hangoutsHead">
          <div>
            <small className="panelKicker">Campus spots</small>
            <h2>Popular hangouts</h2>
          </div>
          <button className="panelLink campusExploreButton" type="button" onClick={() => setCampusMapOpen(true)}>
            Explore campus <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        </div>
        <div className="hangoutGrid sharedHangoutGrid">
          {SHARED_HANGOUTS.map((hangout) => (
            <a className="hangoutCard sharedHangoutCard" key={hangout.url} href={hangout.url} target="_blank" rel="noreferrer">
              <div className="hangoutImg sharedHangoutPhoto">
                <img src={hangout.img} alt={hangout.alt} loading="lazy" width="900" height="560" />
                <span className="sharedHangoutPhotoLabel"><MapPin size={13} aria-hidden="true" /> Popular hangout</span>
              </div>
              <div className="hangoutMeta">
                <div className="hangoutName">
                  <h3>{hangout.name}</h3>
                  <p><MapPin size={12} aria-hidden="true" /> {hangout.place}</p>
                </div>
                <ArrowUpRight size={16} aria-hidden="true" />
              </div>
            </a>
          ))}
        </div>
      </section>

      {campusMapOpen && (
        <div
          className="campusMapOverlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCampusMapOpen(false);
          }}
        >
          <section className="campusMapDialog" role="dialog" aria-modal="true" aria-label="NSUT campus map">
            <div className="campusMapHeader">
              <div><small className="panelKicker">Campus overview</small><h2>Campus map</h2></div>
              <button type="button" className="campusMapClose" aria-label="Close campus map" onClick={() => setCampusMapOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <img
              className="campusMapImage"
              src="/campus-map.png"
              alt="Illustrated map of the NSUT campus with academic blocks, hostels, grounds, library and main gate"
            />
          </section>
        </div>
      )}
    </>
  );
}
