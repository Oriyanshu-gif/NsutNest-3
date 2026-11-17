import { NextRequest, NextResponse } from 'next/server';
import { safeUpstreamError } from '../../../../lib/ims-auth-errors';
import {
  encodeImsSession,
  IMS_COOKIE_NAME,
  imsCookieOptions,
  readImsSession,
} from '../../../../lib/ims-http';
import {
  discoverProfileUrl,
  fetchImsProfile,
  ImsSessionExpiredError,
} from '../../../../lib/ims-profile';
import { rateLimit, requestKey } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Opening My Profile is a few upstream page loads. A cached profile in the
 * browser means normal navigation does not hit this route, so a modest burst
 * limit is enough while still stopping a retry loop from hammering IMS.
 */
const PROFILE_LIMIT = { limit: 30, windowMs: 60_000 };

function clearImsCookie(response: NextResponse) {
  response.cookies.set(IMS_COOKIE_NAME, '', { ...imsCookieOptions(), maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(`ims-profile:${requestKey(request)}`, PROFILE_LIMIT);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Too many profile refreshes. Wait a moment and try again.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }

  const session = readImsSession(request.cookies.get(IMS_COOKIE_NAME)?.value);
  if (!session || session.stage !== 'attendance' || !session.studentRoll) {
    return NextResponse.json(
      { error: 'Sign in to NSUT IMS to view your profile.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const profileUrl = await discoverProfileUrl(session);
    if (!profileUrl) {
      throw new Error('The IMS My Profile link is not available in this session. Sync your IMS attendance and try again.');
    }

    const profile = await fetchImsProfile(session, profileUrl);
    const response = NextResponse.json(profile, { headers: { 'Cache-Control': 'no-store' } });

    // Persist the newly discovered link and any cookies IMS refreshed, but never
    // fail an otherwise successful profile read if the cookie is at its limit.
    try {
      response.cookies.set(IMS_COOKIE_NAME, encodeImsSession(session), imsCookieOptions());
    } catch {
      // The current cookie still holds a valid session; the link is rediscovered next time.
    }
    return response;
  } catch (error) {
    if (error instanceof ImsSessionExpiredError) {
      return clearImsCookie(NextResponse.json(
        { error: 'Your IMS session has expired. Sync your attendance to sign in again.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ));
    }

    const safe = safeUpstreamError(error, 'Could not load your IMS profile right now. Please try again.');
    // A missing My Profile link is a flow problem rather than a portal outage.
    if (/My Profile link is not available/i.test(error instanceof Error ? error.message : '')) {
      return NextResponse.json(
        { error: 'Could not find My Profile in your IMS session. Sync your IMS attendance and try again.' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { error: safe.message },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
