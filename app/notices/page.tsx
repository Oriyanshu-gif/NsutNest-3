"use client";

/**
 * Latest IMS notices, kept short and direct.
 *
 * Each row opens the original PDF through the proxy; there is no intermediate
 * detail page, no read/unread state and no pinning. Older notices stay on the
 * official IMS board, linked at the bottom.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Bell, ExternalLink, RefreshCw, Search, SearchX } from "lucide-react";
import HubShell from "../app-shell";
import { OfflineBanner, Skeleton, useOnlineStatus } from "../ui";
import {
  exactNoticeDate,
  refreshNotices,
  relativeNoticeDate,
  useNoticeStore,
  type Notice,
} from "../../lib/notices-client";

const LATEST_LIMIT = 10;
const IMS_BOARD = "https://www.imsnsit.org/imsnsit/notifications.php";

export default function NoticesPage() {
  return (
    <HubShell>
      <NoticesBody />
    </HubShell>
  );
}

function NoticesBody() {
  const store = useNoticeStore();
  const online = useOnlineStatus();
  const [query, setQuery] = useState("");
  const [retrying, setRetrying] = useState(false);

  const notices = store.payload?.notices ?? [];
  const latest = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...notices]
      .sort((a, b) => b.isoDate.localeCompare(a.isoDate))
      .filter((notice) => !needle || notice.title.toLowerCase().includes(needle))
      .slice(0, LATEST_LIMIT);
  }, [notices, query]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await refreshNotices();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="ntShell">
      <header className="ntHeader">
        <div>
          <small className="panelKicker">Circulars &amp; orders</small>
          <h1>Notices</h1>
          <p>Latest circulars from the IMS board. Tap a notice to open the original PDF.</p>
        </div>
        {store.payload && (
          <div className="ntHeaderSide">
            <span className="ntUpdated" title={new Date(store.payload.fetchedAt).toLocaleString("en-IN")}>
              Updated {relativeNoticeDate(new Date(store.payload.fetchedAt).toISOString().slice(0, 10))}
            </span>
          </div>
        )}
      </header>

      {(store.usingCache || !online) && store.payload && (
        <OfflineBanner lastSynced={store.payload.fetchedAt} onRetry={retry} retrying={retrying} />
      )}

      <div className="ntToolbar">
        <label className="ntSearch">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notice titles"
            type="search"
            aria-label="Search notices by title"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              ×
            </button>
          )}
        </label>
      </div>

      {store.error && !store.payload ? (
        <div className="ntState" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <h2>Could not load the notices</h2>
          <p>{store.error}</p>
          <button className="ntPrimary" type="button" onClick={retry} disabled={retrying}>
            <RefreshCw size={14} className={retrying ? "attSpinIcon" : ""} />
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : !store.payload ? (
        <div className="hubCard ntPanel">
          <Skeleton rows={6} />
        </div>
      ) : latest.length === 0 ? (
        <div className="ntState">
          {query ? <SearchX size={30} aria-hidden="true" /> : <Bell size={30} aria-hidden="true" />}
          <h2>{query ? "No notices match" : "No notices on the board"}</h2>
          <p>
            {query
              ? "Try a different word, or clear the search."
              : "New circulars will appear here as soon as IMS publishes them."}
          </p>
          {query && (
            <button className="ntPrimary" type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="ntList">
          {latest.map((notice) => (
            <NoticeRow key={`${notice.isoDate}-${notice.title}`} notice={notice} />
          ))}
        </div>
      )}

      {latest.length > 0 && (
        <p className="ntFootNote">
          <Bell size={13} aria-hidden="true" />
          {query
            ? `${latest.length} matching notice${latest.length === 1 ? "" : "s"}`
            : `Latest ${latest.length} notice${latest.length === 1 ? "" : "s"}`}
          <span aria-hidden="true">·</span>
          <a href={IMS_BOARD} target="_blank" rel="noopener noreferrer">
            Full IMS board <ExternalLink size={12} aria-hidden="true" />
          </a>
        </p>
      )}
    </div>
  );
}

function NoticeRow({ notice }: { notice: Notice }) {
  return (
    <article className="ntRow">
      <a
        className="ntRowMain"
        href={notice.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open PDF: ${notice.title}`}
      >
        <span className="ntRowText">
          <span className="ntRowTop">
            <span className="ntTitle">{notice.title}</span>
          </span>
          <span className="ntRowMeta">
            {notice.department && <span className="ntDept">{notice.department}</span>}
            <time dateTime={notice.isoDate}>{exactNoticeDate(notice.isoDate)}</time>
          </span>
        </span>
        <ExternalLink size={16} className="ntChev" aria-hidden="true" />
      </a>
    </article>
  );
}
