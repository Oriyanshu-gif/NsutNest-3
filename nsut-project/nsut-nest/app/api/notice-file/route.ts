/**
 * Streams one IMS notice document.
 *
 * imsnsit.org serves its notice files only to requests that carry a Referer from
 * its own notice page, and refuses every direct link otherwise. So notices link
 * here, and this route repeats the request server-side with that Referer in place.
 */
import { NextResponse } from "next/server";
import { IMS_ATTACH_PREFIX, IMS_NOTICES_URL, USER_AGENT } from "../../../lib/notices";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("u");

  // Only the university's own notice endpoint is ever proxied, so this cannot be
  // pointed at an arbitrary host.
  if (!url || !url.startsWith(IMS_ATTACH_PREFIX)) {
    return NextResponse.json({ error: "Missing or unknown notice reference." }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { referer: IMS_NOTICES_URL, "user-agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `The IMS server answered HTTP ${res.status}.` }, { status: 502 });
    }

    const body = Buffer.from(await res.arrayBuffer());

    // A refused request still comes back HTTP 200 with a sentence instead of a file
    // ("Invalid operation" without a Referer, "sorry" from a foreign one).
    const isRefusal =
      body.length < 256 && /^[\x20-\x7e\s]*$/.test(body.toString("latin1"));
    if (isRefusal) {
      return NextResponse.json(
        { error: "The IMS server did not serve this notice. It may have expired - open it on imsnsit.org instead." },
        { status: 502 },
      );
    }

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/octet-stream",
        "content-disposition": 'inline; filename="ims-notice"',
        // A token never changes, and a given document is immutable.
        "cache-control": "public, max-age=604800, immutable",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not reach the IMS server: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
