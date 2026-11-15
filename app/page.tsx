"use client";

import { imsFetch } from "../lib/ims-client";
/**
 * NSUT Nest home — the paper PWA layout.
 *
 * Content order follows the attached PWA mockup: greeting, next-exam hero,
 * today's classes, notices and the exam schedule. The 75% attendance view has
 * its own tab (`app/attendance`). Every value still comes from the saved IMS
 * attendance, the cached timetable, the COE date sheet or the live notice
 * board — no fabricated percentages or exam dates.
 */

import { apiUrl } from "../lib/api-base";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  BellRing,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock,
  Printer,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  ATTENDANCE_REFRESH_STATUS_EVENT,
  ATTENDANCE_SYNC_EVENT,
  PROFILE_SYNC_EVENT,
  readStoredAttendance,
  readStoredProfile,
  readStoredTimetable,
  requestAttendanceRefresh,
  writeStoredTimetable,
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
  type ExamScheduleItem,
} from "../lib/datesheet";
import { downloadExamCalendar } from "../lib/exam-calendar";
import type { TimetableEntry, TimetablePayload } from "../lib/ims-timetable";
import { withResolvedSubjectNames } from "../lib/attendance";
import HubShell from "./app-shell";
import {
  attendanceTone,
  OfflineBanner,
  Skeleton,
  useOnlineStatus,
} from "./ui";

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

const IST_TIME_ZONE = "Asia/Kolkata";
const IST_DAY_NAMES: Record<string, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};

function istNow(date = new Date()): {
  day: string;
  dayLong: string;
  minutes: number;
  fullLabel: string;
} {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = get("weekday").slice(0, 3);
  return {
    day,
    dayLong: IST_DAY_NAMES[day] ?? day,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    fullLabel: `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")}`,
  };
}

function greetingForMinutes(minutes: number): string {
  if (minutes < 5 * 60) return "Up late";
  if (minutes < 12 * 60) return "Good morning";
  if (minutes < 17 * 60) return "Good afternoon";
  return "Good evening";
}

