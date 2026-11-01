import { randomUUID } from 'node:crypto';
import { load } from 'cheerio';

export const IMS_BASE_URL = 'https://www.imsnsit.org/imsnsit/';
export const IMS_COOKIE_NAME = 'nsutnest_ims';
export const IMS_SESSION_SECONDS = 180;

export type ImsHttpSession = {
  id: string;
  cookies: Record<string, string>;
  stage: 'login' | 'attendance';
  loginUrl: string;
  loginAction?: string;
  loginMethod?: 'get' | 'post';
  loginFields?: Record<string, string>;
  navigationUrls?: string[];
  /** Authenticated My Profile link, captured at login for the profile route. */
  profileUrl?: string;
  studentRoll?: string;
  academicYearValue?: string;
  semesterValue?: string;
};

export type ImsHttpPage = { url: string; html: string };

function decodeCookie(value: string): ImsHttpSession | null {
  try {
    const session = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as ImsHttpSession;
    if (!session.id || !session.cookies || !session.loginUrl || !['login', 'attendance'].includes(session.stage)) return null;
    return session;
  } catch {
    return null;
  }
}

export function readImsSession(value?: string): ImsHttpSession | null {
  return value ? decodeCookie(value) : null;
}

export function encodeImsSession(session: ImsHttpSession): string {
  const value = Buffer.from(JSON.stringify(session)).toString('base64url');
  if (value.length > 3500) throw new Error('The temporary IMS session is too large to store safely. Refresh the CAPTCHA and try again.');
  return value;
}

/**
 * Ties a request body to the IMS session in the HttpOnly cookie. The session id
 * is random, so a body carrying someone else's id cannot drive this session.
 */
export function sessionMatchesId(session: ImsHttpSession | null, sessionId?: string): session is ImsHttpSession {
  return Boolean(session && sessionId && session.id === sessionId);
}

/**
 * Reissues the session id when the flow gains privilege (login succeeded).
 * Fixed session identifiers across an authentication boundary are what session
 * fixation attacks rely on; rotating on the transition removes that gap. The new
 * id is what the next response hands back, and the cookie is re-signed with it.
 */
export function rotateImsSession(session: ImsHttpSession): ImsHttpSession {
  session.id = randomUUID();
  return session;
}

export function imsCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/api/ims',
    maxAge: 12 * 60 * 60,
  };
}

function cookieHeaders(headers: Headers) {
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  if (extended.getSetCookie) return extended.getSetCookie();
  const value = headers.get('set-cookie');
  return value ? value.split(/,(?=\s*[^;,=\s]+=)/) : [];
}

function captureCookies(headers: Headers, cookies: Record<string, string>) {
  for (const header of cookieHeaders(headers)) {
    const pair = header.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) cookies[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
  }
}

function cookieHeader(cookies: Record<string, string>) {
  return Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ');
}

function safeImsUrl(value: string, base: string): URL {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' || !/(^|\.)imsnsit\.org$/i.test(url.hostname)) {
    throw new Error('The IMS portal returned an unexpected link. Refresh the CAPTCHA and try again.');
  }
  return url;
}

/**
 * A refused or dropped connection is usually momentary. One quick retry saves the
 * student from re-reading a CAPTCHA that never appeared; the second failure is
 * reported normally so an outage is not retried in a loop.
 */
async function fetchWithRetry(url: URL, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code ?? '';
    // A refused connection, a reset or a DNS hiccup is momentary and worth one
    // more try. A connect timeout means the host is unreachable, where a second
    // attempt only doubles how long the student waits for the CAPTCHA.
    if (!/ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH/i.test(code)) throw error;
    await new Promise(resolve => setTimeout(resolve, 400));
    return await fetch(url, init);
  }
}

