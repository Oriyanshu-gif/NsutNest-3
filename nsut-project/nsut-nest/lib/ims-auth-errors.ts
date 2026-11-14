/**
 * User-facing messages for the IMS sign-in flow.
 *
 * Everything here is written for a student to act on. Upstream detail (HTTP
 * status codes, stack traces, HTML from the portal) stays on the server: those
 * messages are neither useful nor safe to hand to the browser.
 */

/** Maps the message IMS prints on a failed login to a next step for the student. */
export function loginFailureMessage(portalMessage: string): string {
  if (/(?:account|login).{0,40}(?:not activated|needs? activation|activation required)|activation required/i.test(portalMessage)) {
    return 'Your account may need activation. Use “Generate New Password” on the official IMS portal.';
  }
  if (/invalid\s+(?:security\s+number|captcha)|(?:captcha|security\s+number).{0,30}(?:invalid|incorrect|wrong|does not match)/i.test(portalMessage)) {
    return 'The CAPTCHA did not match. Enter the refreshed image and try again.';
  }
  if (/password.{0,30}(?:does not match|doesn.t match|incorrect|invalid)|(?:invalid|incorrect).{0,20}(?:password|user\s*id)|login failed/i.test(portalMessage)) {
    return 'Sign-in failed. Check your IMS ID and password, then try again.';
  }
  return 'Sign-in failed. Check your ID, password and CAPTCHA, then try again.';
}

export type SafeUpstreamError = { message: string; status: number };

/**
 * Converts anything thrown by the IMS plumbing into a short message and status.
 * Never include the original text: it can contain portal HTML, status codes or
 * internal route names.
 */
export function safeUpstreamError(
  error: unknown,
  fallback = 'Could not load attendance right now. Please try again.',
): SafeUpstreamError {
  const text = error instanceof Error ? error.message : '';

  if (/timed out|timeout|aborted|AbortError/i.test(text)) {
    return { message: 'IMS did not respond in time. Check your connection and try again.', status: 504 };
  }
  // A refused or dropped connection means the portal is unreachable from this
  // server. That is neither the student's typing nor a portal layout change, so
  // it gets its own message instead of "something went wrong".
  if (/fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network|getaddrinfo|ENETUNREACH/i.test(text)) {
    return { message: 'NSUT IMS could not be reached from the server. Try again in a few minutes.', status: 503 };
  }
  // Checked before the expiry rule: these also tell the reader to refresh, but
  // they are portal-shape problems, not a dead session.
  if (/unexpected link|invalid redirect|redirected too many times|returned an unexpected/i.test(text)) {
    return { message: 'The IMS portal returned an unexpected response. Refresh the CAPTCHA and try again.', status: 502 };
  }
  if (/session (?:has )?expired|session is missing|captcha session expired/i.test(text)) {
    return { message: 'Your CAPTCHA session expired. Refresh the CAPTCHA and try again.', status: 400 };
  }
  if (/HTTP 5\d\d|returned HTTP/i.test(text)) {
    return { message: 'The IMS portal is not responding normally. Try again in a moment.', status: 502 };
  }
  if (/CAPTCHA image|CAPTCHA/i.test(text)) {
    return { message: 'The IMS CAPTCHA could not be loaded. Press Refresh to try again.', status: 502 };
  }
  return { message: fallback, status: 502 };
}
