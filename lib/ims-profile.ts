import { load } from 'cheerio';
import {
  findLink,
  IMS_BASE_URL,
  readImsFrames,
  requestIms,
  requestImsImage,
  type ImsHttpPage,
  type ImsHttpSession,
} from './ims-http';

/**
 * Reads the student's NSUT IMS My Profile page with the session established by
 * the attendance login.
 *
 * The portal renders My Profile as a table: a `plum_fieldbig` photo row followed
 * by rows of `<th>label</th><td>value</td>`. The View tab then opens the same
 * student's read-only form. Only the summary labels are surfaced; the read-only
 * form also contains bank, Aadhaar and parent details that NSUT NEST must not
 * copy into the browser or a printout.
 */

export type ImsProfileField = { label: string; value: string };

export type ImsProfilePayload = {
  studentId: string;
  name: string;
  roll: string;
  /** `data:image/...` copy of the IMS photograph, or null when unavailable. */
  photo: string | null;
  fields: ImsProfileField[];
  fetchedAt: string;
};

export type ParsedProfile = { fields: ImsProfileField[]; photoSrc: string | null };

/** The order the fields are printed on the IMS summary. Unknown labels follow. */
const PREFERRED_LABELS: RegExp[] = [
  /^(student id|roll no|roll number|enrollment no|enrolment no|university roll no)$/,
  /^(student name|name)$/,
  /^(dob|date of birth)$/,
  /^(gender|sex)$/,
  /^(category)$/,
  /^(admission|admission year|year of admission|date of admission)$/,
  /^(branch name|branch|department|dept)$/,
  /^(degree|programme|program)$/,
  /^(ft pt|full time|part time|full time part time)$/,
  /^(specialization|specialisation)$/,
  /^(section)$/,
];

const PROFILE_LINK = /^(?:my\s+)?(?:student\s+)?profile$/i;
const TAB_NAMES = /^(student profile|view|update profile|upload signature|print profile)$/;

const STUDENT_ID_LABELS = [
  'student id', 'roll no', 'roll number', 'enrollment no', 'enrolment no', 'university roll no',
];

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

/**
 * IMS serves the photograph as a JPEG labelled `text/html`, so the declared
 * content type cannot be trusted. Identify the real format from the bytes.
 */
