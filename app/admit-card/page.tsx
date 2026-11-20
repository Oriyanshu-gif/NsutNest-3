"use client";

import { imsFetch } from "../../lib/ims-client";
/**
 * Admit Card — the IMS end-sem admit card, generated with the saved session and
 * the password this device already remembers from sign-in. The student is never
 * asked for it again: no password field exists on this page.
 *
 * The generated card is kept in localStorage, so the printable copy is still
 * here tomorrow (and offline) without another IMS round-trip.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileText, Loader2, Printer, RefreshCw } from "lucide-react";
import HubShell from "../hub-shell";
import {
  ATTENDANCE_SYNC_EVENT,
  readRememberedPassword,
  readStoredAdmitCard,
  requestAttendanceRefresh,
  writeStoredAdmitCard,
  type StoredAdmitCard,
} from "../../lib/app-storage";

export default function AdmitCardPage() {
  return (
    <HubShell>
      <AdmitCardBody />
    </HubShell>
  );
}

function AdmitCardBody() {
  const [card, setCard] = useState<StoredAdmitCard | null>(null);
  /** The password saved at sign-in; null means this device has none yet. */
  const [secret, setSecret] = useState<string | null>(null);
  /** Only used when this device has no saved sign-in to reuse. */
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  /** A fresh card opens the print dialog by itself; a saved one waits for a click. */
  const [printPending, setPrintPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const frameRef = useRef<HTMLIFrameElement>(null);
  /** Stops a refused generation from bouncing between the gate and this page. */
  const attemptsRef = useRef(0);

  useEffect(() => {
    setCard(readStoredAdmitCard());
    setSecret(readRememberedPassword() ?? "");
  }, []);

  async function generate(pass: string) {
    if (busy || !pass) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await imsFetch("/api/ims/admit-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass }),
        cache: "no-store",
      });
      if (response.status === 401) {
        attemptsRef.current += 1;
        if (attemptsRef.current > 2) {
          setError("IMS did not accept the new session. Sign in from the dashboard, then generate again.");
          setBusy(false);
          return;
        }
        setWaiting(true);
        setNotice("Sign in to IMS and the admit card opens by itself.");
        requestAttendanceRefresh("print");
        return;
      }
      const body = await response.json() as Partial<StoredAdmitCard> & { error?: string };
      if (!response.ok || !body.html) throw new Error(body.error || "Could not generate the admit card.");
      attemptsRef.current = 0;
      const next: StoredAdmitCard = {
        html: body.html,
        title: body.title || "End Semester Examination",
        papers: Array.isArray(body.papers) ? body.papers : [],
        generatedAt: body.generatedAt ?? null,
        savedAt: new Date().toISOString(),
        year: body.year,
        semester: body.semester,
      };
      writeStoredAdmitCard(next);
      setCard(next);
      setBusy(false);
      setPrintPending(true);
      setNotice("Admit card generated — choose Save as PDF in the print dialog.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not generate the admit card.");
      setBusy(false);
    }
  }

  // First visit: no form, no prompt — the saved password generates the card.
  useEffect(() => {
    if (card || secret === null) return;
    if (!secret) return;
    void generate(secret);
    // Runs once the saved password is read on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, secret]);

  // A finished IMS sign-in completes a generation that was waiting for one.
  const generateRef = useRef(generate);
  generateRef.current = generate;
  useEffect(() => {
    if (!waiting) return;
    const onSync = () => {
      setWaiting(false);
      const pass = readRememberedPassword() ?? "";
      setSecret(pass);
      void generateRef.current(pass);
    };
    window.addEventListener(ATTENDANCE_SYNC_EVENT, onSync);
    const timer = window.setTimeout(() => {
      setWaiting(false);
      setBusy(false);
      setNotice("Sign-in was not completed. Open this page again to retry.");
    }, 120_000);
    return () => {
      window.removeEventListener(ATTENDANCE_SYNC_EVENT, onSync);
      window.clearTimeout(timer);
    };
  }, [waiting]);

  function print() {
    const frame = frameRef.current;
    if (!frame?.contentWindow) {
      setNotice("The card is still loading. Try again in a second.");
      return;
    }
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      setNotice("Your browser blocked the print dialog. Allow printing for this site and try again.");
    }
  }

  return (
    <div className="myProfilePage">
      <header className="myProfileToolbar">
        <div>
          <small className="myProfileKicker">Admit card · NSUT IMS</small>
          <h1>End Semester Admit Card</h1>
          <p>Generated from IMS with your saved sign-in. Print or save it as a PDF, and it stays here for later.</p>
        </div>
        <div className="myProfileActions">
          {card && secret ? (
            <button className="admitCardSecondary" type="button" onClick={() => void generate(secret)} disabled={busy}>
              {busy ? <Loader2 size={15} className="attSpinIcon" /> : <RefreshCw size={15} />} Refresh card
            </button>
          ) : null}
        </div>
      </header>

      {(error || notice) && (
        <div className={error ? "myProfileAlert" : "admitCardNotice"} role={error ? "alert" : "status"} aria-live="polite">
          {error && <AlertTriangle size={18} />}
          <div>
            {error && <b>Admit card not generated</b>}
            <span>{error || notice}</span>
          </div>
        </div>
      )}

      {card && (
        <article className="myProfileSheet">
          <div className="myProfileSectionLabel">{card.title}</div>
          <dl className="myProfileDetails">
            {card.papers.map(paper => (
              <div className="myProfileDetailRow" key={paper.code}>
                <dt>{paper.code}</dt>
                <dd>{paper.name}</dd>
              </div>
            ))}
          </dl>
          <p className="admitCardMeta">
            {card.papers.length ? `${card.papers.length} papers` : ""}
            {card.generatedAt ? ` · generated ${card.generatedAt}` : ""} · saved on this device
          </p>
          <button className="myProfilePrintButton" type="button" onClick={print}>
            <Printer size={16} /> Print / Save as PDF
          </button>
        </article>
      )}

      {/* Off-screen: the browser prints IMS's own sheet from this frame, so the
          page shows a readable summary instead of a cramped portal viewport. */}
      {card && (
        <iframe
          ref={frameRef}
          className="imsPrintFrame"
          title="IMS admit card"
          srcDoc={card.html}
          onLoad={() => {
            if (!printPending) return;
            setPrintPending(false);
            print();
          }}
        />
      )}

      {!card && busy && (
        <div className="myProfileLoading" role="status" aria-live="polite">
          <Loader2 className="attSpinIcon" size={26} />
          <b>Generating your admit card…</b>
          <span>My Activities → Examination Admit Card on NSUT IMS.</span>
        </div>
      )}

      {!card && !busy && secret && (
        <div className="myProfileEmpty">
          <span className="myProfileEmptyIcon"><FileText size={30} /></span>
          <h2>Generate your admit card</h2>
          <p>NSUT IMS issues the card for your current semester. Press the button and it appears here.</p>
          <button type="button" onClick={() => void generate(secret)}>Generate admit card</button>
        </div>
      )}

      {/* No saved sign-in on this device: the one time the password is needed. */}
      {!card && !busy && !secret && (
        <form
          className="admitCardPassword"
          onSubmit={(event) => {
            event.preventDefault();
            void generate(typed);
          }}
        >
          <label htmlFor="admit-card-password">IMS password</label>
          <input
            id="admit-card-password"
            type="password"
            autoComplete="current-password"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Your IMS password"
          />
          <button className="myProfilePrintButton" type="submit" disabled={!typed.trim()}>
            <FileText size={16} /> Generate admit card
          </button>
          <small>
            This device has no saved IMS sign-in, so the card is generated once from your password. It is not stored — only the card is.{" "}
            <button type="button" className="admitCardInlineLink" onClick={() => requestAttendanceRefresh("print")}>
              Sign in instead
            </button>
          </small>
        </form>
      )}
    </div>
  );
}
