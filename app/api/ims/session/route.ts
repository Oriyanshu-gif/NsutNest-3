import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { load } from 'cheerio';
import {
  encodeImsSession,
  IMS_BASE_URL,
  IMS_COOKIE_NAME,
  IMS_SESSION_SECONDS,
  imsCookieOptions,
  pageForms,
  requestIms,
  requestImsImage,
  type ImsHttpSession,
} from '../../../../lib/ims-http';
import { safeUpstreamError } from '../../../../lib/ims-auth-errors';
import { rateLimit, requestKey } from '../../../../lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Starting a CAPTCHA session is cheap for us but hits the portal, so cap bursts. */
const SESSION_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = rateLimit(`ims-session:${requestKey(request)}`, SESSION_LIMIT);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: 'Too many sign-in attempts from this connection. Wait a moment and try again.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }

  try {
    const session: ImsHttpSession = {
      id: randomUUID(),
      cookies: {},
      stage: 'login',
      loginUrl: new URL('student_login.php', IMS_BASE_URL).href,
    };

    await requestIms(session, IMS_BASE_URL);
    const studentPage = await requestIms(session, new URL('student.htm', IMS_BASE_URL).href);
    const $student = load(studentPage.html);
    // IMS has changed its frameset over time. The login form is not guaranteed
    // to be in the first frame, so inspect every same-portal frame until the
    // actual password form is found.
    const frameUrls = $student('frame[src], iframe[src]').toArray()
      .map(frame => $student(frame).attr('src'))
      .filter((src): src is string => Boolean(src));
    const candidates = [...frameUrls, 'student_login.php'];
    let loginPage: Awaited<ReturnType<typeof requestIms>> | null = null;
    let loginForm: ReturnType<typeof pageForms>[number] | undefined;
    for (const frameUrl of [...new Set(candidates)]) {
      try {
        const page = await requestIms(session, frameUrl, { referer: studentPage.url });
        const form = pageForms(page.html).find(candidate => /type\s*=\s*["']?password/i.test(candidate.html));
        if (form) {
          loginPage = page;
          loginForm = form;
          break;
        }
      } catch {
        // One obsolete or unrelated frame should not prevent checking others.
      }
    }
    if (!loginPage || !loginForm) {
      throw new Error('Could not find the IMS login form. The IMS portal may be temporarily unavailable; press Refresh to try again.');
    }
    session.loginUrl = loginPage.url;
    session.loginAction = new URL(loginForm.action || loginPage.url, loginPage.url).href;
    session.loginMethod = loginForm.method === 'get' ? 'get' : 'post';
    session.loginFields = Object.fromEntries(loginForm.fields.entries());

    const $login = load(loginPage.html);
    const images = $login('img').toArray();
    // Prefer a clearly labelled CAPTCHA image. Some IMS versions place the
    // CAPTCHA image outside the form or use an unlabelled PHP image URL.
    const captchaImage = images.find(image => {
      const el = $login(image);
      const src = el.attr('src') ?? '';
      const meta = `${src} ${el.attr('id') ?? ''} ${el.attr('alt') ?? ''} ${el.attr('title') ?? ''} ${el.attr('name') ?? ''}`;
      return /captcha|security.?number|securimage|verification.?code|validate.?code/i.test(meta);
    }) ?? images.find(image => {
      const el = $login(image);
      const src = el.attr('src') ?? '';
      return Boolean(src) && (el.closest('form').length > 0 || /\.(?:php|cgi)(?:[?#]|$)/i.test(src));
    }) ?? images.find(image => Boolean($login(image).attr('src')));
    const imageSrc = captchaImage ? $login(captchaImage).attr('src') : null;
    if (!imageSrc) throw new Error('The IMS login page did not contain a CAPTCHA image. The portal may have changed; press Refresh to try again.');

    const image = await requestImsImage(session, imageSrc, loginPage.url);
    if (!image.contentType.toLowerCase().startsWith('image/')) {
      throw new Error('IMS returned a web page instead of the CAPTCHA image. Refresh and try again.');
    }
    const response = NextResponse.json({
      sessionId: session.id,
      captcha: `data:${image.contentType};base64,${image.bytes.toString('base64')}`,
      expiresInSeconds: IMS_SESSION_SECONDS,
      // IMS exposes no sanctioned API or authorised automated verification, so a
      // human must always read the CAPTCHA. The login form renders its fields from
      // this flag rather than assuming, so an officially authorised two-field flow
      // could be wired in later without touching the UI.
      captchaRequired: true,
    }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(IMS_COOKIE_NAME, encodeImsSession(session), imsCookieOptions());
    return response;
  } catch (error) {
    // Portal detail stays on the server; the browser gets something actionable.
    const safe = safeUpstreamError(error);
    return NextResponse.json(
      { error: safe.message },
      { status: safe.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
