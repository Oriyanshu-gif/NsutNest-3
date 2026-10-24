import { NextRequest, NextResponse } from 'next/server';
import { load } from 'cheerio';
import { subjectCodesFromTables, subjectNamesFromPages } from '../../../../lib/ims-attendance-html';
import { parseAttendance } from '../../../../lib/ims-attendance-parse';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SelectOption = { value: string; label: string; rawValue: string };
type SelectControl = { index: number; name: string; meta: string; options: SelectOption[] };
type AttendanceControls = { page: ImsHttpPage; academicYear: SelectControl; semester: SelectControl };

function academicYearKey(text: string): string | null {
  const match = text.match(/\b(20\d{2})\s*[-/–]\s*(20\d{2}|\d{2})\b/);
  if (!match) return null;
  const start = Number(match[1]);
  let end = Number(match[2]);
  if (match[2].length === 2) end += Math.floor(start / 100) * 100;
  if (end < start) end += 100;
  return `${start}-${end}`;
}

function semesterNumber(text: string): string | null {
  const match = text.trim().match(/^(?:(?:semester|sem\.?)\s*)?([1-8])(?:st|nd|rd|th)?(?:\s*(?:semester|sem\.?))?$/i);
  return match?.[1] ?? null;
}

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

function readControls(pages: ImsHttpPage[]): AttendanceControls | null {
  for (const page of pages) {
    const $ = load(page.html);
    const selects = $('select').toArray().map((element, index) => {
      const select = $(element);
      const id = select.attr('id') ?? '';
      const name = select.attr('name') ?? '';
      const labelText = id ? $(`label[for="${id.replace(/"/g, '\\"')}"]`).text() : '';
      const meta = `${id} ${name} ${select.attr('aria-label') ?? ''} ${labelText}`.replace(/\s+/g, ' ').trim();
      const options = select.find('option:not(:disabled)').toArray()
        .map(option => {
          const item = $(option);
          const label = item.text().replace(/\s+/g, ' ').trim();
          const rawValue = item.attr('value') ?? '';
          return { value: rawValue || label, rawValue, label };
        })
        .filter(option => option.label && !/^(?:select|choose|please select)\b|^--+|^all$/i.test(option.label));
      return { index, name, meta, options };
    });
    const explicitYear = selects.filter(select => /academic.?year|academic.?session|\bay\b|year|session/i.test(select.meta));
    const explicitSemester = selects.filter(select => /semester|\bsem\b|sem(?:ester)?(?:id|no|value|code)/i.test(select.meta));
    const yearShaped = selects.filter(select => select.options.some(option => academicYearKey(option.label) || academicYearKey(option.value)));
    const semesterShaped = selects.filter(select => select.options.length > 0 && select.options.every(option => semesterNumber(option.label) || semesterNumber(option.value)));
    const year = explicitYear.length === 1 ? explicitYear[0] : explicitYear.length === 0 && yearShaped.length === 1 ? yearShaped[0] : null;
    const semester = explicitSemester.length === 1 ? explicitSemester[0] : explicitSemester.length === 0 && semesterShaped.length === 1 ? semesterShaped[0] : null;
    if (year && semester && year.index !== semester.index) return { page, academicYear: year, semester };
  }
  return null;
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

function clean(value: string) { return value.replace(/\s+/g, ' ').trim(); }

/**
 * Login attempts are the expensive, abuse-prone part of the flow: each one drives
 * a real portal login. A short window stops credential-stuffing bursts while
 * still leaving room for a mistyped CAPTCHA or password.
 */
const LOGIN_LIMIT = { limit: 12, windowMs: 5 * 60_000 };

async function loadAttendancePages(session: ImsHttpSession) {
  if (!session.navigationUrls?.length) throw new Error('The IMS attendance session is missing. Refresh the CAPTCHA and try again.');
  const pages: ImsHttpPage[] = [];
  for (const url of session.navigationUrls) {
    const loaded = await readImsFrames(session, url);
    for (const page of loaded) if (!pages.some(existing => existing.url === page.url)) pages.push(page);
  }
  return pages;
}

function findOption(control: SelectControl, value: string) {
  return control.options.find(option => option.value === value || option.rawValue === value || option.label === value) ?? null;
}

function resultTables(pages: ImsHttpPage[]) {
  for (const page of pages) {
    const $ = load(page.html);
    const tables = $('table').toArray().map(table => $(table).find('tr').toArray().map(row => $(row).find('th, td').toArray().map(cell => $(cell).text().replace(/\u00a0/g, ' ').trim())));
    if (tables.some(table => table.some(row => clean(row[0] ?? '').toLowerCase() === 'days'))) return tables;
  }
  return [];
}

async function submitAttendance(
  session: ImsHttpSession,
  controls: AttendanceControls,
  year: SelectOption,
  semester: SelectOption,
) {
  const $ = load(controls.page.html);
  const yearElement = $('select').eq(controls.academicYear.index);
  const form = yearElement.closest('form');
  if (!form.length) throw new Error('The IMS attendance dropdowns are not inside a form that can be submitted.');
  const fields = new URLSearchParams();
  form.find('input, select, textarea').each((_, element) => {
    const item = $(element);
    const name = item.attr('name');
    if (!name || item.is(':disabled')) return;
    if (element.tagName.toLowerCase() === 'select') {
      const selected = name === controls.academicYear.name ? year : name === controls.semester.name ? semester : null;
      const option = selected
        ? selected
        : (() => {
            const selectedOption = item.find('option:selected').first();
            const fallback = selectedOption.length ? selectedOption : item.find('option').first();
            const label = fallback.text().trim();
            const value = fallback.attr('value') ?? '';
            return { value: value || label, rawValue: value, label };
          })();
      fields.append(name, option.rawValue || option.value);
      return;
    }
    const type = (item.attr('type') ?? '').toLowerCase();
    if (['button', 'reset', 'image', 'file', 'checkbox', 'radio'].includes(type)) return;
    if (type === 'submit') return;
    fields.append(name, item.val()?.toString() ?? '');
  });
  const submit = form.find('input[type=submit], input[type=button], button[type=submit], button:not([type])').first();
  const submitName = submit.attr('name');
  if (submitName) fields.append(submitName, submit.attr('value') ?? submit.text().trim());
  const action = new URL(form.attr('action') || controls.page.url, controls.page.url).href;
  const method = (form.attr('method') ?? 'get').toLowerCase();
  const page = await requestIms(session, action, {
    method: method === 'post' ? 'POST' : 'GET',
    referer: controls.page.url,
    body: fields,
  });
  const pages = await readImsFrames(session, page.url, controls.page.url);
  const resultPages = [{ url: page.url, html: page.html }, ...pages];
  const tables = resultTables(resultPages);
  if (!tables.length) throw new Error('The IMS response did not contain attendance tables. The portal may require browser-side form logic or its layout may have changed.');
  const subjectCodes = subjectCodesFromTables(tables);
  const pageNames = subjectNamesFromPages(resultPages, tables, subjectCodes);
  const result = parseAttendance(tables, year.label, session.studentRoll, pageNames);
  if (!result.subjects.length || !result.subjects.some(subject => subject.held > 0 || subject.percent > 0)) {
    throw new Error('IMS opened, but no cumulative attendance rows could be parsed. The portal table layout may have changed.');
  }
  const response = NextResponse.json({
    ...result,
    academicYear: year.label,
    selectedSemester: semester.label,
  }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(IMS_COOKIE_NAME, '', { ...imsCookieOptions(), maxAge: 0 });
  return response;
}

async function navigateAfterLogin(session: ImsHttpSession, loginResponse: ImsHttpPage) {
  let pages = await readImsFrames(session, loginResponse.url);
  const activities = findLink(pages, /^My Activities$/i);
  if (!activities) throw new Error('Login succeeded, but the IMS My Activities link was not found in its returned pages.');
  const activitiesPage = await requestIms(session, activities.url, { referer: activities.page.url });
  pages = await readImsFrames(session, activitiesPage.url, activities.page.url);
  const attendance = findLink(pages, /^My Attendance$/i);
  if (!attendance) throw new Error('The IMS attendance link is not available after opening My Activities.');
  const attendancePage = await requestIms(session, attendance.url, { referer: attendance.page.url });
  pages = await readImsFrames(session, attendancePage.url, attendance.page.url);
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
