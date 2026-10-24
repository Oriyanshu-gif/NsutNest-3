/**
 * The live "students viewing now" counter.
 *
 * POST records a heartbeat from one browser and answers with the current tally;
 * GET reads the tally without recording anything. Both are per-instance (see
 * lib/live-views.ts) and are never cached.
 */
import { NextResponse } from "next/server";
import { isValidClientId, liveViewerCount, recordHeartbeat } from "../../../lib/live-views";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" } as const;

export async function GET() {
  return NextResponse.json({ count: liveViewerCount() }, { headers: noStore });
}

export async function POST(request: Request) {
  let clientId: unknown;
  try {
    const body = (await request.json()) as { clientId?: unknown };
    clientId = body?.clientId;
  } catch {
    clientId = undefined;
  }

  // An unusable id is simply not counted; the caller still gets a tally so a
  // stale client can never break the counter for everyone else.
  if (!isValidClientId(clientId)) {
    return NextResponse.json({ count: liveViewerCount() }, { headers: noStore });
  }

  return NextResponse.json({ count: recordHeartbeat(clientId) }, { headers: noStore });
}
