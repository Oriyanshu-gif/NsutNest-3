import { NextRequest, NextResponse } from 'next/server';
import { load } from 'cheerio';
import { subjectCodesFromTables, subjectNamesFromPages } from './ims-attendance-html';
import { parseAttendance } from './ims-attendance-parse';
import {
  encodeImsSession,
  IMS_COOKIE_NAME,
  imsCookieOptions,
  readImsFrames,
  readImsSession,
  requestIms,
  type ImsHttpPage,
  type ImsHttpSession,
} from './ims-http';
import { safeUpstreamError } from './ims-auth-errors';

/**
 * The attendance submission flow and the cookie-only refresh handler.
 *
 * These live outside `app/api/.../route.ts` because Next.js only permits HTTP
 * method exports in a route file; the refresh route reuses this code.
 */

export type SelectOption = { value: string; label: string; rawValue: string };
export type SelectControl = { index: number; name: string; meta: string; options: SelectOption[] };
export type AttendanceControls = { page: ImsHttpPage; academicYear: SelectControl; semester: SelectControl };

export function academicYearKey(text: string): string | null {
  const match = text.match(/\b(20\d{2})\s*[-/–]\s*(20\d{2}|\d{2})\b/);
  if (!match) return null;
  const start = Number(match[1]);
  let end = Number(match[2]);
  if (match[2].length === 2) end += Math.floor(start / 100) * 100;
  if (end < start) end += 100;
  return `${start}-${end}`;
}

export function semesterNumber(text: string): string | null {
  const match = text.trim().match(/^(?:(?:semester|sem\.?)\s*)?([1-8])(?:st|nd|rd|th)?(?:\s*(?:semester|sem\.?))?$/i);
  return match?.[1] ?? null;
}

export function readControls(pages: ImsHttpPage[]): AttendanceControls | null {
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

/**
 * Collects the pages that carry the attendance dropdowns.
 *
 * `navigationUrls` holds every page and frame reached during login, so loading
 * all of them walks dozens of portal responses for nothing. The attendance form
 * is normally in the first URL's frames, so stop as soon as the controls are on
 * screen — that keeps a refresh to a couple of requests instead of a batch that
 * outlives the serverless timeout and looks like a dead button to the student.
 */
export async function loadAttendancePages(session: ImsHttpSession, maxPages = 12) {
  if (!session.navigationUrls?.length) throw new Error('The IMS attendance session is missing. Refresh the CAPTCHA and try again.');
  const pages: ImsHttpPage[] = [];
  for (const url of session.navigationUrls) {
    const loaded = await readImsFrames(session, url, undefined, maxPages);
    for (const page of loaded) if (!pages.some(existing => existing.url === page.url)) pages.push(page);
    if (readControls(pages)) break;
    // IMS answers an expired session with its login page; nothing further in the
    // queue can produce attendance tables, so report it straight away.
    if (pages.some(page => /<input[^>]+type=["']?password/i.test(page.html))) break;
  }
  return pages;
}

/** True when IMS replaced a page with its own login form (upstream session gone). */
export function looksSignedOut(pages: ImsHttpPage[]) {
  return pages.some(page => /<input[^>]+type=["']?password/i.test(page.html));
}

/**
 * Asks the browser to pick the academic year and semester itself.
 *
 * Used both after a fresh login and when a cached refresh finds the portal on a
 * different period, so the student confirms a pair instead of signing in again.
 */
export function confirmationResponse(
  session: ImsHttpSession,
  controls: AttendanceControls,
  academicYear: SelectOption | null,
  semester: SelectOption | null,
  message: string,
) {
  const response = NextResponse.json({
    needsConfirmation: true,
    sessionId: session.id,
    academicYearOptions: controls.academicYear.options.map(({ value, label }) => ({ value, label })),
    semesterOptions: controls.semester.options.map(({ value, label }) => ({ value, label })),
    suggested: { academicYear: academicYear?.value ?? '', semester: semester?.value ?? '' },
    required: { academicYear: !academicYear, semester: !semester },
    message,
  }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(IMS_COOKIE_NAME, encodeImsSession(session), imsCookieOptions());
  return response;
}

export function findOption(control: SelectControl, value: string) {
  return control.options.find(option => option.value === value || option.rawValue === value || option.label === value) ?? null;
}

function clean(value: string) { return value.replace(/\s+/g, ' ').trim(); }

function resultTables(pages: ImsHttpPage[]) {
  for (const page of pages) {
    const $ = load(page.html);
    const tables = $('table').toArray().map(table => $(table).find('tr').toArray().map(row => $(row).find('th, td').toArray().map(cell => $(cell).text().replace(/\u00a0/g, ' ').trim())));
    if (tables.some(table => table.some(row => clean(row[0] ?? '').toLowerCase() === 'days'))) return tables;
  }
  return [];
}

export async function submitAttendance(
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
  response.cookies.set(IMS_COOKIE_NAME, encodeImsSession(session), imsCookieOptions());
  return response;
}

/** Reuse the IMS authenticated cookies; no password or CAPTCHA on a valid session. */
export async function refreshImsAttendance(request: NextRequest) {
  const session = readImsSession(request.cookies.get(IMS_COOKIE_NAME)?.value);
  if (!session || session.stage !== 'attendance' || !session.studentRoll || !session.navigationUrls?.length) {
    // Not an error the student caused: the saved session is simply gone, so the
    // client only has to offer the CAPTCHA. `needsLogin` is what drives that.
    return NextResponse.json(
      { error: 'Your IMS session ended. Enter the CAPTCHA to refresh attendance.', needsLogin: true },
      { status: 401 },
    );
  }
  try {
    const pages = await loadAttendancePages(session);
    // IMS answers an expired session with its login form.
    if (looksSignedOut(pages)) {
      const response = NextResponse.json({ error: 'Your IMS session expired.', needsLogin: true }, { status: 401 });
      response.cookies.set(IMS_COOKIE_NAME, '', { ...imsCookieOptions(), maxAge: 0 });
      return response;
    }
    const controls = readControls(pages);
    if (!controls) {
      // No dropdowns means this cached session cannot be driven any further, so
      // the client is told to start a fresh sign-in rather than left with a
      // button that silently does nothing.
      const response = NextResponse.json({ error: 'The saved IMS session can no longer be used.', needsLogin: true }, { status: 401 });
      response.cookies.set(IMS_COOKIE_NAME, '', { ...imsCookieOptions(), maxAge: 0 });
      return response;
    }
    const year = findOption(controls.academicYear, session.academicYearValue || '');
    const semester = findOption(controls.semester, session.semesterValue || '');
    if (!year || !semester) {
      // The portal moved to a new academic year or semester: offer the choices
      // instead of forcing a whole new login.
      return confirmationResponse(session, controls, year, semester, 'IMS reports a different attendance period. Confirm the academic year and semester.');
    }
    return await submitAttendance(session, controls, year, semester);
  } catch (error) {
    const safe = safeUpstreamError(error);
    return NextResponse.json({ error: safe.message, needsLogin: true }, { status: 401 });
  }
}
