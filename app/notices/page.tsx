"use client";

/**
 * All IMS notices in one place: searchable, filterable by department, grouped by
 * date, with read/unread state and pins kept on this device.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bell, ChevronRight, Pin, Search, SearchX, CheckCheck, RefreshCw } from "lucide-react";
import HubShell from "../app-shell";
import { OfflineBanner, Skeleton, useOnlineStatus } from "../ui";
import { isRecentNotice } from "../../lib/notice-date";
import {
  countUnread,
  exactNoticeDate,
  noticeGroup,
  markAllNoticesRead,
  markNoticeRead,
  noticeId,
  NOTICE_GROUPS,
  refreshNotices,
  relativeNoticeDate,
  setNoticeFilter,
  togglePinnedNotice,
  useNoticeStore,
  type Notice,
  type NoticeGroup,
} from "../../lib/notices-client";

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
  const orderedNotices = useMemo(
    () => [...notices].sort((a, b) => b.isoDate.localeCompare(a.isoDate)),
    [notices],
  );
  const read = useMemo(() => new Set(store.readIds), [store.readIds]);
  const pinned = useMemo(() => new Set(store.pinnedIds), [store.pinnedIds]);
  const unread = countUnread(notices, store.readIds);

  const departments = useMemo(() => {
    const values = new Set<string>();
    for (const notice of notices) if (notice.department) values.add(notice.department);
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [notices]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orderedNotices.filter((notice) => {
      const id = noticeId(notice);
      if (store.filter.department !== "All" && notice.department !== store.filter.department) return false;
      if (store.filter.mode === "unread" && read.has(id)) return false;
      if (needle && !notice.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [orderedNotices, query, read, store.filter.department, store.filter.mode]);

  const pinnedNotices = filtered.filter((notice) => pinned.has(noticeId(notice)));
  const unpinned = filtered.filter((notice) => !pinned.has(noticeId(notice)));

  const grouped = useMemo(() => {
    const map = new Map<NoticeGroup, Notice[]>();
    for (const group of NOTICE_GROUPS) map.set(group, []);
    for (const notice of unpinned) map.get(noticeGroup(notice.isoDate))?.push(notice);
    return map;
  }, [unpinned]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await refreshNotices();
    } finally {
      setRetrying(false);
    }
  }

  function resetFilters() {
    setQuery("");
    setNoticeFilter({ mode: "all", department: "All" });
  }

  function renderRow(notice: Notice) {
    const id = noticeId(notice);
    const isUnread = !read.has(id);
    const isPinned = pinned.has(id);
    const exact = exactNoticeDate(notice.isoDate);
    const relative = relativeNoticeDate(notice.isoDate);
    return (
      <article className={`ntRow ${isUnread ? "isUnread" : ""}`} key={id}>
        <Link
          className="ntRowMain"
          href={`/notices/${id}`}
          onClick={() => markNoticeRead(id)}
          aria-label={`${isUnread ? "Unread notice. " : ""}${notice.title}`}
        >
          <span className={`ntUnreadDot ${isUnread ? "on" : ""}`} aria-hidden="true" />
          <span className="ntRowText">
            <span className="ntRowTop">
              <span className="ntTitle">{notice.title}</span>
              {isUnread && isRecentNotice(notice.isoDate) && <span className="newBadge">New</span>}
            </span>
            <span className="ntRowMeta">
              {notice.department && <span className="ntDept">{notice.department}</span>}
              <time dateTime={notice.isoDate} title={exact}>
                {relative}
              </time>
            </span>
          </span>
          <ChevronRight size={17} className="ntChev" aria-hidden="true" />
        </Link>
        <button
          className={`ntPin ${isPinned ? "on" : ""}`}
          type="button"
          aria-label={isPinned ? "Unpin notice" : "Pin notice"}
          aria-pressed={isPinned}
          title={isPinned ? "Unpin notice" : "Pin to top"}
          onClick={() => togglePinnedNotice(id)}
        >
          <Pin size={15} aria-hidden="true" />
        </button>
      </article>
    );
  }

  return (
    <div className="ntShell">
      <header className="ntHeader">
        <div>
          <small className="panelKicker">Circulars &amp; orders</small>
          <h1>Notices</h1>
          <p>Everything the university has published on the IMS notice board, newest first.</p>
        </div>
        <div className="ntHeaderSide">
          <span className="ntCount">
            {store.payload ? `${unread} unread · ${notices.length} total` : "Loading notices…"}
          </span>
          {store.payload && (
            <span className="ntUpdated" title={new Date(store.payload.fetchedAt).toLocaleString("en-IN")}>
              Updated {relativeNoticeDate(new Date(store.payload.fetchedAt).toISOString().slice(0, 10))}
            </span>
          )}
        </div>
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

        <div className="ntToolbarRow">
          <div className="ntMode" role="group" aria-label="Filter notices by read state">
            <button
              type="button"
              className={store.filter.mode === "unread" ? "active" : ""}
              aria-pressed={store.filter.mode === "unread"}
              onClick={() => setNoticeFilter({ mode: "unread" })}
            >
              Unread{unread ? ` · ${unread}` : ""}
            </button>
            <button
              type="button"
              className={store.filter.mode === "all" ? "active" : ""}
              aria-pressed={store.filter.mode === "all"}
              onClick={() => setNoticeFilter({ mode: "all" })}
            >
              All
            </button>
          </div>
          <button
            className="ntMarkAll"
            type="button"
            onClick={() => markAllNoticesRead(notices)}
            disabled={!unread}
            title={unread ? "Mark every notice as read" : "Everything is already read"}
          >
            <CheckCheck size={15} aria-hidden="true" />
            Mark all as read
          </button>
        </div>

        {departments.length > 0 && (
          <div className="ntFilters" aria-label="Filter by department">
            <button
              type="button"
              className={`ntChip ${store.filter.department === "All" ? "active" : ""}`}
              aria-pressed={store.filter.department === "All"}
              onClick={() => setNoticeFilter({ department: "All" })}
            >
              All departments
            </button>
            {departments.map((department) => (
              <button
                key={department}
                type="button"
                className={`ntChip ${store.filter.department === department ? "active" : ""}`}
                aria-pressed={store.filter.department === department}
                onClick={() => setNoticeFilter({ department })}
              >
                {department}
              </button>
            ))}
          </div>
        )}
      </div>

      {store.error && !store.payload ? (
        <div className="ntState" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <h2>Could not load the notices</h2>
          <p>{store.error}</p>
          <button className="ntPrimary" type="button" onClick={retry} disabled={retrying}>
            {retrying ? <RefreshCw size={14} className="attSpinIcon" /> : <RefreshCw size={14} />}
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : !store.payload ? (
        <div className="hubCard ntPanel">
          <Skeleton rows={6} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="ntState">
          {store.filter.mode === "unread" && !query ? <CheckCheck size={30} aria-hidden="true" /> : <SearchX size={30} aria-hidden="true" />}
          <h2>{store.filter.mode === "unread" && !query ? "You're all caught up" : "No notices match"}</h2>
          <p>
            {store.filter.mode === "unread" && !query
              ? "Every notice on this device has been read. New circulars will appear here as unread."
              : "Try a different word, department or the All tab."}
          </p>
          <button className="ntPrimary" type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      ) : (
        <div className="ntGroups">
          {pinnedNotices.length > 0 && (
            <section className="ntGroup" aria-labelledby="nt-pinned">
              <h2 className="ntGroupHead isPinned" id="nt-pinned">
                <span>
                  <Pin size={13} aria-hidden="true" /> Pinned
                </span>
                <small>{pinnedNotices.length}</small>
              </h2>
              <div className="ntList">{pinnedNotices.map(renderRow)}</div>
            </section>
          )}

          {NOTICE_GROUPS.map((group) => {
            const items = grouped.get(group) ?? [];
            if (!items.length) return null;
            return (
              <section className="ntGroup" key={group} aria-labelledby={`nt-group-${group.replace(/\s/g, "-")}`}>
                <h2 className="ntGroupHead" id={`nt-group-${group.replace(/\s/g, "-")}`}>
                  <span>{group}</span>
                  <small>{items.length}</small>
                </h2>
                <div className="ntList">{items.map(renderRow)}</div>
              </section>
            );
          })}
        </div>
      )}

      <p className="ntFootNote">
        <Bell size={13} aria-hidden="true" />
        {store.payload
          ? `${filtered.length.toLocaleString("en-IN")} of ${notices.length.toLocaleString("en-IN")} notices shown. Opening a notice marks it read on this device.`
          : "Reading the IMS notice board…"}
      </p>
    </div>
  );
}
