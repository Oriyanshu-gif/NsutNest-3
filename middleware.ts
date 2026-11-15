import { NextResponse, type NextRequest } from "next/server";

/**
 * The bundled Android app serves its pages from https://localhost, so its API
 * calls are cross-origin. The website itself is same-origin and ignores these
 * headers.
 */
const APP_ORIGIN = "https://localhost";

export const config = { matcher: "/api/:path*" };

export function middleware(request: NextRequest) {
  const cors = {
    "Access-Control-Allow-Origin": APP_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
  };

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: cors });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
  return response;
}
