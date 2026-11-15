import { NextRequest, NextResponse } from 'next/server';
import {
  readImsSession,
  requestIms,
  clearImsSession,
  readImsSessionFrom,
  setImsSession,
} from '../../../../lib/ims-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Keeps an authenticated IMS session from lapsing.
 *
 * IMS expires an idle session on its own, and the next refresh then needs a new
 * CAPTCHA. Touching one already-authenticated page renews the portal cookies and
 * re-issues our cookie for another 12 hours, so a student who signed in once
 * stays signed in while the app is open. No credentials and no CAPTCHA are
 * involved: this only reuses the session the student created themselves.
 */
export async function POST(request: NextRequest) {
  const session = readImsSessionFrom(request);
  const page = session?.profileUrl ?? session?.navigationUrls?.[0];
  if (!session || session.stage !== 'attendance' || !page) {
    return NextResponse.json({ ok: false, needsLogin: true }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const response = await requestIms(session, page, { referer: session.loginUrl });
    // IMS answers a dead session with its own password form.
    if (/<input[^>]+type=["']?password/i.test(response.html)) throw new Error('signed out');
    const renewed = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    setImsSession(renewed, session);
    return renewed;
  } catch {
    const expired = NextResponse.json({ ok: false, needsLogin: true }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    clearImsSession(expired);
    return expired;
  }
}
