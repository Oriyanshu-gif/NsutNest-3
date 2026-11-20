import { load } from 'cheerio';
import {
  IMS_BASE_URL,
  findLink,
  pageText,
  readImsFrames,
  requestIms,
  requestImsImage,
  type ImsHttpPage,
  type ImsHttpSession,
} from './ims-http';
import { detectImageMimeType } from './ims-profile';

export type AdmitCardPaper = { code: string; name: string };

export type AdmitCard = {
  title: string;
  html: string;
  papers: AdmitCardPaper[];
  generatedAt: string | null;
};

const EXAM_TYPE = 'END SEM';
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 4_000_000;

/** The tokenised My Activities link is session state; it cannot be constructed. */
async function activitiesUrl(session: ImsHttpSession): Promise<string> {
  if (session.activitiesUrl) return session.activitiesUrl;
  const pages = await readImsFrames(session, `${IMS_BASE_URL}student.htm`, undefined, 24);
  const link = findLink(pages, /^My Activities$/i);
  if (!link) throw new Error('The IMS My Activities link is not available in this session. Sync your attendance and try again.');
  session.activitiesUrl = link.url;
  return link.url;
}

async function admitCardPage(session: ImsHttpSession): Promise<ImsHttpPage> {
  const activities = await requestIms(session, await activitiesUrl(session), { referer: IMS_BASE_URL });
  let link = findLink([activities], /^Examination Admit Card$/i);
  if (!link) {
    const pages = await readImsFrames(session, activities.url, IMS_BASE_URL, 16, activities);
    link = findLink(pages, /^Examination Admit Card$/i);
  }
  if (!link) throw new Error('The IMS Examination Admit Card link is not available in this session. Sync your attendance and try again.');
  return requestIms(session, link.url, { referer: link.page.url });
}

function looksLikeCard(page: ImsHttpPage) {
  const text = pageText(page.html);
  return /ADMIT CARD/i.test(text) && /Paper Code/i.test(text);
}

/**
 * The admit card form's fields. IMS leaves its selects outside the <form> element,
 * so the controls are collected from the whole page instead of a form subtree.
 */
function admitCardForm(page: ImsHttpPage) {
  const $ = load(page.html);
  const fields = new URLSearchParams();
  $('input[name], select[name], textarea[name]').each((_, element) => {
    const name = $(element).attr('name');
    if (!name) return;
    const tag = element.tagName.toLowerCase();
    const type = ($(element).attr('type') ?? '').toLowerCase();
    if (tag === 'input' && ['submit', 'button', 'reset', 'image', 'file', 'checkbox', 'radio'].includes(type)) return;
    if (tag === 'select') {
      const selected = $(element).find('option:selected').first();
      const option = selected.length ? selected : $(element).find('option').first();
      fields.append(name, option.attr('value') ?? '');
      return;
    }
    fields.append(name, $(element).attr('value') ?? '');
  });
  if (!['admYear', 'examtype', 'password'].some(key => fields.has(key))) return null;
  // Exactly one action button: IMS re-renders the page when both arrive.
  const buttons = $('input[type=submit][name], button[type=submit][name]')
    .toArray()
    .map(element => ({ name: $(element).attr('name')!, value: $(element).attr('value') ?? '' }));
  const primary = buttons.find(button => /get admit card|generate|print/i.test(button.value))
    ?? buttons.find(button => !/^submit$/i.test(button.name))
    ?? buttons[0];
  if (primary) fields.set(primary.name, primary.value);
  return { action: $('form').attr('action') || page.url, fields, page };
}

/**
 * IMS hands out the admit card over a few submits of one form: the chosen year
 * and semester, then the same form with the password. Submitting until the card
 * appears keeps every step in one place instead of hard-coding them.
 */
async function submitUntilCard(session: ImsHttpSession, start: ImsHttpPage, choice: { year: string; semester: string; password: string }) {
  let page = start;
  for (let step = 0; step < 5; step++) {
    // IMS answers with framesets, so the card and its form can sit one level down.
    const pages = await readImsFrames(session, page.url, page.url, 8, page);
    const card = pages.find(looksLikeCard);
    if (card) return card;
    const form = pages.reduce<ReturnType<typeof admitCardForm>>((found, candidate) => found ?? admitCardForm(candidate), null);
    if (!form) break;
    const fields = form.fields;
    fields.set('admYear', choice.year);
    fields.set('admSem', choice.semester);
    fields.set('examtype', EXAM_TYPE);
    if (pages.some(candidate => /type=["']?password/i.test(candidate.html))) fields.set('password', choice.password);
    page = await requestIms(session, form.action, { method: 'POST', referer: form.page.url, body: fields });
  }
  // Still a password box after every submit means IMS refused the password.
  if (/type=["']?password/i.test(page.html)) {
    throw new Error('IMS did not accept the IMS password, so the admit card could not be generated.');
  }
  if (/available for the period/i.test(pageText(page.html))) {
    throw new Error('IMS has closed the admit card window for this semester. Nothing to print right now.');
  }
  throw new Error('IMS did not return the admit card. The portal may still be preparing it — try again in a few minutes.');
}

function parsePapers(html: string): AdmitCardPaper[] {
  const $ = load(html);
  const papers: AdmitCardPaper[] = [];
  const seen = new Set<string>();
  $('tr').each((_, row) => {
    const cells = $(row).find('td').toArray().map(cell => $(cell).text().replace(/\s+/g, ' ').trim());
    const index = cells.findIndex(cell => /^[A-Z]{2,5}\d{3,5}$/.test(cell));
    if (index < 0 || !cells[index + 1] || seen.has(cells[index])) return;
    // The page repeats the paper list (screen copy plus print copy), so dedupe.
    seen.add(cells[index]);
    papers.push({ code: cells[index], name: cells[index + 1] });
  });
  return papers;
}

/** IMS serves the photograph and signature from the session, so a browser cannot. */
async function inlineImages(session: ImsHttpSession, html: string, pageUrl: string) {
  const $ = load(html);
  for (const element of $('img[src]').toArray().slice(0, MAX_IMAGES)) {
    const src = $(element).attr('src');
    if (!src || /^data:/i.test(src)) continue;
    try {
      const image = await requestImsImage(session, src, pageUrl);
      if (!image.bytes.length || image.bytes.length > MAX_IMAGE_BYTES) continue;
      const type = detectImageMimeType(image.bytes);
      if (!type) continue;
      $(element).attr('src', `data:${type};base64,${image.bytes.toString('base64')}`);
    } catch {
      // A missing photograph must not stop the admit card from loading.
    }
  }
  if (!$('base').length) $('head').prepend(`<base href="${pageUrl}">`);
  return $.html();
}

export async function generateAdmitCard(
  session: ImsHttpSession,
  password: string,
  choice: { year: string; semester: string },
): Promise<AdmitCard> {
  if (!choice.year || !choice.semester) {
    throw new Error('IMS did not record the current academic year and semester. Sync your attendance first.');
  }
  const page = await submitUntilCard(session, await admitCardPage(session), { ...choice, password });
  const text = pageText(page.html);
  const title = /END SEM(?:ESTER)? EXAMINATION[^A-Z]*(?:[A-Z]{3}\s*[-–]\s*[A-Z]{3}\s*\d{4})?/i.exec(text)?.[0]?.trim()
    ?? 'End Semester Examination';
  const generatedAt = /Generated on\s*([^ ]+\s+[\d:]+)/i.exec(text)?.[1] ?? null;
  return {
    title,
    html: await inlineImages(session, page.html, page.url),
    papers: parsePapers(page.html),
    generatedAt,
  };
}