function clock12(minutes: number, withSuffix = true): string {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = String(minutes % 60).padStart(2, "0");
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 || 12}:${minute}${withSuffix ? ` ${suffix}` : ""}`;
}

function formatTimeRange(start: number, end: number): string {
  const startSuffix = start < 12 * 60 ? "am" : "pm";
  const endSuffix = end < 12 * 60 ? "am" : "pm";
  return startSuffix === endSuffix
    ? `${clock12(start, false)}–${clock12(end, true)}`
    : `${clock12(start, true)}–${clock12(end, true)}`;
}

function entryMeta(entry: TimetableEntry): string {
  return [
    entry.code,
    entry.room,
    entry.group ? `Group ${entry.group}` : null,
    entry.tutorial ? `Tutorial ${entry.tutorial}` : null,
    entry.batch ? `Batch ${entry.batch}` : null,
    entry.section ? `Sec ${entry.section}` : null,
  ].filter(Boolean).join(" · ");
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
  const [liveAttendance, setLiveAttendance] = useState<LiveAttendancePayload | null>(null);
  const [attendanceReady, setAttendanceReady] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [attendanceRefreshing, setAttendanceRefreshing] = useState(false);
  const [retryingNotices, setRetryingNotices] = useState(false);
  const [datesheet, setDatesheet] = useState<DatesheetPayload | null>(null);
  const [timetable, setTimetable] = useState<TimetablePayload | null>(null);
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [timetableError, setTimetableError] = useState("");
  const [timetableRequest, setTimetableRequest] = useState(0);
  const [campusClock, setCampusClock] = useState<ReturnType<typeof istNow> | null>(null);
  const forceTimetableRefresh = useRef(false);

  useEffect(() => {
    const onStatus = (event: Event) => setAttendanceRefreshing(Boolean((event as CustomEvent<boolean>).detail));
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
        // The exam section stays empty; attendance, classes and notices still render.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const tick = () => setCampusClock(istNow());
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const sync = () => {
      try {
        const profile = readStoredProfile();
        if (profile) {
          const parsedProfile = JSON.parse(profile) as { name?: string; photo?: string | null };
          setProfileName(parsedProfile.name?.trim() ?? "");
          setProfilePhoto(parsedProfile.photo ?? null);
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
    const roll = liveAttendance?.roll?.trim();
    if (!roll) {
      setTimetable(null);
      setTimetableError("");
      setTimetableLoading(false);
      return;
    }

    const force = forceTimetableRefresh.current;
    forceTimetableRefresh.current = false;
    let active = true;
    let cached: TimetablePayload | null = null;

    try {
      const raw = readStoredTimetable();
      if (raw) {
        const parsed = JSON.parse(raw) as TimetablePayload;
        if (parsed?.roll?.toUpperCase() === roll.toUpperCase() && Array.isArray(parsed.slots)) {
          cached = parsed;
          setTimetable(parsed);
          const fetched = new Date(parsed.fetchedAt).getTime();
          if (!force && Number.isFinite(fetched) && Date.now() - fetched < 6 * 60 * 60 * 1000) {
            setTimetableError("");
            setTimetableLoading(false);
            return;
          }
        }
      }
    } catch {
      // A corrupt cache is treated like no cache.
    }

    if (!cached) setTimetable(null);
    setTimetableError("");
    setTimetableLoading(true);

    imsFetch("/api/ims/timetable", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as TimetablePayload & { error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load your IMS timetable.");
        if (!Array.isArray(body.slots)) throw new Error("IMS returned an empty timetable.");
        if (body.roll && body.roll.trim().toUpperCase() !== roll.toUpperCase()) {
          throw new Error("IMS returned a timetable for a different account.");
        }
        return { ...body, fetchedAt: body.fetchedAt || new Date().toISOString() };
      })
      .then((payload) => {
        if (!active) return;
        writeStoredTimetable(JSON.stringify(payload));
        setTimetable(payload);
        setTimetableError("");
      })
      .catch((failure) => {
        if (active) setTimetableError(failure instanceof Error ? failure.message : "Could not load your IMS timetable.");
      })
      .finally(() => {
        if (active) setTimetableLoading(false);
      });

    return () => {
      active = false;
    };
  }, [liveAttendance?.roll, liveAttendance?.syncedAt, timetableRequest]);

  const notices = noticeStore.payload?.notices ?? [];
  const noticesPreview = notices.slice(0, 3);
  const noticesUsingCache = noticeStore.usingCache || (!online && Boolean(noticeStore.payload));

  const studentExams = useMemo(() => {
    if (!datesheet || !liveAttendance?.subjects?.length) return [];
    return matchStudentExams(
      liveAttendance.subjects.map((subject) => subject.code),
      datesheet,
      liveAttendance.selectedSemester || liveAttendance.semester,
    );
  }, [datesheet, liveAttendance]);

  const nextExam = useMemo<ExamScheduleItem | null>(() => {
    const now = new Date();
    return studentExams.find((exam) => {
      const { status } = getExamCountdown(exam.isoDate, now);
      return status === "today" || status === "upcoming";
    }) ?? null;
  }, [studentExams]);

  const laterExams = nextExam ? studentExams.filter((exam) => exam.code !== nextExam.code) : studentExams;
  const nextCountdown = nextExam ? getExamCountdown(nextExam.isoDate) : null;

  const timetableToday = useMemo(() => {
    if (!timetable || !campusClock) return [];
    return timetable.slots.filter((slot) => slot.day === campusClock.day);
  }, [timetable, campusClock]);

  const timetableCurrent = useMemo(() => {
    if (!campusClock) return [];
    return timetableToday.filter((slot) => campusClock.minutes >= slot.startMinutes && campusClock.minutes < slot.endMinutes);
  }, [timetableToday, campusClock]);

  const timetableNext = useMemo(() => {
    if (!campusClock) return null;
    return timetableToday.find((slot) => slot.startMinutes > campusClock.minutes) ?? null;
  }, [timetableToday, campusClock]);

  const timetableNeedsIms = !liveAttendance || /sign in|session|expired/i.test(timetableError);
  const subjectNames = useMemo(
    () => new Map((liveAttendance?.subjects ?? []).map((subject) => [subject.code.toUpperCase(), subject.name])),
    [liveAttendance],
  );

  const rawName = (liveAttendance?.name || profileName).trim();
  const firstName = rawName
    ? rawName
        .toLowerCase()
        .replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`)
        .split(/\s+/)[0]
    : "";
  const initials = rawName
    ? rawName.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase()
    : "S";
  const greetingText = campusClock ? greetingForMinutes(campusClock.minutes) : "Welcome";
  const attendanceFresh = !!liveAttendance && Date.now() - new Date(liveAttendance.syncedAt).getTime() < 6 * 60 * 60 * 1000;
  // The dashboard keeps only the headline: who is at risk, the rest lives on /attendance.
  const atRiskRows = (liveAttendance?.subjects ?? [])
    .filter((subject) => subject.held > 0 && subject.percent < 75)
    .sort((a, b) => a.percent - b.percent);
  const timetableSynced = timetable?.fetchedAt
    ? new Date(timetable.fetchedAt).toLocaleTimeString("en-IN", { timeZone: IST_TIME_ZONE, hour: "2-digit", minute: "2-digit" })
    : "";

  async function retryNotices() {
    if (retryingNotices) return;
    setRetryingNotices(true);
    try {
      await refreshNotices();
    } finally {
      setRetryingNotices(false);
    }
  }

  function refreshTimetable() {
    if (timetableNeedsIms) {
      requestAttendanceRefresh();
      return;
    }
    forceTimetableRefresh.current = true;
    setTimetableRequest((value) => value + 1);
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

      <div className="nestHome">
        <header className="nestHead">
          <div className="nestHeadCopy" suppressHydrationWarning>
            {campusClock?.fullLabel && <p className="nestDate">{campusClock.fullLabel}</p>}
            <h1>
              {greetingText}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="nestHeadNote">
              {liveAttendance
                ? `${attendanceFresh ? "Live from IMS" : "Saved attendance"} · ${liveAttendance.roll}`
                : "Connect NSUT IMS to personalise this page"}
            </p>
          </div>
          <div className="nestHeadSide">
            <Link className="nestIconBtn" href="/notices" aria-label="Open notices">
              <Bell size={18} aria-hidden="true" />
              {noticesPreview.length > 0 && <span className="nestBellDot" aria-hidden="true" />}
            </Link>
            <Link className="nestAvatar" href="/profile" aria-label="Open my profile">
              {profilePhoto ? <img src={profilePhoto} alt="" /> : initials}
            </Link>
          </div>
        </header>

        <section className={`nestExamHero ${nextExam ? "" : "isClear"}`} aria-labelledby="nextExamTitle">
          <div className="nestHeroTop">
            <span className="nestHeroKicker">
              <span className="nestHeroDot" aria-hidden="true" />
              {nextExam ? "Next exam" : "Next up"}
            </span>
            <span className="nestHeroCountdown">
              {nextExam && nextCountdown ? nextCountdown.label.toLowerCase() : studentExams.length ? "Sheet complete" : "—"}
            </span>
          </div>

          {nextExam ? (
            <>
              <h2 id="nextExamTitle">{nextExam.name}</h2>
              <p className="nestHeroMeta">
                <b>{nextExam.code}</b>
                <span>{formatExamDate(nextExam.isoDate).dayOfWeek}, {formatExamDate(nextExam.isoDate).formattedDate}</span>
                <span>{nextExam.shift} · {nextExam.time}</span>
              </p>
              {laterExams[0] && (
                <Link className="nestHeroThen" href="#exams">
                  Then: {laterExams[0].name}, {formatExamDate(laterExams[0].isoDate).formattedDate}
                  <ChevronRight size={13} aria-hidden="true" />
                </Link>
              )}
            </>
          ) : (
            <>
              <h2 id="nextExamTitle">{liveAttendance ? "No upcoming exam on the tentative sheet" : "Connect IMS to see your exam dates"}</h2>
              <p className="nestHeroMeta">
                {liveAttendance
                  ? "Your current subjects are matched against the official COE date sheet."
                  : "Attendance and your personalised end-sem schedule load together."}
              </p>
            </>
          )}

          <div className="nestHeroActions">
            <Link className="nestBtn nestBtnLight" href="#exams">
              Full schedule <ChevronRight size={14} aria-hidden="true" />
            </Link>
            {nextExam ? (
              <button className="nestBtn nestBtnGhost" type="button" onClick={() => downloadExamCalendar([nextExam], rawName || "nsut-nest")}>
                <CalendarPlus size={14} aria-hidden="true" /> Add to calendar
              </button>
            ) : !liveAttendance ? (
              <button className="nestBtn nestBtnGhost" type="button" onClick={() => requestAttendanceRefresh()}>
                <Activity size={14} aria-hidden="true" /> Connect IMS
              </button>
            ) : null}
          </div>
        </section>

        <Link className={`nestRisk ${atRiskRows.length ? "hasRisk" : "isSafe"}`} href="/attendance">
          <span className="nestRiskIcon" aria-hidden="true">
            {atRiskRows.length ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
          </span>
          <span className="nestRiskCopy">
            <b>
              {atRiskRows.length
                ? `${atRiskRows.length} subject${atRiskRows.length === 1 ? "" : "s"} at risk`
                : liveAttendance
                  ? "Attendance is above the 75% line"
                  : "See your attendance"}
            </b>
            <small>
              {atRiskRows.length
                ? atRiskRows.slice(0, 2).map((row) => `${row.name || row.code} ${row.percent.toFixed(1)}%`).join(" · ")
                : liveAttendance ? "Every subject is above 75%" : "Connect IMS to load it"}
            </small>
          </span>
          <span className="nestRiskLink">View all <ChevronRight size={12} aria-hidden="true" /></span>
        </Link>

        <section className="nestSection" id="today" aria-labelledby="todayTitle">
          <div className="nestSectionHead">
            <div>
              <p className="nestKicker">Today&apos;s classes</p>
              <h2 id="todayTitle">{campusClock?.dayLong ?? "Today"}</h2>
            </div>
            <Link className="nestTextLink" href="/timetable">Full timetable <ChevronRight size={12} aria-hidden="true" /></Link>
          </div>

          {!campusClock || (timetableLoading && !timetable) ? (
            <Skeleton rows={2} />
          ) : !timetable ? (
            <div className="nestEmpty">
              <CalendarDays size={22} aria-hidden="true" />
              <div>
                <b>{timetableError ? "Timetable unavailable" : "No timetable saved yet"}</b>
                <p>{timetableError || "Connect IMS once and your classes will stay saved in this browser."}</p>
              </div>
              <button className="nestBtn nestBtnSmall" type="button" onClick={refreshTimetable}>
                <RefreshCw size={13} aria-hidden="true" /> {timetableNeedsIms ? "Connect IMS" : "Try again"}
              </button>
            </div>
          ) : !timetableToday.length ? (
            <div className="nestEmpty">
              <CalendarDays size={22} aria-hidden="true" />
              <div>
                <b>No classes scheduled for {campusClock.dayLong}</b>
                <p>{[timetable.academicYear, timetable.semester ? `Semester ${timetable.semester}` : null, "Enjoy the free day."].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="nestClassScroll" role="list" aria-label="Today's timetable" tabIndex={0}>
                {timetableToday.map((slot) => {
                  const isNow = timetableCurrent.some((item) => item.period === slot.period && item.startMinutes === slot.startMinutes);
                  const isNext = timetableNext?.period === slot.period && timetableNext?.startMinutes === slot.startMinutes;
                  const isPast = slot.endMinutes <= (campusClock?.minutes ?? 0);
                  return (
                    <article
                      className={`nestClassCard ${isNow ? "now" : isNext ? "next" : isPast ? "past" : ""}`.trim()}
                      role="listitem"
                      key={`${slot.day}-${slot.period}-${slot.start}-${slot.entries.map((entry) => entry.code).join("-")}`}
                    >
                      <div className="nestClassTop">
                        <span className="nestClassTime"><Clock size={12} aria-hidden="true" /> {formatTimeRange(slot.startMinutes, slot.endMinutes)}</span>
                        {(isNow || isNext) && <span className="nestClassBadge">{isNow ? "Now" : "Next"}</span>}
                      </div>
                      <div className="nestClassEntries">
                        {slot.entries.map((entry, index) => (
                          <div className="nestClassEntry" key={`${entry.code}-${entry.kind}-${entry.group ?? ""}-${entry.room ?? ""}-${index}`}>
                            <b>{subjectNames.get(entry.code.toUpperCase()) || entry.code}</b>
                            <span>{entryMeta(entry)}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="nestTinyFoot">
                <span>Times in IST{timetable.semester ? ` · Sem ${timetable.semester}` : ""}</span>
                <span>
                  {timetableLoading ? "Updating…" : timetableError ? "Saved copy · live refresh unavailable" : timetableSynced ? `Saved offline · synced ${timetableSynced}` : "Saved offline"}
                </span>
              </div>
            </>
          )}
        </section>

        <section className="nestSection" id="notices" aria-labelledby="noticesTitle">
          <div className="nestSectionHead">
            <div>
              <p className="nestKicker">Notice board</p>
              <h2 id="noticesTitle">Latest notices</h2>
            </div>
            <Link className="nestTextLink" href="/notices">See all <ArrowUpRight size={12} aria-hidden="true" /></Link>
          </div>

          {noticeStore.error && !noticeStore.payload ? (
            <div className="nestEmpty">
              <AlertTriangle size={22} aria-hidden="true" />
              <div><b>Notices unavailable</b><p>{noticeStore.error}</p></div>
              <button className="nestBtn nestBtnSmall" type="button" onClick={retryNotices} disabled={retryingNotices}>
                <RefreshCw size={13} className={retryingNotices ? "attSpinIcon" : ""} aria-hidden="true" /> Retry
              </button>
            </div>
          ) : !noticeStore.payload ? (
            <Skeleton rows={3} />
          ) : !noticesPreview.length ? (
            <div className="nestEmpty"><BellRing size={22} aria-hidden="true" /><div><b>No notices right now</b><p>The IMS board is clear.</p></div></div>
          ) : (
            <div className="nestNoticeList">
              {noticesPreview.map((notice) => (
                <a
                  className="nestNoticeRow"
                  key={`${notice.isoDate}-${notice.title}`}
                  href={notice.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open PDF: ${notice.title}`}
                >
                  <span className="nestNoticeIcon"><BellRing size={15} aria-hidden="true" /></span>
                  <span className="nestNoticeText">
                    <b>{notice.title}</b>
                    <small>
                      {notice.department || "NSUT"} · <time dateTime={notice.isoDate}>{relativeNoticeDate(notice.isoDate)}</time>
                    </small>
                  </span>
                  <ArrowUpRight size={14} className="nestNoticeChev" aria-hidden="true" />
                </a>
              ))}
            </div>
          )}
        </section>

                  <section className="nestSection" id="exams" aria-labelledby="examScheduleTitle">
          <div className="nestSectionHead">
            <div>
              <p className="nestKicker">Exam schedule</p>
              <h2 id="examScheduleTitle">Tentative end-sem sheet</h2>
            </div>
            <span className="nestTag">Tentative</span>
          </div>

          {!attendanceReady ? (
            <Skeleton rows={3} />
          ) : !liveAttendance ? (
            <div className="nestEmpty nestEmptyOnCard">
              <CalendarDays size={22} aria-hidden="true" />
              <div><b>Connect IMS to see your exams</b><p>Your registered subjects are matched with the official COE date sheet.</p></div>
              <button className="nestBtn nestBtnSmall" type="button" onClick={() => requestAttendanceRefresh()}>Connect IMS</button>
            </div>
          ) : !studentExams.length ? (
            <div className="nestEmpty nestEmptyOnCard">
              <CalendarDays size={22} aria-hidden="true" />
              <div><b>No exams on the tentative sheet</b><p>Your current subjects are practical or continuous-evaluation courses.</p></div>
            </div>
          ) : (
            <>
              <div className="nestExamRows">
                {studentExams.map((exam) => {
                  const { dayOfWeek, formattedDate } = formatExamDate(exam.isoDate);
                  const isNext = exam.code === nextExam?.code;
                  return (
                    <div className={`nestExamRow ${isNext ? "isNext" : ""}`} key={`${exam.code}-${exam.isoDate}`}>
                      <div className="nestExamDate">
                        <b>{formattedDate.split(" ")[0]}</b>
                        <span>{formattedDate.split(" ")[1]}</span>
                        <small>{dayOfWeek.slice(0, 3)}</small>
                      </div>
                      <div className="nestExamBody">
                        <h3>{exam.name}</h3>
                        <p>{exam.code} · {exam.shift}</p>
                        {isNext && <em>Next exam</em>}
                      </div>
                      <button
                        className="nestExamAdd"
                        type="button"
                        onClick={() => window.print()}
                        aria-label="Print exam sheet"
                        title="Print exam sheet"
                      >
                        <Printer size={15} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="nestReminder"><BellRing size={13} aria-hidden="true" /> Results include SGPA and grade details.</p>
            </>
          )}
        </section>

        <footer className="nestFooter">
          <span>NSUT Nest · real IMS data, saved on this device</span>
          <Link href="/profile">My profile</Link>
        </footer>

        <div className="nestPrintHead" suppressHydrationWarning>
          <b>NETAJI SUBHAS UNIVERSITY OF TECHNOLOGY</b>
          <span>Azad Hind Fauj Marg, Sector-3, Dwarka, New Delhi - 110078</span>
          <small>OFFICE OF THE CONTROLLER OF EXAMINATION · END-SEMESTER, ODD 2026–27</small>
          <p>{rawName || "Student"} · {liveAttendance?.roll || "—"} · Semester {liveAttendance?.selectedSemester || liveAttendance?.semester || "—"}</p>
        </div>
      </div>
    </>
  );
}