export function detectImageMimeType(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  const head = bytes.subarray(0, 6).toString('latin1');
  if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/** Raised when IMS answers with its login form instead of the requested page. */
export class ImsSessionExpiredError extends Error {
  constructor() {
    super('The IMS session has expired.');
    this.name = 'ImsSessionExpiredError';
  }
}

function clean(value: string) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Normalised comparison key: `FT/PT` and `FT / PT` both become `ft pt`. */
function labelKey(label: string) {
  return clean(label).replace(/[:*]+$/, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

function preferredIndex(key: string) {
  const index = PREFERRED_LABELS.findIndex(pattern => pattern.test(key));
  return index === -1 ? PREFERRED_LABELS.length : index;
}

function sortFields(fields: ImsProfileField[]) {
  // Array#sort is stable, so fields sharing a rank keep the portal's order.
  return [...fields].sort((a, b) => preferredIndex(labelKey(a.label)) - preferredIndex(labelKey(b.label)));
}

function fieldValue(fields: ImsProfileField[], keys: string[]) {
  for (const key of keys) {
    const match = fields.find(field => labelKey(field.label) === key);
    if (match?.value) return match.value;
  }
  return '';
}

export function isImsLoginPage(html: string) {
  return /<input[^>]+type\s*=\s*["']?password/i.test(html)
    || /Please\s+Login/i.test(html) && /Security\s+No/i.test(html);
}

/**
 * Score candidate images so the larger, round student photograph wins over the
 * small logo, help and theme icons that share the page. Non-photo UI images are
 * rejected outright.
 */
function profileImageSource(src: string, className: string, alt: string, width: string, height: string) {
  const meta = `${src} ${className} ${alt}`;
  if (!src || /^(?:data|javascript):/i.test(src)) return null;
  if (/logo|icon|spacer|pixel|banner|theme_grey|transparent|help|home|refresh|arrow|bullet/i.test(meta)) return null;
  const w = Number(width.replace(/[^\d.]/g, ''));
  const h = Number(height.replace(/[^\d.]/g, ''));
  let score = 0;
  if (/(^|\s)round(\s|$)/i.test(className)) score += 4;
  if (w >= 80 && h >= 80) score += 3;
  if (/photo|profile|student/i.test(src)) score += 2;
  return score > 0 ? score : null;
}

/**
 * Parses label/value rows and the photograph.
 *
 * Two shapes are accepted because the summary and the View form differ:
 *   - summary: `<th>Student ID</th><td>2025UME4077</td>`
 *   - View:    `<td></td><td>Student ID</td><td>2025UME4077</td><td></td>`
 * The first/last spacer cells of the View form are why the label starts at the
 * second non-empty cell rather than always at index 0.
 */
function parseProfileRows(html: string, requestedOnly: boolean): ParsedProfile {
  const $ = load(html);
  $('script, style, noscript').remove();

  const fields: ImsProfileField[] = [];
  const seen = new Set<string>();
  let photoSrc: string | null = null;
  let photoScore = -1;

  $('tr').each((_, row) => {
    const $row = $(row);

    $row.find('img').each((__, image) => {
      const element = $(image);
      const src = (element.attr('src') ?? '').trim();
      const score = profileImageSource(
        src,
        element.attr('class') ?? '',
        element.attr('alt') ?? '',
        element.attr('width') ?? '',
        element.attr('height') ?? '',
      );
      if (score !== null && score > photoScore) {
        photoScore = score;
        photoSrc = src;
      }
    });

    const cells = $row.children('th, td').toArray();
    if (cells.length < 2) return;
    const text = cells.map(cell => clean($(cell).text()));

    let label = '';
    let value = '';
    if (cells.length === 2) {
      label = text[0];
      value = text[1];
    } else {
      // Read-only View form: spacer cell, label, value, spacer cell.
      const offset = text[0] === '' ? 1 : 0;
      label = text[offset] ?? '';
      value = text[offset + 1] ?? '';
    }

    if (!label || !value) return;
    const key = labelKey(label);
    if (!key || key.length > 80 || value.length > 500) return;
    if (TAB_NAMES.test(key)) return;
    if (requestedOnly && preferredIndex(key) >= PREFERRED_LABELS.length) return;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({ label, value });
  });

  return { fields: sortFields(fields), photoSrc };
}

/** Summary shown by the My Profile landing page. */
export function parseProfileSummary(html: string): ParsedProfile {
  return parseProfileRows(html, false);
}

/** Read-only View form. Only requested labels are kept, never bank/Aadhaar data. */
export function parseProfileView(html: string): ParsedProfile {
  return parseProfileRows(html, true);
}

export function mergeProfileFields(summary: ImsProfileField[], view: ImsProfileField[]) {
  const merged = [...summary];
  // The two pages call the same field "Student Name" and "Name". Dedupe by the
  // preferred-field rank so that alias cannot appear twice in the profile.
  const ranks = new Set(merged.map(field => preferredIndex(labelKey(field.label))));
  for (const field of view) {
    const key = labelKey(field.label);
    if (merged.some(existing => labelKey(existing.label) === key)) continue;
    const rank = preferredIndex(key);
    if (rank < PREFERRED_LABELS.length && ranks.has(rank)) continue;
    merged.push(field);
    ranks.add(rank);
  }
  return sortFields(merged);
}

/** Finds the View tab inside the My Profile table header. */
export function findProfileViewUrl(html: string, pageUrl: string): string | null {
  const $ = load(html);
  let href: string | null = null;
  $('tr.plum_head a, a.plum_button').each((_, anchor) => {
    if (href) return;
    if (clean($(anchor).text()).toLowerCase() !== 'view') return;
    const candidate = $(anchor).attr('href');
    if (candidate && !/^javascript:/i.test(candidate)) href = candidate;
  });
  if (!href) return null;
  try {
    return new URL(href, pageUrl).href;
  } catch {
    return null;
  }
}

function profileLinkFromPages(pages: ImsHttpPage[]): string | null {
  try {
    return findLink(pages, PROFILE_LINK)?.url ?? null;
  } catch {
    // A malformed/external link must not break the whole profile page.
    return null;
  }
}

/**
 * Returns the My Profile URL captured at login, or rediscovers it from the
 * attendance frames. Sessions created before this feature have no stored link,
 * so the fallback walks My Activities as a browser would.
 */
export async function discoverProfileUrl(
  session: ImsHttpSession,
  pages: ImsHttpPage[] = [],
): Promise<string | null> {
  if (session.profileUrl) return session.profileUrl;

  const direct = profileLinkFromPages(pages);
  if (direct) {
    session.profileUrl = direct;
    return direct;
  }

  for (const url of session.navigationUrls ?? []) {
    try {
      const loaded = await readImsFrames(session, url, IMS_BASE_URL, 20);
      if (loaded.some(page => isImsLoginPage(page.html))) throw new ImsSessionExpiredError();

      const found = profileLinkFromPages(loaded);
      if (found) {
        session.profileUrl = found;
        return found;
      }

      const activities = findLink(loaded, /^My Activities$/i);
      if (!activities) continue;
      const activityPages = await readImsFrames(session, activities.url, activities.page.url, 20);
      if (activityPages.some(page => isImsLoginPage(page.html))) throw new ImsSessionExpiredError();
      const deeper = profileLinkFromPages(activityPages);
      if (deeper) {
        session.profileUrl = deeper;
        return deeper;
      }
    } catch (error) {
      if (error instanceof ImsSessionExpiredError) throw error;
      // One stale/extra attendance frame should not hide the profile link.
    }
  }
  return null;
}

async function readProfilePhoto(session: ImsHttpSession, path: string, referer: string): Promise<string | null> {
  try {
    const image = await requestImsImage(session, path, referer);
    if (!image.bytes.length || image.bytes.length > 4_000_000) return null;
    const declared = image.contentType.split(';')[0].trim().toLowerCase();
    const contentType = detectImageMimeType(image.bytes)
      ?? (ALLOWED_IMAGE_TYPES.has(declared) ? declared : null);
    // An HTML login/error page must never be embedded as if it were a photo.
    if (!contentType) return null;
    return `data:${contentType};base64,${image.bytes.toString('base64')}`;
  } catch {
    // A missing photograph must not stop the profile from opening.
    return null;
  }
}

/**
 * Opens My Profile with the existing IMS cookies, follows the View tab and
 * returns the 11 summary fields plus the photograph. The photo is proxied as a
 * data URL so the browser never needs (and never receives) the IMS cookies.
 */
export async function fetchImsProfile(
  session: ImsHttpSession,
  profileUrl: string,
): Promise<ImsProfilePayload> {
  const page = await requestIms(session, profileUrl, { referer: IMS_BASE_URL });
  if (isImsLoginPage(page.html)) throw new ImsSessionExpiredError();

  const summary = parseProfileSummary(page.html);

  let view: ParsedProfile | null = null;
  const viewUrl = findProfileViewUrl(page.html, page.url);
  if (viewUrl && viewUrl !== page.url) {
    try {
      const viewPage = await requestIms(session, viewUrl, { referer: page.url });
      if (isImsLoginPage(viewPage.html)) throw new ImsSessionExpiredError();
      view = parseProfileView(viewPage.html);
    } catch (error) {
      if (error instanceof ImsSessionExpiredError) throw error;
      // The summary already carries everything requested; View is a refinement.
    }
  }

  const fields = mergeProfileFields(summary.fields, view?.fields ?? []);
  if (!fields.length) {
    throw new Error('The IMS My Profile page did not contain student details. The portal layout may have changed.');
  }

  const studentId = fieldValue(fields, STUDENT_ID_LABELS) || session.studentRoll || '';
  const name = fieldValue(fields, ['student name', 'name']);
  const photoSrc = summary.photoSrc ?? view?.photoSrc ?? null;
  const photo = photoSrc ? await readProfilePhoto(session, photoSrc, page.url) : null;

  return {
    studentId,
    name,
    roll: session.studentRoll || studentId,
    photo,
    fields,
    fetchedAt: new Date().toISOString(),
  };
}
