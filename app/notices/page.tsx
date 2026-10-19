"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {   AlertTriangle, ArrowLeft, Bell, ExternalLink, Loader2, Search,
} from "lucide-react";
import { isRecentNotice } from "../../lib/notice-date";

type Notice = {
  date: string;
  isoDate: string;
  title: string;
  publishedBy: string;
  department: string;
  href: string;
};

type Payload = { notices: Notice[]; fetchedAt: number; source: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthYear(iso: string) {
  const [year, month] = iso.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

export default function NoticesPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All");

  useEffect(() => {
    let active = true;
    fetch("/api/notices")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body as Payload;
      })
      .then((body) => { if (active) setPayload(body); })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Could not load notices."));
    return () => { active = false; };
  }, []);

  const notices = payload?.notices ?? null;

  const departments = useMemo(
    () => (notices ? Array.from(new Set(notices.map((n) => n.department).filter(Boolean))).sort() : []),
    [notices],
  );

  const filtered = useMemo(() => {
    if (!notices) return [];
    const q = query.trim().toLowerCase();
    return notices.filter(
      (n) =>
        (department === "All" || n.department === department) &&
        (!q || `${n.title} ${n.publishedBy} ${n.department}`.toLowerCase().includes(q)),
    );
  }, [notices, query, department]);

  return (
    <main className="profileShell">
      <Link href="/" className="backLink"><ArrowLeft size={16} /> Back to results</Link>

      <header className="profileHero">
        <div className="profileAvatar"><Bell size={30} /></div>
        <div className="profileIdentity">
          <h1>IMS notices</h1>
          <p>Notices and circulars published on NSUT&apos;s IMS portal</p>
          <div className="profileTags">
            <span>{notices ? `${notices.length} notices` : "Loading…"}</span>
            {payload && (
              <span>read {new Date(payload.fetchedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
            )}
          </div>
        </div>
        <a
          className="blueButton"
          href="https://www.imsnsit.org/imsnsit/notifications.php"
          target="_blank"
          rel="noreferrer noopener"
        >
          Open on IMS ↗
        </a>
      </header>

      <section className="profilePanel">
        <div className="panelTitle">
          <div>
            <h2>Notices</h2>
            <p className="mutedText">
              Each notice opens the original document in a new tab.
            </p>
          </div>
          <ExternalLink size={20} />
        </div>

        <label className="search noticeSearch">
          <Search size={21} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, department or who published it..."
          />
          {query && <button onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>

        {departments.length > 1 && (
          <div className="pills noticePills">
            <button className={`pill ${department === "All" ? "active" : ""}`} onClick={() => setDepartment("All")}>All</button>
            {departments.map((d) => (
              <button key={d} className={`pill ${department === d ? "active" : ""}`} onClick={() => setDepartment(d)}>{d}</button>
            ))}
          </div>
        )}

        {error ? (
          <div className="empty">
            <AlertTriangle size={30} />
            <h3>Could not load the notices</h3>
            <p>{error}</p>
            <button className="pill active" onClick={() => window.location.reload()}>Try again</button>
          </div>
        ) : !notices ? (
          <div className="loading"><Loader2 className="spin" size={24} /><p>Loading notices…</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <Search size={30} />
            <h3>No notices found</h3>
            <p>Try another word or department.</p>
            <button className="pill active" onClick={() => { setQuery(""); setDepartment("All"); }}>Reset filters</button>
          </div>
        ) : (
          <>
            <p className="viewNote">
              Showing {filtered.length.toLocaleString("en-IN")} of {notices.length.toLocaleString("en-IN")} notices
              {department === "All" ? "" : ` from ${department}`}.
            </p>
            <div className="noticeList">
              {filtered.map((n) => (
                <a className="noticeRow" key={n.href} href={n.href} target="_blank" rel="noreferrer noopener">
                  <time className="noticeDate" dateTime={n.isoDate}>
                    <b>{n.isoDate.slice(8, 10)}</b>
                    <span>{monthYear(n.isoDate)}</span>
                  </time>
                  <div className="noticeBody">
                    <h3>{n.title}{isRecentNotice(n.isoDate) && <span className="newBadge">NEW</span>}</h3>
                    <p>{n.publishedBy}</p>
                  </div>
                  <ExternalLink size={15} className="noticeIcon" />
                </a>
              ))}
            </div>
          </>
        )}

      </section>
    </main>
  );
}
