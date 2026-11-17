import { NextRequest, NextResponse } from 'next/server';
import { safeUpstreamError } from '../../../../lib/ims-auth-errors';
import {
  readImsSession,
  clearImsSession,
  readImsSessionFrom,
  setImsSession,
} from '../../../../lib/ims-http';
import { ImsSessionExpiredError } from '../../../../lib/ims-profile';
import { fetchImsTimetable } from '../../../../lib/ims-timetable-flow';
import { rateLimit, requestKey } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The dashboard caches this for hours, so a modest burst limit is plenty. */
const TIMETABLE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const limited = rateLimit(`ims-timetable:${requestKey(request)}`, TIMETABLE_LIMIT);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Too many timetable refreshes. Wait a moment and try again.' },
      {
        status: 429,
        headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limited.retryAfterSeconds) },
      },
    );
  }

  const session = readImsSessionFrom(request);
  if (!session || session.stage !== 'attendance' || !session.studentRoll || !session.navigationUrls?.length) {
    return NextResponse.json(
      { error: 'Sign in to NSUT IMS to load your timetable.', needsLogin: true },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const payload = await fetchImsTimetable(session);
    const response = NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
    // Discovery refreshes IMS cookies and can add session state; keep the
    // HttpOnly session cookie current without failing a good timetable read.
    try {
      setImsSession(response, session);
    } catch {
      // The existing cookie still holds a valid session.
    }
    return response;
  } catch (error) {
    if (error instanceof ImsSessionExpiredError) {
      const response = NextResponse.json(
        { error: 'Your IMS session expired. Sign in again to load your timetable.', needsLogin: true },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
      clearImsSession(response);
      return response;
    }

    // Older sessions predate the saved My Activities token. Ask for one fresh
    // sign-in so the next fetch can capture it, but keep the attendance session
    // (and its saved data) intact.
    if (/reconnect the timetable link/i.test(error instanceof Error ? error.message : '')) {
      return NextResponse.json(
        { error: 'Sign in to IMS again to reconnect your timetable.', needsLogin: true },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const safe = safeUpstreamError(error, 'Could not load your IMS timetable right now. Please try again.');
    return NextResponse.json(
      { error: safe.message },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
