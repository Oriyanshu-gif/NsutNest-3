/**
 * Origin for the server API. Empty on the web so calls stay same-origin; the
 * bundled Android build sets NEXT_PUBLIC_API_BASE because its pages are served
 * from https://localhost, where a relative /api call would 404.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
