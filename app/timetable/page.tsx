"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ChevronLeft, Clock, RefreshCw } from "lucide-react";
import HubShell from "../hub-shell";
import {
  ATTENDANCE_SYNC_EVENT,
  TIMETABLE_SYNC_EVENT,
  readStoredAttendance,
  readStoredTimetable,
  requestAttendanceRefresh,
  writeStoredTimetable,
} from "../../lib/app-storage";
import type { TimetableEntry, TimetablePayload, TimetableSlot } from "../../lib/ims-timetable";
import { Skeleton } from "../ui";

const IST_TIME_ZONE = "Asia/Kolkata";
const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
type WeekDay = (typeof DAY_ORDER)[number];

const DAY_NAMES: Record<WeekDay, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
  Sun: "Sunday",
};
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function istClock(): {
  day: WeekDay;
  dayIndex: number;
  minutes: number;
  date: number;
  monthIndex: number;
  year: number;
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
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const day = (get("weekday").slice(0, 3) || "Mon") as WeekDay;
  return {
    day,
    dayIndex: DAY_ORDER.indexOf(day),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    date: Number(get("day")),
    monthIndex: Math.max(0, MONTHS_SHORT.indexOf(get("month"))),
    year: Number(get("year")),
  };
}

function clock12(minutes: number, withSuffix = true) {
  const hour = Math.floor(minutes / 60) % 24;
  const minute = String(minutes % 60).padStart(2, "0");
  const suffix = hour < 12 ? "am" : "pm";
  return `${hour % 12 || 12}:${minute}${withSuffix ? ` ${suffix}` : ""}`;
}

function entryMeta(entry: TimetableEntry) {
  return [
    entry.code,
    entry.room,
    entry.group ? `Group ${entry.group}` : null,
    entry.tutorial ? `Tutorial ${entry.tutorial}` : null,
    entry.batch ? `Batch ${entry.batch}` : null,
    entry.section ? `Sec ${entry.section}` : null,
  ].filter(Boolean).join(" · ");
}