export async function requestIms(
  session: ImsHttpSession,
  path: string,
  options: { method?: 'GET' | 'POST'; referer?: string; body?: URLSearchParams } = {},
): Promise<{ url: string; html: string; contentType: string }> {
  let url = safeImsUrl(path, options.referer ?? IMS_BASE_URL);
  let method = options.method ?? 'GET';
  let body = options.body;
  if (method === 'GET' && body) {
    body.forEach((value, key) => url.searchParams.append(key, value));
    body = undefined;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const headers = new Headers({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      Referer: options.referer ?? IMS_BASE_URL,
      Cookie: cookieHeader(session.cookies),
    });
    if (body) headers.set('Content-Type', 'application/x-www-form-urlencoded');
    const response = await fetchWithRetry(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(25000),
    });
    captureCookies(response.headers, session.cookies);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('The IMS portal returned an invalid redirect.');
      url = safeImsUrl(location, url.href);
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }
    if (!response.ok) throw new Error(`The IMS portal returned HTTP ${response.status}.`);
    return { url: url.href, html: await response.text(), contentType: response.headers.get('content-type') ?? '' };
  }
  throw new Error('The IMS portal redirected too many times.');
}

export async function requestImsImage(
  session: ImsHttpSession,
  path: string,
  referer: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  let url = safeImsUrl(path, referer);
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        Referer: referer,
        Cookie: cookieHeader(session.cookies),
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(25000),
    });
    captureCookies(response.headers, session.cookies);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('The IMS portal returned an invalid CAPTCHA redirect.');
      url = safeImsUrl(location, url.href);
      continue;
    }
    if (!response.ok) throw new Error(`The IMS CAPTCHA returned HTTP ${response.status}.`);
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'image/jpeg',
    };
  }
  throw new Error('The IMS CAPTCHA redirected too many times.');
}

export async function readImsFrames(
  session: ImsHttpSession,
  url: string,
  referer = IMS_BASE_URL,
  maxPages = 24,
): Promise<ImsHttpPage[]> {
  const pages: ImsHttpPage[] = [];
  const queued = [{ url, referer }];
  const visited = new Set<string>();
  while (queued.length && pages.length < maxPages) {
    const next = queued.shift()!;
    const page = await requestIms(session, next.url, { referer: next.referer });
    if (visited.has(page.url)) continue;
    visited.add(page.url);
    pages.push({ url: page.url, html: page.html });
    const $ = load(page.html);
    $('frame[src], iframe[src]').each((_, element) => {
      const src = $(element).attr('src');
      if (!src || /^javascript:/i.test(src)) return;
      try {
        const frameUrl = safeImsUrl(src, page.url).href;
        if (!visited.has(frameUrl)) queued.push({ url: frameUrl, referer: page.url });
      } catch {
        // Frames hosted outside IMS are unrelated to the authenticated portal flow.
      }
    });
  }
  return pages;
}

export function pageText(html: string) {
  const $ = load(html);
  $('script, style, noscript').remove();
  return $.root().text().replace(/\s+/g, ' ').trim();
}

export function pageForms(html: string) {
  const $ = load(html);
  return $('form').toArray().map(form => {
    const fields = new URLSearchParams();
    $(form).find('input, select, textarea').each((_, element) => {
      const name = $(element).attr('name');
      if (!name || $(element).is(':disabled')) return;
      const tag = element.tagName.toLowerCase();
      const type = ($(element).attr('type') ?? '').toLowerCase();
      if (tag === 'input' && ['button', 'reset', 'image', 'file', 'checkbox', 'radio'].includes(type)) return;
      if (tag === 'input' && ['submit', 'button'].includes(type)) return;
      if (tag === 'select') {
        const selected = $(element).find('option:selected').first();
        const option = selected.length ? selected : $(element).find('option').first();
        fields.append(name, option.attr('value') ?? option.text().trim());
        return;
      }
      fields.append(name, $(element).val()?.toString() ?? '');
    });
    return { action: $(form).attr('action') ?? '', method: ($(form).attr('method') ?? 'get').toLowerCase(), fields, html: $.html(form) };
  });
}

export function findLink(pages: ImsHttpPage[], pattern: RegExp): { url: string; page: ImsHttpPage } | null {
  for (const page of pages) {
    const $ = load(page.html);
    let found: string | null = null;
    $('a').each((_, anchor) => {
      if (found) return;
      const text = $(anchor).text().replace(/\s+/g, ' ').trim();
      if (!pattern.test(text)) return;
      const href = $(anchor).attr('href');
      if (href && !/^javascript:/i.test(href)) found = href;
    });
    if (found) return { url: safeImsUrl(found, page.url).href, page };
  }
  return null;
}
