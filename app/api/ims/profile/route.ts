import { NextRequest, NextResponse } from 'next/server';
import { load } from 'cheerio';
import { safeUpstreamError } from '../../../../../lib/ims-auth-errors';
import {
  IMS_BASE_URL,
  IMS_COOKIE_NAME,
  encodeImsSession,
  imsCookieOptions,
  pageText,
  readImsSession,
  requestIms,
  requestImsImage,
  type ImsHttpSession,
} from '../../../../../lib/ims-http';
import {
  detectImageMimeType,
  discoverProfileUrl,
  findProfilePrintUrl,
  ImsSessionExpiredError,
  isImsLoginPage,
} from '../../../../../lib/ims-profile';
import { rateLimit, requestKey } from '../../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The IMS "Print Profile" tab is a one-time token that only resolves inside the
 * student's IMS session, so the browser cannot open it directly. This route
 * loads that page with the stored session and hands the HTML back, which is the
 * only way to show the portal's own printout inside NSUT Nest.
 */
const PRINT_LIMIT = { limit: 20, windowMs: 60_000 };
const MAX_INLINE_IMAGES = 6;
const MAX_IMAGE_BYTES = 4_000_000;

function clearImsCookie(response: NextResponse) {
  response.cookies.set(IMS_COOKIE_NAME, '', { ...imsCookieOptions(), maxAge: 0 });
  return response;
}

/**
 * The print page references IMS-hosted assets that a browser cannot fetch
 * without the HttpOnly session cookie, so photographs are inlined as data URLs.
 */
async function inlineImages(session: ImsHttpSession, html: string, pageUrl: string) {
  const $ = load(html);
  const images = $('img[src]').toArray().slice(0, MAX_INLINE_IMAGES);
  for (const element of images) {
    const src = $(element).attr('src');
    if (!src || /^data:/i.test(src)) continue;
    try {
      const image = await requestImsImage(session, src, pageUrl);
      if (!image.bytes.length || image.bytes.length > MAX_IMAGE_BYTES) continue;
      const type = detectImageMimeType(image.bytes);
      if (!type) continue;
      $(element).attr('src', `data:${type};base64,${image.bytes.toString('base64')}`);
    } catch {
      // A missing photograph must not stop the portal printout from loading.
    }
  }
  // Any remaining relative link should still point at IMS rather than at us.
  if (!$('base').length) $('head').prepend(`<base href="${isafer(pageUrl)}">`);
  return $.html();
}

/** Only allow the IMS origin in an injected <base href>. */
function isafer(value: string) {
  try {
    const url = new URL(value);
    return /(^|\.)imsnsit\.org$/i.test(url.hostname) ? url.href : IMS_BASE_URL;
  } catch {
    return IMS_BASE_URL;
  }
}

export async function GET(request: NextRequest) {
  const limited = rateLimit(`ims-profile-print:${requestKey(request)}`, PRINT_LIMIT);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Too many print attempts. Wait a moment and try again.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }

  const session = readImsSession(request.cookies.get(IMS_COOKIE_NAME)?.value);
  if (!session || session.stage !== 'attendance' || !session.studentRoll) {
    return NextResponse.json(
      { error: 'Sign in to NSUT IMS to print your profile.' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const profileUrl = await discoverProfileUrl(session);
    if (!profileUrl) {
      throw new Error('The IMS My Profile link is not available in this session. Sync your IMS attendance and try again.');
    }

    const profilePage = await requestIms(session, profileUrl, { referer: IMS_BASE_URL });
    if (isImsLoginPage(profilePage.html)) throw new ImsSessionExpiredError();

    const printUrl = findProfilePrintUrl(profilePage.html, profilePage.url);
    if (!printUrl) {
      throw new Error('IMS did not offer a Print Profile link for this session. Sync your IMS attendance and try again.');
    }

    const printPage = await requestIms(session, printUrl, { referer: profilePage.url });
    if (isImsLoginPage(printPage.html)) throw new ImsSessionExpiredError();

    const text = pageText(printPage.html);
    if (!text || /invalid operation/i.test(text)) {
      throw new Error('IMS refused the Print Profile request for this session. Sign in again and retry.');
    }

    const html = await inlineImages(session, printPage.html, printPage.url);
    const response = new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline' https://www.imsnsit.org; base-uri https://www.imsnsit.org",
      },
    });

    // Persist any cookies IMS refreshed, without failing a good printout.
    try {
      response.cookies.set(IMS_COOKIE_NAME, encodeImsSession(session), imsCookieOptions());
    } catch {
      // The current cookie still holds a valid session.
    }
    return response;
  } catch (error) {
    if (error instanceof ImsSessionExpiredError) {
      return clearImsCookie(NextResponse.json(
        { error: 'Your IMS session has expired. Sync your attendance to sign in again.' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } },
      ));
    }
    const safe = safeUpstreamError(error, 'Could not open the IMS printout right now. Please try again.');
    return NextResponse.json(
      { error: safe.message },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
