/**
 * The NSUT notice board, read server-side and returned as JSON.
 *
 * Read here rather than from the browser so the request never has to cross
 * imsnsit.org's own cross-origin rules, and so the board is only fetched once per
 * cache window no matter how many visitors ask for it.
 */
import { NextResponse } from "next/server";
import { IMS_NOTICES_URL, USER_AGENT, parseNotices, type Notice } from "../../../lib/notices";

/** The board changes a few times a week; refetching per visit would be wasteful. */
const CACHE_MS = 10 * 60 * 1000;

let cache: { fetchedAt: number; notices: Notice[] } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) {
    return NextResponse.json({ ...cache, source: IMS_NOTICES_URL });
  }

  try {
    const res = await fetch(IMS_NOTICES_URL, {
      headers: { "user-agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `The IMS notice board answered HTTP ${res.status}.` },
        { status: 502 },
      );
    }

    const notices = parseNotices(await res.text());
    if (notices.length === 0) {
      // A login page or a redesign would parse to nothing; say so rather than
      // serving an empty list that looks like a quiet week.
      return NextResponse.json(
        { error: "The IMS notice board returned no recognisable notices. It may have changed its layout." },
        { status: 502 },
      );
    }

    cache = { fetchedAt: Date.now(), notices };
    return NextResponse.json({ ...cache, source: IMS_NOTICES_URL });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach the IMS notice board: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
