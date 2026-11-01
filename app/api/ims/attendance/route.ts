import { NextRequest, NextResponse } from 'next/server';
import { load } from 'cheerio';
import {
  encodeImsSession,
  findLink,
  IMS_COOKIE_NAME,
  imsCookieOptions,
  pageText,
  readImsFrames,
  readImsSession,
  requestIms,
  rotateImsSession,
  sessionMatchesId,
  type ImsHttpPage,
  type ImsHttpSession,
} from '../../../../lib/ims-http';
import { loginFailureMessage, safeUpstreamError } from '../../../../lib/ims-auth-errors';
import { rateLimit, requestKey } from '../../../../lib/rate-limit';
import {
  academicYearKey,
  findOption,
  loadAttendancePages,
  readControls,
  semesterNumber,
  submitAttendance,
  type AttendanceControls,
  type SelectControl,
  type SelectOption,
} from '../../../../lib/ims-attendance-flow';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function currentAcademicYear(text: string): string | null {
  const pattern = /\b(?:current\s+)?(?:academic\s+year|academic\s+session|fin(?:ancial)?\s+year|AY)\s*[:(\-]?\s*(20\d{2}\s*[-/–]\s*(?:20)?\d{2})/gi;
  const years = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const key = academicYearKey(match[1]);
    if (key) years.add(key);
  }
  return years.size === 1 ? [...years][0] : null;
}

function currentSemester(text: string): { value: number | null; ambiguous: boolean } {
  const direct = [...text.matchAll(/\bcurrent\s+semester\s*(?::|=|is)?\s*(?:sem(?:ester)?\s*)?([1-8])(?:st|nd|rd|th)?\b/gi)].map(match => Number(match[1]));
  const record = [...text.matchAll(/\bsemester\s*(?:(?:no\.?|number)\s*)?[:=]\s*([1-8])(?:st|nd|rd|th)?\b/gi)].map(match => Number(match[1]));
  const candidates = direct.length ? direct : record;
  const unique = [...new Set(candidates)];
  return { value: unique.length === 1 ? unique[0] : null, ambiguous: unique.length > 1 };
}

function expectedSemester(roll: string, now = new Date()): number | null {
  const admissionYearText = roll.trim().match(/^(\d{4})/);
  if (!admissionYearText) return null;
  const admissionYear = Number(admissionYearText[1]);
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  if (!year || !month) return null;
  if (month >= 5 && month <= 7) return null;

  const isOddSemester = month >= 8;
  const cycleYear = isOddSemester ? year : year - 1;
  const semester = 2 * (cycleYear - admissionYear) + (isOddSemester ? 1 : 2);
  return semester >= 1 && semester <= 8 ? semester : null;
}

