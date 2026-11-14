"use client";

/**
 * One notice, with a permanent deep link (/notices/:id).
 *
 * The id is a hash of the notice's durable IMS document token, so a link keeps
 * working as long as the document token does. Opening this page marks the notice
 * read; the original PDF still comes through the same-origin proxy because the
 * IMS board refuses requests without its own Referer.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Bell, ExternalLink, Link2, Pin, RefreshCw, AlertTriangle } from "lucide-react";
import HubShell from "../../app-shell";
import { OfflineBanner, Skeleton, useOnlineStatus } from "../../ui";
import {
  exactNoticeDate,
  markNoticeRead,
  noticeId,
  refreshNotices,
  relativeNoticeDate,
  togglePinnedNotice,
  useNoticeStore,
} from "../../../lib/notices-client";

export default function NoticeDetailPage() {
  return (
    <HubShell>
      <NoticeDetailBody />
    </HubShell>
  );
}

function NoticeDetailBody() {
  const params = useParams<{ id: string }>();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const store = useNoticeStore();
  const online = useOnlineStatus();
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const notice = store.payload?.notices.find((item) => noticeId(item) === rawId) ?? null;

  useEffect(() => {
    if (notice) markNoticeRead(noticeId(notice));
  }, [notice]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await refreshNotices();
    } finally {
      setRetrying(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permissions are optional; the address bar still has the URL.
    }
  }

  return (
    <div className="ntDetailShell">
      <Link href="/notices" className="backLink">
        <ArrowLeft size={16} aria-hidden="true" /> All notices
      </Link>

      {(store.usingCache || !online) && store.payload && (
        <OfflineBanner lastSynced={store.payload.fetchedAt} onRetry={retry} retrying={retrying} />
      )}

      {!notice && !store.payload && !store.error ? (
        <div className="hubCard ntPanel">
          <Skeleton rows={4} />
        </div>
      ) : !notice && store.error ? (
        <div className="ntState" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <h2>Could not open this notice</h2>
          <p>{store.error}</p>
          <button className="ntPrimary" type="button" onClick={retry} disabled={retrying}>
            <RefreshCw size={14} className={retrying ? "attSpinIcon" : ""} /> {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : !notice ? (
        <div className="ntState">
          <Bell size={28} aria-hidden="true" />
          <h2>This notice is no longer on the board</h2>
          <p>
            IMS keeps a rolling list, so older notices drop off. The full archive is still available on the official
            board.
          </p>
          <Link className="ntPrimary" href="/notices">
            Back to notices
          </Link>
        </div>
      ) : (
        <article className="hubCard ntDetail">
          <header className="ntDetailHead">
            <div className="ntDetailMeta">
              {notice.department && <span className="ntDept">{notice.department}</span>}
              <time dateTime={notice.isoDate} title={exactNoticeDate(notice.isoDate)}>
                {exactNoticeDate(notice.isoDate)} · {relativeNoticeDate(notice.isoDate)}
              </time>
            </div>
            <button
              className={`ntPin ntDetailPin ${store.pinnedIds.includes(noticeId(notice)) ? "on" : ""}`}
              type="button"
              aria-label={store.pinnedIds.includes(noticeId(notice)) ? "Unpin notice" : "Pin notice"}
              aria-pressed={store.pinnedIds.includes(noticeId(notice))}
              onClick={() => togglePinnedNotice(noticeId(notice))}
            >
              <Pin size={16} aria-hidden="true" />
              <span>{store.pinnedIds.includes(noticeId(notice)) ? "Pinned" : "Pin"}</span>
            </button>
          </header>

          <h1>{notice.title}</h1>

          {notice.publishedBy && (
            <p className="ntDetailBy">
              Published by <b>{notice.publishedBy}</b>
            </p>
          )}

          <div className="ntDetailActions">
            <a
              className="ntPrimary ntPrimaryLarge"
              href={notice.href}
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Open the original notice PDF in a new tab"
            >
              <ExternalLink size={16} aria-hidden="true" /> Open original PDF
            </a>
            <button className="ntSecondary" type="button" onClick={copyLink}>
              <Link2 size={15} aria-hidden="true" /> {copied ? "Link copied" : "Copy link"}
            </button>
          </div>

          <div className="ntDetailNote">
            <p>
              The document opens through NSUT Nest&apos;s proxy because the IMS board only serves its files with its
              own referral. Nothing about this notice is stored on a server.
            </p>
            <a href="https://www.imsnsit.org/imsnsit/notifications.php" target="_blank" rel="noreferrer noopener">
              Open the IMS notice board <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>
        </article>
      )}
    </div>
  );
}
