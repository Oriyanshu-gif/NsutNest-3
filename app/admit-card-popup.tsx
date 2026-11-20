"use client";
/**
 * The admit card nudge. IMS opens the end-sem window about a week before the
 * first paper, so the prompt stays on screen until the student's last exam date
 * from the date sheet — after that it would only get in the way.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, X } from "lucide-react";
import { readStoredAdmitCard, readStoredAttendance } from "../lib/app-storage";
import { loadDatesheet, matchStudentExams, type ExamScheduleItem } from "../lib/datesheet";

/**
 * Dismissal lasts for one app session, not a day: the card matters until the
 * exam, so a closed prompt must come back the next time the app opens.
 */
const DISMISS_KEY = "nsutnest_admit_card_dismissed";

try {
  // Older builds parked a date here; it no longer suppresses the prompt.
  window.localStorage.removeItem(DISMISS_KEY);
} catch {
  // Storage is optional for a nudge.
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dismissedAlready(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export default function AdmitCardPopup() {
  const [lastExam, setLastExam] = useState<ExamScheduleItem | null>(null);
  const [hasCard, setHasCard] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(dismissedAlready());
    setHasCard(Boolean(readStoredAdmitCard()));

    const raw = readStoredAttendance();
    if (!raw) return;
    let codes: string[] = [];
    let semester: number | string | undefined;
    try {
      const parsed = JSON.parse(raw) as { subjects?: { code?: string }[]; selectedSemester?: string; semester?: number };
      codes = (parsed.subjects ?? []).map(subject => subject.code ?? "").filter(Boolean);
      semester = parsed.selectedSemester || parsed.semester;
    } catch {
      return;
    }
    if (!codes.length) return;
    let active = true;
    void loadDatesheet()
      .then(datesheet => {
        if (!active) return;
        const exams = matchStudentExams(codes, datesheet, semester);
        setLastExam(exams.length ? exams[exams.length - 1] : null);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  if (dismissed || !lastExam || lastExam.isoDate < today()) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // A blocked storage just means the prompt returns on the next visit.
    }
  }

  return (
    <aside className="admitCardPopup" role="dialog" aria-label="End semester admit card">
      <button className="admitCardPopupClose" type="button" onClick={dismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
      <span className="admitCardPopupIcon"><FileText size={16} /></span>
      <div>
        <b>{hasCard ? "Your admit card is ready" : "End sem admit card is out"}</b>
        <span>
          Papers start soon — the card stays printable here until {new Date(lastExam.isoDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.
        </span>
      </div>
      <Link href="/admit-card" onClick={dismiss}>{hasCard ? "Open" : "Generate"}</Link>
    </aside>
  );
}
