import { apiUrl } from "./api-base";

const TOKEN_KEY = "nsutnest_ims_token";
const TOKEN_HEADER = "x-ims-session";

/**
 * fetch for the IMS routes. On the web the session lives in an HttpOnly cookie
 * and this changes nothing; in the bundled app the cookie is cross-site and
 * never sent, so the server's token header is kept on the device and echoed
 * back instead. The token is the same value the cookie holds.
 */
export async function imsFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);
  if (token) headers.set(TOKEN_HEADER, token);

  const response = await fetch(apiUrl(path), { ...init, headers });
  const next = response.headers.get(TOKEN_HEADER);
  if (next !== null && typeof window !== "undefined") {
    // An empty header means the server dropped the session (expired or signed out).
    if (next) window.localStorage.setItem(TOKEN_KEY, next);
    else window.localStorage.removeItem(TOKEN_KEY);
  }
  return response;
}

/** Signing out must not leave a reusable token on the device. */
export function forgetImsToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem(TOKEN_KEY);
}
