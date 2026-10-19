"use client";

/**
 * Study material — one card per subject, synced from the live IMS attendance the
 * student already fetched on the dashboard. Each card leads with the subject
 * name and shows the IMS subject code right after the name, followed by quick
 * resource links (notes, previous-year questions, syllabus).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, FileText, Home, Loader2, ScrollText, X } from "lucide-react";
import HubShell from "../hub-shell";
import { withResolvedSubjectNames } from "../../lib/attendance";
import { ATTENDANCE_SYNC_EVENT, readStoredAttendance } from "../../lib/app-storage";

type StudySubject = { code: string; name: string };
type StudyPayload = { subjects: StudySubject[]; semester: string; academicYear?: string; syncedAt: string };

function semesterLabel(value: string): string {
  return /^(?:semester|sem\b)/i.test(value) ? value : `Semester ${value}`;
}

const RESOURCE_CHIPS = [
  { label: "Notes", icon: BookOpen },
  { label: "PYQs", icon: FileText },
  { label: "Syllabus", icon: ScrollText },
] as const;

export default function StudyMaterial() {
  return (
    <HubShell>
      <StudyMaterialBody />
    </HubShell>
  );
}

function StudyMaterialBody() {
  const [payload, setPayload] = useState<StudyPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [comingSoon, setComingSoon] = useState("");

  useEffect(() => {
    const sync = () => {
      try {
        const cached = readStoredAttendance();
        const parsed = cached ? JSON.parse(cached) as { subjects?: { code: string; name: string }[]; selectedSemester?: string; semester?: string; academicYear?: string; syncedAt?: string } : null;
        if (!parsed?.subjects?.length) {
          setPayload(null);
          return;
        }
        setPayload({
          subjects: withResolvedSubjectNames(parsed.subjects),
          semester: parsed.selectedSemester || (parsed.semester ? semesterLabel(parsed.semester) : ""),
          academicYear: parsed.academicYear,
          syncedAt: parsed.syncedAt ?? "",
        });
      } catch {
        setPayload(null);
      }
      setLoaded(true);
    };
    sync();
    window.addEventListener(ATTENDANCE_SYNC_EVENT, sync);
    return () => window.removeEventListener(ATTENDANCE_SYNC_EVENT, sync);
  }, []);

  const syncLabel = payload
    ? [payload.academicYear ? `AY ${payload.academicYear}` : "", payload.semester ? semesterLabel(payload.semester) : "Synced from NSUT IMS"]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <main className="studyShell">
      {comingSoon && (
        <div className="studyComingSoon" role="status" aria-live="polite">
          <span><b>{comingSoon}</b> — Coming soon. Study resources are being prepared.</span>
          <button type="button" onClick={() => setComingSoon("")} aria-label="Dismiss message"><X size={16} /></button>
        </div>
      )}
      <header className="studyHeader">
        <div>
          <small className="panelKicker">LEARN SMARTER</small>
          <h1>Study material</h1>
          <p>Notes, previous-year papers and syllabus for every subject in your IMS semester.</p>
        </div>
        <span className="studySync">{payload ? syncLabel : "Not synced"}</span>
      </header>

      {!loaded ? (
        <section className="hubCard studyPanel"><div className="loading"><Loader2 className="spin" size={22} /><p>Checking your synced subjects…</p></div></section>
      ) : !payload ? (
        <section className="hubCard studyPanel">
          <div className="attEmpty">
            <BookOpen size={26} />
            <p>No subjects synced yet. Sign in to NSUT IMS on the dashboard and your subjects will appear here automatically.</p>
          </div>
          <Link className="studyGateAction" href="/"><Home size={15} /> Open dashboard sign-in</Link>
        </section>
      ) : (
        <section className="studySubjectGrid">
          {payload.subjects.map((subject) => {
            // The subject name leads the card and the IMS code follows it.
            const title = subject.name || subject.code;
            return (
              <article className="hubCard studyCard" key={subject.code}>
                <div className="studyCardHead">
                  <h3>{title}</h3>
                  {title !== subject.code && <span className="attCode">{subject.code}</span>}
                </div>
                <div className="studyChips">
                  {RESOURCE_CHIPS.map(({ label, icon: Icon }) => (
                    <button
                      className="studyChip"
                      key={label}
                      type="button"
                      onClick={() => setComingSoon(`${title} · ${label}`)}
                    >
                      <Icon size={13} /> {label}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      )}

      <footer className="hubFooter">
        <p>NsutNest · unofficial student project</p>
        <small>
          Subjects are matched from the live IMS attendance on this device. Notes, PYQs and syllabus links will be
          available here soon.
        </small>
      </footer>
    </main>
  );
}
