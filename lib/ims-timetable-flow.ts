import {
  findLink,
  IMS_BASE_URL,
  readImsFrames,
  requestIms,
  type ImsHttpPage,
  type ImsHttpSession,
} from './ims-http';
import { ImsSessionExpiredError, isImsLoginPage } from './ims-profile';
import { parseImsTimetable, type TimetablePayload } from './ims-timetable';

/**
 * Follows the same path a browser takes after login:
 *   student.htm → banner My Activities → TIME TABLE → My Timetable.
 *
 * The links are tokenised and cannot be constructed, so discovery is part of
 * the fetch. The attendance login already has the authenticated IMS cookies;
 * this module only adds the timetable hop and never handles credentials.
 */

function ensureSignedIn(pages: ImsHttpPage[]) {
  if (pages.some(page => isImsLoginPage(page.html))) throw new ImsSessionExpiredError();
}

export async function fetchImsTimetable(session: ImsHttpSession): Promise<TimetablePayload> {
  if (!session.navigationUrls?.length || !session.studentRoll) {
    throw new ImsSessionExpiredError();
  }

  // The tokenised My Activities URL is captured at login. The bare frameset
  // cannot be used later: IMS only renders the authenticated menu for that
  // token, not for student.htm.
  let activitiesPage: ImsHttpPage | null = null;
  if (session.activitiesUrl) {
    const page = await requestIms(session, session.activitiesUrl, { referer: IMS_BASE_URL });
    if (isImsLoginPage(page.html)) throw new ImsSessionExpiredError();
    activitiesPage = { url: page.url, html: page.html };
  }

  if (!activitiesPage) {
    throw new Error('Sign in to IMS again to reconnect the timetable link.');
  }

  let timetable = findLink([activitiesPage], /^My Timetable$/i);
  if (!timetable) {
    const pages = await readImsFrames(session, activitiesPage.url, activitiesPage.url, 24, activitiesPage);
    ensureSignedIn(pages);
    timetable = findLink(pages, /^My Timetable$/i);
  }

  if (!timetable) {
    throw new Error('The IMS My Timetable link was not found under My Activities.');
  }

  const timetablePage = await requestIms(session, timetable.url, { referer: timetable.page.url });
  if (isImsLoginPage(timetablePage.html)) throw new ImsSessionExpiredError();

  return {
    ...parseImsTimetable(timetablePage.html),
    roll: session.studentRoll,
    fetchedAt: new Date().toISOString(),
  };
}