function expectedAcademicYear(text: string, now = new Date()): string | null {
  const activeYear = currentAcademicYear(text);
  if (activeYear) return activeYear;

  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  if (!year || !month || (month >= 5 && month <= 7)) return null;
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

function resolveYear(options: SelectOption[], text: string): SelectOption | null {
  const key = expectedAcademicYear(text);
  const matches = key ? options.filter(option => (academicYearKey(option.label) ?? academicYearKey(option.value)) === key) : [];
  return matches.length === 1 ? matches[0] : null;
}

function resolveSemester(options: SelectOption[], text: string, roll: string): SelectOption | null {
  const actual = currentSemester(text);
  if (actual.ambiguous) return null;
  const number = actual.value ?? expectedSemester(roll);
  const matches = number ? options.filter(option => Number(semesterNumber(option.label) ?? semesterNumber(option.value)) === number) : [];
  return matches.length === 1 ? matches[0] : null;
}

function publicOptions(control: SelectControl) {
  return control.options.map(({ value, label }) => ({ value, label }));
}

function confirmationResponse(
  session: ImsHttpSession,
  controls: AttendanceControls,
  academicYear: SelectOption | null,
  semester: SelectOption | null,
  message: string,
) {
  const response = NextResponse.json({
    needsConfirmation: true,
    sessionId: session.id,
    academicYearOptions: publicOptions(controls.academicYear),
    semesterOptions: publicOptions(controls.semester),
    suggested: { academicYear: academicYear?.value ?? '', semester: semester?.value ?? '' },
    required: { academicYear: !academicYear, semester: !semester },
    message,
  }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(IMS_COOKIE_NAME, encodeImsSession(session), imsCookieOptions());
  return response;
}

/**
 * Login attempts are the expensive, abuse-prone part of the flow: each one drives
 * a real portal login. A short window stops credential-stuffing bursts while
 * still leaving room for a mistyped CAPTCHA or password.
 */
const LOGIN_LIMIT = { limit: 12, windowMs: 5 * 60_000 };

/**
 * Saves the authenticated My Profile link while the post-login pages are already
 * in hand. Without it the profile route would have to rediscover the link from
 * frames later; the link is session-encrypted and cannot be constructed.
 */
function rememberProfileLink(session: ImsHttpSession, pages: ImsHttpPage[]) {
  if (session.profileUrl) return;
  try {
    const link = findLink(pages, /^(?:my\s+)?(?:student\s+)?profile$/i);
    if (link) session.profileUrl = link.url;
  } catch {
    // A malformed profile link must not break the attendance login.
  }
}

async function navigateAfterLogin(session: ImsHttpSession, loginResponse: ImsHttpPage) {
  let pages = await readImsFrames(session, loginResponse.url);
  rememberProfileLink(session, [{ url: loginResponse.url, html: loginResponse.html }, ...pages]);
  const activities = findLink(pages, /^My Activities$/i);
  if (!activities) throw new Error('Login succeeded, but the IMS My Activities link was not found in its returned pages.');
  const activitiesPage = await requestIms(session, activities.url, { referer: activities.page.url });
  pages = await readImsFrames(session, activitiesPage.url, activities.page.url);
  rememberProfileLink(session, pages);
  const attendance = findLink(pages, /^My Attendance$/i);
  if (!attendance) throw new Error('The IMS attendance link is not available after opening My Activities.');
  const attendancePage = await requestIms(session, attendance.url, { referer: attendance.page.url });
  pages = await readImsFrames(session, attendancePage.url, attendance.page.url);
  rememberProfileLink(session, pages);
  session.navigationUrls = [...new Set([attendancePage.url, ...pages.map(page => page.url)])];
  return pages;
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(`ims-attendance:${requestKey(request)}`, LOGIN_LIMIT);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: `Too many sign-in attempts. Wait ${limited.retryAfterSeconds} seconds and try again.` },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': String(limited.retryAfterSeconds) } },
    );
  }

  let body: {
    sessionId?: string;
    roll?: string;
    password?: string;
    captcha?: string;
    academicYear?: string;
    semester?: string;
    confirmChoices?: boolean;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const session = readImsSession(request.cookies.get(IMS_COOKIE_NAME)?.value);
  // Binding the body to the cookie's random session id stops a request from
  // driving someone else's half-finished login.
  if (!sessionMatchesId(session, body.sessionId)) {
    return NextResponse.json({ error: 'This CAPTCHA session expired. Refresh the CAPTCHA and try again.' }, { status: 400 });
  }

  try {
    if (session.stage === 'login') {
      if (!body.roll?.trim() || !body.password || !body.captcha?.trim()) {
        return NextResponse.json({ error: 'Enter your IMS ID, password and CAPTCHA.' }, { status: 400 });
      }
      const fields = session.loginFields;
      if (!fields || !session.loginAction) throw new Error('The IMS login form expired. Refresh the CAPTCHA and try again.');
      const names = Object.keys(fields);
      const userName = names.find(name => /roll|user.?id|username|student.?id|userid|enrol|^uid$/i.test(name))
        ?? names.find(name => !/pass|pwd|cap|rand|^f$|^fy$|^comp$/i.test(name));
      const passwordName = names.find(name => /pass(word)?|passwd|pwd/i.test(name));
      const capName = names.find(name => /^cap(tcha)?$/i.test(name)) ?? names.find(name => /security.?number|captcha/i.test(name)) ?? 'cap';
      if (!userName || !passwordName) throw new Error('Could not identify the IMS login fields.');
      const submission = new URLSearchParams(fields);
      submission.set(userName, body.roll.trim());
      submission.set(passwordName, body.password);
      submission.set(capName, body.captcha.trim());
      submission.set('login', 'Login');
      submission.set('logintype', 'student');
      const loginPage = await requestIms(session, session.loginAction, {
        method: session.loginMethod === 'get' ? 'GET' : 'POST',
        referer: session.loginUrl,
        body: submission,
      });
      const loginHtml = load(loginPage.html);
      const loginFormStillVisible = loginHtml('input[type=password]').length > 0;
      if (loginFormStillVisible) {
        const errorText = loginHtml('[role=alert], .error, .error-message, .errormsg, font[color=red]')
          .toArray().map(element => loginHtml(element).text().replace(/\s+/g, ' ').trim())
          .filter(text => text && !/to activate your login account,?\s*please click on generate new password/i.test(text))
          .join(' ');
        const message = loginFailureMessage(errorText);
        const response = NextResponse.json({ error: message }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
        response.cookies.set(IMS_COOKIE_NAME, '', { ...imsCookieOptions(), maxAge: 0 });
        return response;
      }

      session.studentRoll = body.roll.trim();
      // Authentication is complete. These form fields are no longer used, and
      // dropping them leaves room in the session cookie for the My Profile link.
      delete session.loginFields;
      delete session.loginAction;
      delete session.loginMethod;
      const profileText = pageText(loginPage.html);
      const pages = await navigateAfterLogin(session, { url: loginPage.url, html: loginPage.html });
      const controls = readControls(pages);
      if (!controls) throw new Error('Could not identify the academic-year and semester dropdowns returned by IMS.');
      const portalText = `${profileText}\n${pages.map(page => pageText(page.html)).join('\n')}`;
      const year = resolveYear(controls.academicYear.options, portalText);
      const semester = resolveSemester(controls.semester.options, portalText, body.roll);
      session.stage = 'attendance';
      // Fresh id across the authentication boundary (session-fixation defence).
      // The confirmation response below hands the new id back to the client.
      rotateImsSession(session);
      session.academicYearValue = year?.value;
      session.semesterValue = semester?.value;
      if (!year || !semester) {
        const missing = [!year && 'academic year', !semester && 'semester'].filter(Boolean).join(' and ');
        return confirmationResponse(
          session,
          controls,
          year,
          semester,
          `IMS did not identify the current ${missing} unambiguously. Confirm ${missing} using the options shown by the portal.`,
        );
      }
      return await submitAttendance(session, controls, year, semester);
    }

    // A session that logged in as one student must not be reused for another.
    if (session.studentRoll && body.roll && body.roll.trim().toUpperCase() !== session.studentRoll.toUpperCase()) {
      return NextResponse.json(
        { error: 'This sign-in session belongs to a different IMS account. Refresh the CAPTCHA and sign in again.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (!body.confirmChoices) return NextResponse.json({ error: 'Confirm the academic year and semester choices to continue.' }, { status: 400 });
    const pages = await loadAttendancePages(session);
    const controls = readControls(pages);
    if (!controls) throw new Error('The IMS academic-year and semester dropdowns are no longer available. Refresh the login session and try again.');
    const year = findOption(controls.academicYear, body.academicYear || session.academicYearValue || '');
    const semester = findOption(controls.semester, body.semester || session.semesterValue || '');
    if (!year || !semester) {
      return confirmationResponse(
        session,
        controls,
        year,
        semester,
        'Choose an academic year and semester from the options currently shown by NSUT IMS.',
      );
    }
    session.academicYearValue = year.value;
    session.semesterValue = semester.value;
    return await submitAttendance(session, controls, year, semester);
  } catch (error) {
    const safe = safeUpstreamError(error);
    const response = NextResponse.json({
      error: safe.message,
    }, { status: safe.status, headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(IMS_COOKIE_NAME, '', { ...imsCookieOptions(), maxAge: 0 });
    return response;
  }
}