function TimetableBody() {
  const [timetable, setTimetable] = useState<TimetablePayload | null>(null);
  const [subjectNames, setSubjectNames] = useState<Map<string, string>>(new Map());
  const [roll, setRoll] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(0);
  const [clock, setClock] = useState(istClock);
  const [selectedDay, setSelectedDay] = useState<WeekDay>(() => istClock().day);
  const forceRefresh = useRef(false);

  useEffect(() => {
    const tick = () => setClock(istClock());
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const sync = () => setRequest((value) => value + 1);
    window.addEventListener(ATTENDANCE_SYNC_EVENT, sync);
    window.addEventListener(TIMETABLE_SYNC_EVENT, sync);
    return () => {
      window.removeEventListener(ATTENDANCE_SYNC_EVENT, sync);
      window.removeEventListener(TIMETABLE_SYNC_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let currentRoll = "";
    try {
      const rawAttendance = readStoredAttendance();
      const attendance = rawAttendance
        ? (JSON.parse(rawAttendance) as { roll?: string; subjects?: { code: string; name: string }[] })
        : null;
      currentRoll = attendance?.roll?.trim() ?? "";
      setRoll(currentRoll);
      setSubjectNames(
        new Map((attendance?.subjects ?? []).map((subject) => [subject.code.toUpperCase(), subject.name])),
      );
    } catch {
      setRoll("");
    }

    if (!currentRoll) {
      setTimetable(null);
      setError("");
      setLoading(false);
      return;
    }

    let cached: TimetablePayload | null = null;
    try {
      const raw = readStoredTimetable();
      if (raw) {
        const parsed = JSON.parse(raw) as TimetablePayload;
        if (parsed?.roll?.toUpperCase() === currentRoll.toUpperCase() && Array.isArray(parsed.slots)) {
          cached = parsed;
          setTimetable(parsed);
          const fetched = new Date(parsed.fetchedAt).getTime();
          if (!forceRefresh.current && Number.isFinite(fetched) && Date.now() - fetched < 6 * 60 * 60 * 1000) {
            setError("");
            setLoading(false);
            return;
          }
        }
      }
    } catch {
      // A corrupt cache is treated like no cache.
    }

    forceRefresh.current = false;
    if (!cached) setTimetable(null);
    setError("");
    setLoading(true);

    fetch("/api/ims/timetable", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as TimetablePayload & { error?: string };
        if (!response.ok) throw new Error(body.error || "Could not load your IMS timetable.");
        if (!Array.isArray(body.slots)) throw new Error("IMS returned an empty timetable.");
        if (body.roll && body.roll.trim().toUpperCase() !== currentRoll.toUpperCase()) {
          throw new Error("IMS returned a timetable for a different account.");
        }
        return { ...body, fetchedAt: body.fetchedAt || new Date().toISOString() };
      })
      .then((payload) => {
        if (!active) return;
        writeStoredTimetable(JSON.stringify(payload));
        setTimetable(payload);
        setError("");
      })
      .catch((failure) => {
        if (active) setError(failure instanceof Error ? failure.message : "Could not load your IMS timetable.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [request]);

  const needsIms = !roll || /sign in|session|expired/i.test(error);

  function refresh() {
    if (needsIms) {
      requestAttendanceRefresh();
      return;
    }
    forceRefresh.current = true;
    setRequest((value) => value + 1);
  }

  const slotsByDay = useMemo(() => {
    const map = new Map<WeekDay, TimetableSlot[]>();
    for (const day of DAY_ORDER) map.set(day, (timetable?.slots ?? []).filter((slot) => slot.day === day));
    return map;
  }, [timetable]);

  const weekDays = useMemo(() => {
    const mondayOffset = (clock.dayIndex + 6) % 7;
    const monday = new Date(Date.UTC(clock.year, clock.monthIndex, clock.date - mondayOffset));
    return DAY_ORDER.map((day, index) => {
      const date = new Date(monday.getTime() + index * 86_400_000);
      return {
        day,
        date: date.getUTCDate(),
        monthIndex: date.getUTCMonth(),
        isToday:
          date.getUTCFullYear() === clock.year &&
          date.getUTCMonth() === clock.monthIndex &&
          date.getUTCDate() === clock.date,
      };
    });
  }, [clock]);

  const selectedSlots = slotsByDay.get(selectedDay) ?? [];
  const selectedInfo = weekDays.find((day) => day.day === selectedDay);
  const isTodaySelected = selectedDay === clock.day;
  const nextStart = isTodaySelected
    ? selectedSlots.find((slot) => slot.startMinutes > clock.minutes)?.startMinutes
    : undefined;

  return (
    <div className="ttPaperPage">
      <header className="ttPaperHead">
        <div>
          <Link className="ttPaperBack" href="/">
            <ChevronLeft size={13} aria-hidden="true" /> Home
          </Link>
          <p className="nestKicker"><CalendarClock size={13} aria-hidden="true" /> Timetable</p>
          <h1>Timetable</h1>
          <p>
            {timetable
              ? [
                  timetable.semester ? `Semester ${timetable.semester}` : null,
                  timetable.academicYear ? `AY ${timetable.academicYear}` : null,
                  `${timetable.slots.length} classes this week`,
                ].filter(Boolean).join(" · ")
              : "Your full week, saved in this browser."}
          </p>
        </div>
        <div className="ttPaperActions">
          <span className="ttPaperTerm">
            {timetable?.semester ? `Sem ${timetable.semester}` : "Sem —"}
            {timetable?.academicYear ? ` · ${timetable.academicYear}` : ""}
          </span>
          {roll && (
            <button type="button" className="ttPaperRefresh" onClick={refresh} disabled={loading} aria-label="Refresh timetable">
              <RefreshCw size={15} className={loading ? "attSpinIcon" : ""} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {loading && !timetable ? (
        <section className="ttPaperCard" aria-label="Loading timetable">
          <Skeleton rows={4} />
        </section>
      ) : !timetable ? (
        <section className="ttPaperCard ttPaperEmpty">
          <CalendarClock size={26} aria-hidden="true" />
          <h2>{error ? "Timetable unavailable" : "Connect IMS to see your timetable"}</h2>
          <p>{error || "Sign in with NSUT IMS once and the full week stays saved here for offline use."}</p>
          <button type="button" className="nestBtn nestBtnSmall" onClick={refresh}>
            <RefreshCw size={13} aria-hidden="true" /> {needsIms ? "Connect IMS" : "Try again"}
          </button>
        </section>
      ) : (
        <>
          <div className="ttWeekStrip" role="tablist" aria-label="Choose a day">
            {weekDays.map((day) => (
              <button
                key={day.day}
                type="button"
                role="tab"
                aria-selected={selectedDay === day.day}
                className={`ttWeekChip ${selectedDay === day.day ? "active" : ""} ${day.isToday ? "isToday" : ""}`}
                onClick={() => setSelectedDay(day.day)}
              >
                <span>{day.day}</span>
                <b>{day.date}</b>
                {day.isToday && <i aria-label="Today" />}
              </button>
            ))}
          </div>

          <section className="ttDayPanel" aria-labelledby="ttDayTitle">
            <div className="ttDayHead">
              <div>
                <p className="nestKicker">{isTodaySelected ? "Today" : "Day plan"}</p>
                <h2 id="ttDayTitle">
                  {DAY_NAMES[selectedDay]}
                  {selectedInfo ? `, ${selectedInfo.date} ${MONTHS_SHORT[selectedInfo.monthIndex]}` : ""}
                </h2>
              </div>
              <span className="ttDayCount">
                {selectedSlots.length ? `${selectedSlots.length} slot${selectedSlots.length === 1 ? "" : "s"}` : "Free"}
              </span>
            </div>

            {selectedSlots.length ? (
              <ol className="ttDayTimeline">
                {selectedSlots.map((slot) => {
                  const isNow = isTodaySelected && clock.minutes >= slot.startMinutes && clock.minutes < slot.endMinutes;
                  const isNext = isTodaySelected && slot.startMinutes === nextStart;
                  const isPast = isTodaySelected && slot.endMinutes <= clock.minutes;
                  const minutesAway = slot.startMinutes - clock.minutes;
                  return (
                    <li
                      className={`ttDaySlot ${isNow ? "now" : isNext ? "next" : isPast ? "past" : ""}`.trim()}
                      key={`${slot.day}-${slot.period}-${slot.start}-${slot.entries.map((entry) => entry.code).join("-")}`}
                    >
                      <div className="ttDayTime">
                        <b>{clock12(slot.startMinutes, false)}</b>
                        <small>{clock12(slot.endMinutes)}</small>
                      </div>
                      <div className="ttDaySlotBody">
                        <span className="ttDayStatus">
                          {isNow ? "Now" : isNext ? `Next · in ${Math.max(1, minutesAway)} min` : isPast ? "Done" : "Later"}
                        </span>
                        {slot.entries.map((entry, index) => (
                          <div className="ttDayEntry" key={`${entry.code}-${entry.kind}-${entry.group ?? ""}-${entry.room ?? ""}-${index}`}>
                            <b>{subjectNames.get(entry.code.toUpperCase()) || entry.code}</b>
                            <span>{entryMeta(entry)}</span>
                          </div>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="ttDayFree">
                <Clock size={18} aria-hidden="true" />
                <div>
                  <b>No classes on {DAY_NAMES[selectedDay]}</b>
                  <p>{selectedInfo ? `${selectedInfo.date} ${MONTHS_LONG[selectedInfo.monthIndex]} is free.` : "Enjoy the free day."}</p>
                </div>
              </div>
            )}
          </section>

          <footer className="ttPaperFoot">
            <span>Times in IST · saved offline{timetable.semester ? ` · Sem ${timetable.semester}` : ""}</span>
            <span>
              {error
                ? "Saved copy · live refresh unavailable"
                : timetable.fetchedAt
                  ? `Synced ${new Date(timetable.fetchedAt).toLocaleTimeString("en-IN", { timeZone: IST_TIME_ZONE, hour: "2-digit", minute: "2-digit" })}`
                  : "Saved offline"}
            </span>
          </footer>
        </>
      )}
    </div>
  );
}

export default function TimetablePage() {
  return (
    <HubShell>
      <TimetableBody />
    </HubShell>
  );
}
