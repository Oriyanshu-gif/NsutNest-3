"use client";

/**
 * Small shared primitives used by the dashboard and the notices tab, so the
 * same status language, badge and loading treatment appears everywhere.
 */

import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

export type AttendanceTone = "safe" | "borderline" | "risk" | "none";

export const ATTENDANCE_LABEL: Record<AttendanceTone, string> = {
  safe: "Safe",
  borderline: "Borderline",
  risk: "At risk",
  none: "No classes yet",
};

/** 75% is the minimum; within 3 points of it counts as borderline. */
export function attendanceTone(percent: number, held: number): AttendanceTone {
  if (!held) return "none";
  if (percent < 75) return "risk";
  if (percent < 78) return "borderline";
  return "safe";
}

export function UnreadBadge({ count, className = "" }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={`countBadge ${className}`.trim()}
      aria-label={`${count} unread notice${count === 1 ? "" : "s"}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function StatusChip({ tone, label }: { tone: AttendanceTone; label?: string }) {
  return (
    <span className={`attStatus ${tone}`}>
      <i aria-hidden="true" />
      {label ?? ATTENDANCE_LABEL[tone]}
    </span>
  );
}

/** Thin subject bar with an always-visible tick at the 75% line. */
export function AttendanceBar({
  percent,
  tone,
  label,
}: {
  percent: number;
  tone: AttendanceTone;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span
      className={`attBarWrap ${tone}`}
      role="img"
      aria-label={`${label}: ${clamped.toFixed(1)} percent, 75 percent minimum marked`}
    >
      <span className="attBar">
        <span className="attBarFill" style={{ width: `${clamped}%` }} />
        <i className="attBarTick" aria-hidden="true" />
      </span>
    </span>
  );
}

export function Skeleton({
  rows = 3,
  variant = "row",
}: {
  rows?: number;
  variant?: "row" | "card";
}) {
  return (
    <div className={`skeletonBlock ${variant}`} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeletonRow" key={index}>
          <span className="skeletonDot" />
          <span className="skeletonLines">
            <i style={{ width: `${82 - index * 8}%` }} />
            <i style={{ width: `${48 - index * 4}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

/**
 * "Offline — last synced <time>" banner. It never hides data; it only explains
 * that what is on screen came from this device and offers a retry.
 */
export function OfflineBanner({
  lastSynced,
  onRetry,
  retrying = false,
}: {
  lastSynced?: string | number | null;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  let synced = "";
  if (typeof lastSynced === "number") {
    synced = new Date(lastSynced).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } else if (typeof lastSynced === "string" && lastSynced) {
    const parsed = new Date(lastSynced);
    synced = Number.isNaN(parsed.getTime())
      ? lastSynced
      : parsed.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  }

  return (
    <div className="offlineBanner" role="status">
      <WifiOff size={16} aria-hidden="true" />
      <span className="offlineBannerText">
        <b>Offline</b> — showing saved data{synced ? ` · last synced ${synced}` : ""}. New notices and attendance
        will refresh when you reconnect.
      </span>
      {onRetry && (
        <button className="offlineBannerBtn" type="button" onClick={onRetry} disabled={retrying}>
          <RefreshCw size={13} className={retrying ? "attSpinIcon" : undefined} aria-hidden="true" />
          {retrying ? "Retrying…" : "Retry"}
        </button>
      )}
    </div>
  );
}
