/**
 * Offline checks for the IMS sign-in backend. Nothing here touches the portal, so
 * `npm run check:ims` is safe to run anywhere.
 *
 * Covered: the encoded-session cookie (round trip, rejection, size cap), the
 * binding between a request body and its cookie, id rotation across the login
 * boundary, cookie flags, fixed-window rate limiting, and the user-facing error
 * copy for failed logins and upstream failures.
 */

import assert from 'node:assert/strict';
import {
  encodeImsSession,
  IMS_COOKIE_NAME,
  IMS_SESSION_SECONDS,
  imsCookieOptions,
  readImsSession,
  rotateImsSession,
  sessionMatchesId,
  type ImsHttpSession,
} from '../lib/ims-http';
import { loginFailureMessage, safeUpstreamError } from '../lib/ims-auth-errors';
import { rateLimit } from '../lib/rate-limit';

function baseSession(): ImsHttpSession {
  return {
    id: 'session-1',
    cookies: { JSESSIONID: 'abc' },
    stage: 'login',
    loginUrl: 'https://www.imsnsit.org/imsnsit/student_login.php',
  };
}

// --- Session cookie: round trip -------------------------------------------
const session = baseSession();
const decoded = readImsSession(encodeImsSession(session));
assert.ok(decoded, 'a session round-trips through the cookie value');
assert.equal(decoded?.id, 'session-1', 'session id survives encoding');
assert.equal(decoded?.cookies.JSESSIONID, 'abc', 'portal cookies survive encoding');
assert.equal(decoded?.stage, 'login', 'stage survives encoding');

// --- Session cookie: rejection --------------------------------------------
assert.equal(readImsSession(undefined), null, 'no cookie means no session');
assert.equal(readImsSession('not-a-session'), null, 'garbage is rejected, not thrown');
assert.equal(
  readImsSession(Buffer.from('{"id":"x"}').toString('base64url')),
  null,
  'a payload missing required fields is rejected',
);
assert.equal(
  readImsSession(Buffer.from(JSON.stringify({ ...baseSession(), stage: 'admin' })).toString('base64url')),
  null,
  'an unknown stage is rejected',
);

// --- Session cookie: size cap ---------------------------------------------
assert.throws(
  () => encodeImsSession({ ...baseSession(), loginFields: { blob: 'x'.repeat(4000) } }),
  /too large/i,
  'an oversized session is refused rather than truncated',
);

// --- Body/cookie binding --------------------------------------------------
assert.equal(sessionMatchesId(session, 'session-1'), true, 'matching ids are accepted');
assert.equal(sessionMatchesId(session, 'session-2'), false, 'another session id is refused');
assert.equal(sessionMatchesId(session, undefined), false, 'a missing session id is refused');
assert.equal(sessionMatchesId(null, 'session-1'), false, 'a missing cookie is refused');

// --- Session fixation: rotation across login ------------------------------
const beforeRotation = session.id;
rotateImsSession(session);
assert.notEqual(session.id, beforeRotation, 'the id changes at the login boundary');
assert.equal(sessionMatchesId(session, beforeRotation), false, 'the pre-login id stops working');
assert.equal(session.cookies.JSESSIONID, 'abc', 'rotation keeps the portal cookies');
assert.equal(session.stage, 'login', 'rotation leaves the rest of the session alone');

// --- Cookie flags ---------------------------------------------------------
const options = imsCookieOptions();
assert.equal(options.httpOnly, true, 'the session cookie is HttpOnly');
assert.equal(options.sameSite, 'strict', 'the session cookie is SameSite=Strict');
assert.equal(options.path, '/api/ims', 'the cookie is scoped to the IMS routes');
assert.equal(options.maxAge, IMS_SESSION_SECONDS, 'the cookie expires with the session');
assert.equal(options.secure, process.env.NODE_ENV === 'production', 'Secure follows the deployment');
assert.equal(IMS_COOKIE_NAME, 'nsutnest_ims', 'the cookie name is unchanged');


// --- Rate limiting --------------------------------------------------------
const store = new Map();
const window = { limit: 3, windowMs: 60_000, now: 1_000 };
assert.equal(rateLimit('ip-a', window, store).allowed, true, 'first request is allowed');
assert.equal(rateLimit('ip-a', { ...window, now: 2_000 }, store).allowed, true, 'second is allowed');
assert.equal(rateLimit('ip-a', { ...window, now: 3_000 }, store).allowed, true, 'third is allowed');
const blocked = rateLimit('ip-a', { ...window, now: 4_000 }, store);
assert.equal(blocked.allowed, false, 'the fourth request in the window is blocked');
assert.ok(blocked.retryAfterSeconds > 0, 'a blocked request reports when to retry');
assert.equal(
  rateLimit('ip-b', { ...window, now: 4_000 }, store).allowed,
  true,
  'one client cannot use up another client’s allowance',
);
assert.equal(
  rateLimit('ip-a', { ...window, now: 61_001 }, store).allowed,
  true,
  'the window resets once it has passed',
);

// --- Login failure copy ---------------------------------------------------
assert.match(loginFailureMessage('Invalid Security Number'), /CAPTCHA/, 'a wrong CAPTCHA is named');
assert.match(loginFailureMessage('Password does not match'), /IMS ID and password/, 'bad credentials are named');
assert.match(loginFailureMessage('Your login account is not activated'), /activation/i, 'activation is explained');
assert.match(
  loginFailureMessage('something the portal printed'),
  /Check your ID, password and CAPTCHA/,
  'an unrecognised failure still gives a next step',
);

// --- Upstream failure copy (no internals leaked) ---------------------------
const timeout = safeUpstreamError(new Error('The operation was aborted due to timeout'));
assert.equal(timeout.status, 504, 'a timeout is a gateway timeout');
assert.doesNotMatch(timeout.message, /abort|timeout/i, 'a timeout message hides the internals');

const down = safeUpstreamError(new Error('The IMS portal returned HTTP 503.'));
assert.equal(down.status, 502, 'an upstream 5xx is a bad gateway');
assert.doesNotMatch(down.message, /HTTP|503/, 'an upstream status code is not shown');

const expired = safeUpstreamError(new Error('The IMS attendance session is missing. Refresh the CAPTCHA and try again.'));
assert.equal(expired.status, 400, 'a dead session is a client-side retry');
assert.match(expired.message, /expired/i, 'a dead session says so');

const shaped = safeUpstreamError(new Error('The IMS portal returned an unexpected link. Refresh the CAPTCHA and try again.'));
assert.equal(shaped.status, 502, 'a changed portal response is an upstream problem');

const unreachable = safeUpstreamError(new TypeError('fetch failed'));
assert.equal(unreachable.status, 503, 'a dropped connection is reported as unavailable');
assert.match(unreachable.message, /IMS/, 'the message names what could not be reached');
assert.doesNotMatch(unreachable.message, /fetch|ECONN|socket/i, 'connection internals stay on the server');

const unknown = safeUpstreamError(new Error('TypeError: cannot read properties of undefined'));
assert.equal(unknown.status, 502, 'an unexpected error is a bad gateway');
assert.doesNotMatch(unknown.message, /TypeError|undefined/i, 'an unexpected error leaks no detail');
assert.equal(safeUpstreamError('a string').status, 502, 'non-Error throwables are handled');

console.log('All IMS auth checks passed.');
