"use client";

/**
 * NsutNest Dashboard — one continuous, vertically scrollable dashboard.
 *
 * Sections, in order (matching the three reference screenshots, which are three
 * scroll positions of this single page):
 *   1. Greeting + student identity card, four summary cards.
 *   2. Attendance snapshot (circular gauge + subject rows) beside Important notices.
 *   3. Popular hangouts + footer.
 *
 * All figures come from the real dataset: the identity card and Latest SGPA come
 * from the gazette students.json, summary-card subject rows come from
 * subjects.json for the same student, and notices come from the live IMS board
 * through /api/notices. Only the campus hangouts and community stats are static
 * directory content — they describe the campus, not the student.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, ArrowUpRight, BellRing, ChevronRight, Coffee, GraduationCap,
  Landmark, Loader2, MapPin, RefreshCw, Star, TrendingUp, Users, X,
} from "lucide-react";
import { loadStudents, type Student } from "../lib/data";
import { withResolvedSubjectNames } from "../lib/attendance";
import { ATTENDANCE_SYNC_EVENT, ATTENDANCE_REFRESH_STATUS_EVENT, PROFILE_SYNC_EVENT, readStoredAttendance, readStoredProfile, requestAttendanceRefresh } from "../lib/app-storage";
import { isRecentNotice } from "../lib/notice-date";
import HubShell from "./hub-shell";
import { SubjectAttendanceCalendar } from "./attendance-calendar";
import { useLiveViewCount } from "./live-views";

/** One subject row in the attendance snapshot. */
type SubjectRow = {
  title: string;
  code: string;
  attended: number;
  held: number;
  percent: number;
  canSkip: number;
  mustAttend?: number;
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

const POLICY = 0.75;

/** Classes this subject can still miss and stay at or above 75%. */
function skipBudget(attended: number, held: number): number {
  // Miss k more classes: (attended) / (held + k) >= 0.75  =>  k <= attended/0.75 - held.
  return Math.max(0, Math.floor(attended / POLICY - held));
}


const SHARED_HANGOUTS = [
  { name: "Grover Sweets", place: "Sweets & snacks", url: "https://share.google/QWKzCOF5mPXxIsLR8", img: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80", alt: "Indian sweets and snacks" },
  { name: "Nescafé – NSUT Delhi", place: "Coffee & café", url: "https://share.google/3VLepXCwTjoKprx1q", img: "/images/hangouts/nescafe-nsut.png", alt: "Nescafé café at NSUT, photo supplied by the user" },
  { name: "Mehfil Restaurant", place: "New Delhi · Restaurant", url: "https://share.google/qwWGaFPImDuVKFjgm", img: "/images/hangouts/mehfil-restaurant.png", alt: "Mehfil Restaurant signboard, photo supplied by the user" },
] as const;

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Months the portal has date-wise records for, used by the calendar's month picker. */
function subjectAttendanceMonths(daily: LiveAttendancePayload["daily"], code: string): string[] {
  return Array.from(new Set((daily ?? [])
    .filter(day => day.values[code] && /^\d{4}-\d{2}-\d{2}$/.test(day.date))
    .map(day => day.date.slice(0, 7))))
    .sort();
}

/* ---------- Circular attendance gauge (pure SVG, no dependency) ---------- */
function Gauge({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = (clamped / 100) * C;
  const good = clamped >= POLICY * 100;
  return (
    <div className="gauge">
      <svg viewBox="0 0 120 120" width="128" height="128" role="img" aria-label={`Overall attendance ${clamped.toFixed(1)}%`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="#262a2e" strokeWidth="11" />
        <circle
          cx="60" cy="60" r={R} fill="none"
          stroke={good ? "var(--green)" : "#ff9d6d"}
          strokeWidth="11" strokeLinecap="round"
          strokeDasharray={`${dash} ${C - dash}`}
          transform="rotate(-90 60 60)"
          className="gaugeArc"
        />
      </svg>
      <div className="gaugeCenter">
        <b>{clamped.toFixed(1)}%</b>
        <small>overall</small>
      </div>
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
  const [students, setStudents] = useState<Student[] | null>(null);
  const [marksByRoll, setMarksByRoll] = useState<Record<string, Record<string, { subjects: { code: string }[] }>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Payload["notices"] | null>(null);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [liveAttendance, setLiveAttendance] = useState<LiveAttendancePayload | null>(null);
  const [profileName, setProfileName] = useState("");
  const [attendanceRefreshing, setAttendanceRefreshing] = useState(false);

  useEffect(() => {
    const onStatus = (event: Event) => setAttendanceRefreshing((event as CustomEvent<boolean>).detail);
    window.addEventListener(ATTENDANCE_REFRESH_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(ATTENDANCE_REFRESH_STATUS_EVENT, onStatus);
  }, []);
  const [selectedAttendanceSubject, setSelectedAttendanceSubject] = useState<string | null>(null);
  const [attendanceCalendarMonth, setAttendanceCalendarMonth] = useState("");
  const [campusMapOpen, setCampusMapOpen] = useState(false);
  const [greetingText, setGreetingText] = useState("Welcome");
  const [dateLine, setDateLine] = useState("");

  useEffect(() => {
    const now = new Date();
    setGreetingText(greeting(now));
    setDateLine(`${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`);
  }, []);

  /** Total browsing-session visits, straight from Redis. */
  const visits = useLiveViewCount();

  useEffect(() => {
    const sync = () => {
      try {
        // IMS sometimes returns no name with attendance; the profile does.
        const profile = readStoredProfile();
        if (profile) {
          const parsedProfile = JSON.parse(profile) as { name?: string };
          setProfileName(parsedProfile.name?.trim() ?? "");
        }
        const cached = readStoredAttendance();
        const parsed = cached ? JSON.parse(cached) as LiveAttendancePayload : null;
        if (!parsed?.roll?.trim()) {
          setLiveAttendance(null);
          return;
        }
        setLiveAttendance({
          ...parsed,
          subjects: withResolvedSubjectNames(parsed.subjects),
        });
      } catch { setLiveAttendance(null); }
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
      (err) => active && setError(err instanceof Error ? err.message : "Could not load results data."),
    );
    fetch("/data/subjects.json")
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((payload) => {
        if (!active) return;
        // subjects.json stores each semester as a tuple:
        // semesters[roll][semester] = [credits, creditPoints, [code, grade, cp][], ay]
        const byRoll: Record<string, Record<string, { subjects: { code: string }[] }>> = {};
        for (const [roll, sems] of Object.entries(payload.semesters ?? {})) {
          const map: Record<string, { subjects: { code: string }[] }> = {};
          for (const [sem, entry] of Object.entries(sems as Record<string, [number, number, [string, string, number][], number]>)) {
            map[sem] = { subjects: (entry?.[2] ?? []).map(([code]) => ({ code })) };
          }
          byRoll[roll] = map;
        }
        setMarksByRoll(byRoll);
      })
      .catch(() => { /* attendance simply stays empty; the panel explains it */ });
    fetch("/api/notices")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body as Payload;
      })
      .catch((err) => { active && setNoticesError(err.message); return null; })
      .then((body) => { if (active && body) setNotices(body.notices.slice(0, 4)); });
    return () => { active = false; };
  }, []);

  const me = useMemo<Student | null>(() => {
    const roll = liveAttendance?.roll.trim().toUpperCase();
    if (!students?.length || !roll) return null;
    return students
      .filter(student => student.roll.trim().toUpperCase() === roll)
      .reduce<Student | null>((latest, student) => {
        if (!latest || student.ay > latest.ay ||
          (student.ay === latest.ay && student.semester > latest.semester)) {
          return student;
        }
        return latest;
      }, null);
  }, [students, liveAttendance?.roll]);

  const subjectRows = useMemo<SubjectRow[]>(() => liveAttendance?.subjects?.map(s => ({
    title: s.name || s.code, code: s.code, attended: s.present, held: s.held,
    percent: s.percent, canSkip: s.canSkip, mustAttend: s.mustAttend,
  })) ?? [], [liveAttendance]);
  const overall = subjectRows.length
    ? subjectRows.reduce((a, r) => a + r.attended, 0) / subjectRows.reduce((a, r) => a + r.held, 0) * 100
    : 0;

  const bestSem = useMemo(() => {
    if (!me) return null;
    const best = { semester: me.semester, sgpa: me.sgpa };
    return best;
  }, [me]);

  const newThisWeek = useMemo(() => {
    if (!notices) return 0;
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    return notices.filter((n) => n.isoDate >= week).length;
  }, [notices]);

  if (error) {
    return (
      <div className="empty"><AlertTriangle size={30} /><h3>Could not load the dashboard</h3><p>{error}</p></div>
    );
  }

  // Attendance is kept on this device between visits, so say whether what is on
  // screen is a fresh sync or a saved snapshot.
  const attendanceFresh = !!liveAttendance
    && Date.now() - new Date(liveAttendance.syncedAt).getTime() < 6 * 60 * 60 * 1000;
  const rawName = (liveAttendance?.name || profileName).trim();
  // IMS prints names in capitals; the familiar mixed case reads better here.
  const firstName = rawName
    ? rawName.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`).split(/\s+/)[0]
    : "";
  const latestSgpa = me?.sgpa ?? null;
  return (
    <>
      {/* ---- Section 1: greeting + identity + summary cards ---- */}
      <section className="hubHero">
        <div className="hubHeroText">
          {dateLine && <div className="hubDateLine">{dateLine}</div>}
          <h1>
            {greetingText}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p>Academic records, live IMS attendance and official notifications.</p>
        </div>
        <div className="rollCard">
          <small>Student Roll</small>
          <b>{liveAttendance ? liveAttendance.roll || "IMS connected" : "IMS not connected"}</b>
          {liveAttendance && <span className="rollMeta" suppressHydrationWarning>{attendanceFresh ? "Live IMS" : "Saved attendance"} · synced {new Date(liveAttendance.syncedAt).toLocaleString()}</span>}
        </div>
      </section>

      <section className="summaryCards">
        <div className="summaryCard attCard">
          <Activity className="scIcon att" size={20} />
          <small>Overall attendance</small>
          <b>{subjectRows.length ? `${overall.toFixed(1)}%` : "—"}</b>
          <span className="scFoot">{liveAttendance ? (attendanceFresh ? "Fetched from NSUT IMS" : "Saved from NSUT IMS") : "Connect to IMS first"}</span>
        </div>
        <a className="summaryCard sgpaCard" href={me ? `/student/${encodeURIComponent(me.roll)}` : "/results"}>
          <GraduationCap className="scIcon sgpa" size={20} />
          <small>Latest SGPA</small>
          <b>{latestSgpa !== null ? latestSgpa.toFixed(2) : "—"}</b>
          <span className="scFoot">
            {me ? `Sem ${me.semester} · ${me.ay}-${String(me.ay + 1).slice(-2)} · ` : ""}
            Result details <ArrowUpRight size={12} />
          </span>
        </a>
        <a className="summaryCard notCard" href="/notices">
          <span className="scIcon not"><BellRing size={18} /></span>
          <small>New notices</small>
          <b>{notices ? String(notices.length).padStart(2, "0") : "—"}</b>
          <span className="scFoot">{newThisWeek} posted this week <ArrowUpRight size={12} /></span>
        </a>
        <div className="summaryCard pulseCard">
          <Users className="scIcon pulse" size={20} />
          <small>Site visits</small>
          <b>{visits !== null ? visits.toLocaleString("en-IN") : "—"}</b>
          <span className="scFoot">browsing sessions so far</span>
        </div>
      </section>

      {/* ---- Section 2: attendance snapshot + important notices, side by side ---- */}
      <section className="duoGrid">
        <div className="hubCard attPanel">
          {attendanceRefreshing && (
            <div className="attRefreshOverlay" role="status" aria-live="polite">
              <div className="attRefreshOverlayInner">
                <Loader2 size={36} className="attSpinIcon" aria-hidden="true" />
                <strong>Updating attendance...</strong>
                <span>Fetching latest records from IMS</span>
              </div>
            </div>
          )}
          <div className="hubCardHead">
            <div>
              <small className="panelKicker">Live status</small>
              <h2>Attendance</h2>
            </div>
            <div className="attPanelActions">
              {liveAttendance && (
                <button
                  className="attRefreshButton"
                  type="button"
                  onClick={() => requestAttendanceRefresh()}
                  disabled={attendanceRefreshing}
                  title={`Last synced ${new Date(liveAttendance.syncedAt).toLocaleString()} — fetch the latest attendance from NSUT IMS. If your IMS ID is saved on this device, only the CAPTCHA is asked for.`}
                >
                  <RefreshCw size={13} className={attendanceRefreshing ? "attSpinIcon" : undefined} /> {attendanceRefreshing ? "Updating..." : "Refresh from IMS"}
                </button>
              )}
              <span className="policyTag">75% minimum</span>
            </div>
          </div>

          {!liveAttendance || !subjectRows.length ? (
            <div className="attEmpty">
              <TrendingUp size={26} />
              <p>Sign in to NSUT IMS to load your real subject-wise attendance. No estimated attendance is shown.</p>
            </div>
          ) : (
            <div className="attSummary">
              <Gauge percent={overall} />
              <div className="attSummaryText">
                <h3>{POLICY * 100}% safety line</h3>
                <p>Know exactly how many classes you can miss without falling below the minimum.</p>
                <div className="legend">
                  <span><i className="dot attended" /> Attended</span>
                  <span><i className="dot minimum" /> {POLICY * 100}% minimum</span>
                </div>
              </div>
            </div>
          )}

          {subjectRows.length > 0 && (
            <div className="attRows">
              {subjectRows.map((r) => {
                const expanded = selectedAttendanceSubject === r.code;
                const months = subjectAttendanceMonths(liveAttendance?.daily, r.code);
                return (
                  <div className={`attRow ${expanded ? "expanded" : ""}`} key={r.code}>
                    <button
                      className="attSubjectButton"
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => {
                        if (expanded) {
                          setSelectedAttendanceSubject(null);
                        } else {
                          setSelectedAttendanceSubject(r.code);
                          setAttendanceCalendarMonth(months.length ? months[months.length - 1] : "");
                        }
                      }}
                    >
                      <span className="attRowText">
                        <h4>
                          {r.title}
                          {/* The IMS subject code follows the subject name. */}
                          {r.title !== r.code && <span className="attCode">{r.code}</span>}
                        </h4>
                        <p><b>{r.attended}/{r.held}</b> classes</p>
                        <p className="attSkip">{r.held === 0
                          ? "No classes held yet"
                          : r.percent >= POLICY * 100
                            ? `Can miss ${r.canSkip} more classes and stay at 75%`
                            : `Attend ${r.mustAttend ?? 0} consecutive classes to reach 75%`}</p>
                      </span>
                      <span className="attSubjectActions">
                        <b className={`attPct ${r.percent < POLICY * 100 ? "low" : ""}`}>{r.percent.toFixed(1)}%</b>
                        <ChevronRight size={16} className={expanded ? "attSubjectChevron expanded" : "attSubjectChevron"} />
                      </span>
                    </button>
                    {expanded && liveAttendance && (
                      <SubjectAttendanceCalendar
                        subject={r}
                        daily={liveAttendance.daily ?? []}
                        attendanceLegend={liveAttendance.attendanceLegend}
                        statusLegend={liveAttendance.statusLegend}
                        month={attendanceCalendarMonth}
                        months={months}
                        onMonthChange={setAttendanceCalendarMonth}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="hubCard noticesPanel">
          <div className="hubCardHead">
            <div>
              <small className="panelKicker">Circulars &amp; orders</small>
              <h2>Important notices</h2>
            </div>
            <Link className="panelLink" href="/notices">All notices <ArrowUpRight size={13} /></Link>
          </div>

          {noticesError ? (
            <div className="attEmpty">
              <AlertTriangle size={24} />
              <p>{noticesError}</p>
            </div>
          ) : !notices ? (
            <div className="loading"><Loader2 className="spin" size={22} /><p>Loading notices…</p></div>
          ) : (
            <div className="hubNoticeList">
              {notices.map((n) => (
                <a className="hubNoticeRow" key={n.href} href={n.href} target="_blank" rel="noreferrer noopener">
                  <span className="hubNoticeIcon"><BellRing size={15} /></span>
                  <span className="hubNoticeText">
                    <h4>{n.title}{isRecentNotice(n.isoDate) && <span className="newBadge">New</span>}</h4>
                    <p>{n.department || "NSUT"} · <time dateTime={n.isoDate}>{n.date}</time></p>
                  </span>
                  <ChevronRight size={16} className="hubNoticeChev" />
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---- Section 3: popular hangouts ---- */}
      <section className="hangouts">
        <div className="hubCardHead hangoutsHead">
          <div>
            <small className="panelKicker">Campus spots</small>
            <h2>Popular hangouts</h2>
          </div>
          <button className="panelLink campusExploreButton" type="button" onClick={() => setCampusMapOpen(true)}>Explore campus <ArrowUpRight size={13} /></button>
        </div>
        <div className="hangoutGrid sharedHangoutGrid">
          {SHARED_HANGOUTS.map((h, i) => (
            <a className="hangoutCard sharedHangoutCard" key={h.url} href={h.url} target="_blank" rel="noreferrer">
              <div className="hangoutImg sharedHangoutPhoto">
                <img src={h.img} alt={h.alt} loading="lazy" />
                <span className="sharedHangoutPhotoLabel"><MapPin size={13} /> Popular hangout</span>
              </div>
              <div className="hangoutMeta">
                <div className="hangoutName"><h3>{h.name}</h3><p><MapPin size={12} /> {h.place}</p></div>
                <ArrowUpRight size={16} />
              </div>
            </a>
          ))}
        </div>
      </section>

      {campusMapOpen && (
        <div className="campusMapOverlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCampusMapOpen(false); }}>
          <section className="campusMapDialog" role="dialog" aria-modal="true" aria-label="NSUT campus map">
            <div className="campusMapHeader"><div><small className="panelKicker">Campus overview</small><h2>Campus map</h2></div><button type="button" className="campusMapClose" aria-label="Close campus map" onClick={() => setCampusMapOpen(false)}><X size={20} /></button></div>
            <img className="campusMapImage" src="/campus-map.png" alt="Illustrated map of the NSUT campus with academic blocks, hostels, grounds, library and main gate" />
          </section>
        </div>
      )}


    </>
  );
}

type Notice = {
  date: string;
  isoDate: string;
  title: string;
  publishedBy: string;
  department: string;
  href: string;
};
type Payload = { notices: Notice[]; fetchedAt: number; source: string };
