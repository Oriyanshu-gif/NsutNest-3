import { NextRequest, NextResponse } from 'next/server';
import { clearImsSession, readImsSessionFrom, setImsSession } from '../../../../lib/ims-http';
import { safeUpstreamError } from '../../../../lib/ims-auth-errors';
import { rateLimit, requestKey } from '../../../../lib/rate-limit';
import { generateAdmitCard } from '../../../../lib/ims-admit-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Each call drives two real IMS form posts, so it gets a tighter budget than reads. */
const LIMIT = { limit: 8, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = rateLimit(`ims-admit-card:${requestKey(request)}`, LIMIT);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: `Too many admit card attempts. Wait ${limited.retryAfterSeconds} seconds and try again.` },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }

  let body: { password?: string; academicYear?: string; semester?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const password = body.password?.trim();
  if (!password) return NextResponse.json({ error: 'Enter your IMS password to generate the admit card.' }, { status: 400 });

  const session = readImsSessionFrom(request);
  if (!session || session.stage !== 'attendance' || !session.studentRoll) {
    return NextResponse.json(
      { error: 'Your IMS session ended. Sign in with the CAPTCHA and try again.', needsLogin: true },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const card = await generateAdmitCard(session, password, {
      year: body.academicYear || session.academicYearValue || '',
      semester: body.semester || session.semesterValue || '',
    });
    const response = NextResponse.json(
      { ...card, year: body.academicYear || session.academicYearValue, semester: body.semester || session.semesterValue },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    try {
      setImsSession(response, session);
    } catch {
      // The existing cookie still holds a usable session.
    }
    return response;
  } catch (error) {
    // Upstream detail stays on the server; the browser only gets the safe message.
    console.error('[admit-card]', error);
    const safe = safeUpstreamError(error, 'Could not generate the admit card right now. Please try again.');
    const expired = safe.status === 401;
    const response = NextResponse.json(
      { error: safe.message, ...(expired ? { needsLogin: true } : {}) },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
    if (expired) clearImsSession(response);
    return response;
  }
}
