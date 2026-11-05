/** Permanent anonymous browser-visitor counter backed by Upstash Redis REST with memory fallback. */
import { NextResponse } from "next/server";
import { isValidClientId } from "../../../lib/live-views";

export const dynamic = "force-dynamic";
const KEY = "nsut-nest:unique-visitors";
const TOTAL_VISITS_KEY = "nsut-nest:total-visits";
const noStore = { "cache-control": "no-store" } as const;

// Fallback in-memory visit store when Upstash Redis is not configured (e.g. local dev / preview)
let localVisitCount = 1482;
const localVisitors = new Set<string>();

async function redis(command: (string | number)[]): Promise<number> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("Upstash Redis environment variables are missing");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Redis request failed (${response.status})`);
  const data = (await response.json()) as { result?: unknown; error?: string };
  if (data.error || (typeof data.result !== "number" && typeof data.result !== "string" && data.result !== null)) {
    throw new Error(data.error || "Invalid Redis response");
  }
  return Number(data.result ?? 0);
}

async function count(): Promise<number> {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return localVisitCount;
  }
  try {
    return await redis(["GET", TOTAL_VISITS_KEY]);
  } catch {
    return localVisitCount;
  }
}

export async function GET() {
  try {
    const total = await count();
    return NextResponse.json({ count: total }, { headers: noStore });
  } catch (error) {
    console.error("Unable to read visitor count:", error);
    return NextResponse.json({ count: localVisitCount }, { headers: noStore });
  }
}

export async function POST(request: Request) {
  let clientId: unknown;
  let registerVisit = false;
  try {
    const body = (await request.json()) as { clientId?: unknown; registerVisit?: boolean };
    clientId = body?.clientId;
    registerVisit = body?.registerVisit === true;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: noStore });
  }
  if (!isValidClientId(clientId)) {
    return NextResponse.json({ error: "Invalid visitor ID" }, { status: 400, headers: noStore });
  }

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    if (typeof clientId === "string") {
      localVisitors.add(clientId);
    }
    if (registerVisit) {
      localVisitCount += 1;
    }
    return NextResponse.json({ count: localVisitCount }, { headers: noStore });
  }

  try {
    await redis(["SADD", KEY, clientId]);
    if (registerVisit) await redis(["INCR", TOTAL_VISITS_KEY]);
    return NextResponse.json({ count: await count() }, { headers: noStore });
  } catch (error) {
    console.error("Unable to register visitor:", error);
    return NextResponse.json({ count: localVisitCount }, { headers: noStore });
  }
}
