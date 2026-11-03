# NsutNest

Your campus, all in one place: NSUT attendance, results, notices and community.

A responsive Next.js leaderboard for NSUT B.Tech results, built from the 2022–23 to
2025–26 semester gazettes and CGPA tables. Search by name, roll number or branch; filter by batch year,
semester and one or more branches; open any student for a semester-by-semester
profile.

## Run locally

1. Install Node.js LTS.
2. Extract the ZIP and open the folder that contains `package.json` in VS Code.
3. In a terminal in that folder run `npm install`, then `npm run dev`.
4. Open http://localhost:3000.

`npm run dev` and `npm run build` both regenerate the browser payloads from
`data/students.json` first (see "Data files" below), so you never have to run that
step by hand. On Windows PowerShell use `npm.cmd install` / `npm.cmd run dev`.

## Features

- **Leaderboard** — one card per student, ranked by the university's total CGPA. Picking a
  semester changes the ranking to that semester's SGPA (and the card shows it). Cards load
  20 at a time with a "show more" button so a wide filter never floods the page.
- **Filters** — batch year, semester and multi-select branch. The year and branch lists
  are read from the dataset, so a new gazette cannot leave a filter pointing at a batch
  that does not exist.
- **Student profile** (`/student/<roll>`) — SGPA trend chart, semester summary, subject-wise
  marks with grades and credits, grade distribution, credit totals, and the university's
  total CGPA with overall and branch rank.
- **IMS notices** (`/notices`) - NSUT's notice board, read live from imsnsit.org, with a
  search box and a department filter.

## IMS notices

`/notices` lists NSUT's notices and circulars straight from
`imsnsit.org/imsnsit/notifications.php`, so the tab shows what the university has actually
published rather than a snapshot baked in at build time.

The board cannot simply be linked to:

- The page itself is read by a **route handler** (`app/api/notices`) instead of the browser,
  and held in memory for ten minutes, so a busy tab does not re-fetch it per visitor.
- Every notice points at an encrypted `plum_url.php?...` token, and the university serves
  that token **only when the request carries a `Referer` from its own notice page**. Opened
  from anywhere else it returns `Invalid operation` (no Referer) or `sorry` (a foreign one)
  *still as HTTP 200*, so a naive link appears to work but downloads a 21-byte text file.
  `app/api/notice-file` re-issues the request server-side with that Referer and streams the
  document back. It only ever proxies `imsnsit.org/imsnsit/plum_url.php`, so it cannot be
  pointed at an arbitrary host.
- Tokens are durable (one fetched earlier still resolves), so the cached list stays usable.

If the university changes the board's layout the parser finds no notices and `/api/notices`
answers 502 with an explanation, rather than rendering a quietly empty list.

## Data files

| File | Purpose |
| --- | --- |
| `data/students.json` | Readable source of truth: one object per record, including subject marks. |
| `public/data/students.json` | Generated: compact `[roll, name, branch, year, semester, sgpa, ay, cgpa]` rows the browser downloads for the list. |
| `public/data/subjects.json` | Generated: `roll → semester → [credits, credit points, marks]` plus a course-credit table, fetched only on a profile page. |
| `scripts/build-data.mjs` | Generates the two files above from `data/students.json`. |

The dataset is fetched at runtime rather than imported, so it stays out of the
JavaScript bundle: as an `import` it produced a 3.9 MB chunk that every visitor had to
download and parse before seeing anything. Each payload is cached separately by the
browser and reused across pages.

## Dataset and provenance

The portal publishes the **2022–2026 admission batches**. Backlog rows from older batches
that turn up in the gazettes are dropped, both in `data/students.json` and by the `BATCHES`
allowlist in `scripts/build-data.mjs`, so they can never reach the browser. Batch 2026 has
not sat an exam yet, so it currently contributes no records.

That is **43,182 records covering 8,805 students across semesters 1–8**, assembled from two
kinds of source:

| Source | Coverage | What it provides |
| --- | --- | --- |
| Subject-wise gazettes (transcribed from the PDFs) | Nov–Dec 2023, Apr–May 2024, Nov–Dec 2025 | SGPA, registered credits, credit points, subject-wise grades |
| Semester CGPA tables (`nsut_results_20xx_structured.json`) | 2022–2025 batches, every session | Semester SGPA and the cumulative **total CGPA** — no subject or credit breakdown |

The CGPA tables fill the sessions no gazette covered — Nov–Dec 2022, Apr–May 2023,
Nov–Dec 2024 and Apr–May 2025 — and they are the only source for the 2022 batch. They
also carry each student's cumulative **total CGPA**, which is shown on every leaderboard card
and at the top of the profile (8,315 of the 8,805 students have one; the rest are students the
university never gave a CGPA).

Each record stores the academic session it belongs to, because a semester can be sat more
than once: the 2023 batch sat semester 1 in Nov–Dec 2023, and the students who did not
clear it sat it again in Nov–Dec 2025. The profile shows the better attempt and labels the
session it came from.

What was checked when the gazettes were imported:

- The CGPA tables agree with the gazettes where the two overlap: the 2023 batch's semester-1
  SGPA matched the Nov–Dec 2023 gazette in 1,922 of 1,927 records, and the mismatches are
  re-sit students whose later attempt the gazette does not carry.
- Every record's SGPA equals its credit points ÷ registered credits, and every printed
  grade point matched the standard grade scale
  (O 10, A+ 9, A 8, B+ 7, B 6, C 5, D 4, F/FD 0).
- Every student name matches the gazette text, with no unmatched or blank names.
- Course credit weights are unambiguous: for every course, credit points ÷ grade points
  gives the same value in every row, which is how credits are shown for failed subjects.
- Names are read straight from the PDF: the student's name and the father's name are drawn
  as two separately positioned lines in the same cell, so the split between them is
  recovered exactly rather than guessed. Names were then checked against the 2025–26
  records of the same roll: of 3,891 comparisons, 3,887 agree and the four that differ
  cover three students — two are gazette wording ("YASH" where the earlier source has
  "Yash Bhola"; "RANAJAN" against "Ranjana") and one is the same name stored in a
  different case. Where a roll already had a name the earlier name is kept, so a student
  never appears under two spellings.

### Not included

Two Nov–Dec 2024 gazettes (semester 1 and semester 3) were supplied as scans of vector
outlines: every glyph is a bezier path and the files contain no text at all, so they
cannot be transcribed by text extraction. Those semesters are present as **SGPA only**,
taken from the university's CGPA tables — the subject-wise grades they would have carried
are not part of this dataset.

### Reading the numbers

- **SGPA is semester-specific and is not CGPA.**
- **`RL`** means the gazette printed no SGPA (result later). **SGPA 0.00** means the student
  did not clear any subject that semester — it is a real value, not a missing one.
- **Total CGPA** is printed by the university (the `total` column of the structured JSON), so
  it is not derived here. The leaderboard and both profile ranks use it; a student with no
  published CGPA is not ranked.
- Subject marks, credits and credit points still come only from the gazettes, so a semester
  imported as SGPA alone has no per-subject breakdown. Credits for a failed subject come from
  that course's credit weight.
- Ranks are best-effort: they compare a student only against the other students present in
  these gazettes.

## Validation note

The gazette transcription was automated and then cross-checked as described above, but it
has not been proofread against every page by hand. Verify individual records against the
original gazettes before relying on them. These files contain student academic information;
publish only if you have permission and it is appropriate to do so.

## Live IMS attendance (new)

The site now asks each visitor to sign in to their own NSUT IMS account and shows the
attendance data returned by IMS. The attendance panel no longer invents percentages from
result/SGPA data. CAPTCHA solving is manual: the backend displays the CAPTCHA from the
same temporary IMS browser session and the student types it in.

### Live IMS attendance

1. Run `npm install`.
2. Run `npm run dev` and open `http://localhost:3000`.

The `/api/ims/session` endpoint fetches the IMS login form and CAPTCHA using HTTP requests; it
does not launch a browser or require a Chromium installation. The `/api/ims/attendance`
endpoint submits the student-entered CAPTCHA and credentials, follows the IMS pages, and parses
the attendance tables. Short-lived IMS cookies and form state are kept in an HttpOnly,
three-minute browser cookie so the flow does not rely on a server process retaining memory.
The handler reads the academic-year and semester options from IMS and asks the student to
confirm them if the current period cannot be identified reliably. The IMS password is only
sent to the IMS login endpoint and is never written to logs. Parsed attendance is kept
in `localStorage` so the site stays signed in on that device across restarts — one CAPTCHA per
sync instead of one per visit — and is cleared by logging out. The dashboard labels a snapshot
"Live IMS" for six hours after a sync and "Saved attendance" afterwards, and the account banner
offers **Sync again**, which refreshes the data without discarding the saved snapshot; the
attendance panel's **Refresh from IMS** does the same. Both go through `/api/ims/refresh`,
which first reuses the authenticated IMS cookies and only asks for a new CAPTCHA when IMS has
dropped that session — a saved snapshot therefore refreshes without a fresh login. When the ID
and password are saved on the device, the refresh card asks for the CAPTCHA alone and submits
the saved pair behind it; without them it asks for the full sign-in. The refresh also stops
reading IMS pages as soon as the attendance dropdowns are on screen, so a click resolves in a
few portal requests instead of walking every frame from the login flow. Because the
saved payload contains personal attendance, it is device- and browser-profile-local and is not
sent to the server; signing out removes it from both `localStorage` and `sessionStorage`.
Cached attendance without a student roll is treated as unidentified and requires a fresh
sign-in before it can be shown alongside that student's published results.
The sign-in form can remember the IMS ID on the current device using local browser storage.
One unticked checkbox, **Remember my IMS ID and password on this device**, stores both in
`localStorage` (`nsutnest_ims_roll`, `nsutnest_ims_password`) as plain text, so the next sign-in
needs only the CAPTCHA. Ticking it saves whatever is in the fields, later edits follow, and
unticking or logging out erases both. Because any script on this origin can read them, it should
not be used on a shared or college machine; the browser's own password manager remains the safer
option.
#### Can students sign in with only ID and password?

Not today. Checked in October 2026: `imsnsit.org` publishes no API, no partner
integration and no documented automated-verification mechanism, and the only public
integrations that skip the CAPTCHA are third-party scrapers, which are not authorisation.
NsutNest therefore keeps the human-read CAPTCHA and does not solve, bypass or outsource it.

The login form renders from a server flag (`captchaRequired` in the
`/api/ims/session` response, always `true` today) rather than assuming a CAPTCHA forever:
if IMS ever issues an authorised token or API key, the backend can exchange it and flip that
flag, and the form collapses to just ID and password without any other UI change.

#### Sign-in security

- The short-lived IMS session lives in an HttpOnly, `SameSite=Strict`, Secure-in-production
  cookie scoped to `/api/ims`; the browser only ever receives a random session id and the
  CAPTCHA image, never the portal cookies.
- A request body is bound to the cookie's session id (`sessionMatchesId`), and the id is
  rotated when the flow crosses the login boundary (`rotateImsSession`), which closes the
  session-fixation gap and stops one session being reused for another roll.
- Login attempts are rate limited per client IP (12 per 5 minutes on attendance, 20 per
  minute on CAPTCHA issuance) with a `Retry-After` header. On Vercel each serverless instance
  keeps its own counters, so this blunts bursts and retry loops rather than enforcing a global
  quota; a shared store would be needed for that.
- A refresh that cannot reuse its session always answers `401` with `needsLogin: true`, so the
  button can never dead-end: the UI re-authenticates with a CAPTCHA instead of silently
  swallowing the failure. A changed academic year or semester answers with the picker instead
  of forcing a new login.
- Authentication responses are `Cache-Control: no-store`, and upstream failures are mapped to
  short, actionable messages by `lib/ims-auth-errors.ts` so portal status codes, HTML and stack
  traces never reach the browser. Credentials, CAPTCHA text and cookies are not logged.- Passwords are not persisted by default. A failed attempt keeps the typed ID and password in
  React state so the student only re-enters the new CAPTCHA, and logging out clears both. The
  opt-in **Remember my IMS ID and password on this device** checkbox stores them in
  `localStorage` in plain text (see above); without it, every refresh asks for both.

#### Print Profile

**Print Profile** on `/profile` prints IMS's own *Print Profile* form, not this dashboard. IMS
only serves that link inside the signed-in session, so `/api/ims/profile/print` loads the page
(clicking the portal's own Print Profile link), inlines the photograph and returns the HTML,
which is rendered in an off-screen same-origin iframe and printed from there. The app page is
never printed — the old fallback that called `window.print()` on the dashboard has been removed.

When the IMS session is still alive the printout opens with no prompt at all. When it has
lapsed the route answers `401` with `needsLogin: true`, the shared sign-in card opens — CAPTCHA
only if the ID and password are saved on the device, the full form otherwise — and the print
retries by itself as soon as the new session lands, guarded so a refused print cannot loop.

Offline checks: `npm run check:ims` covers the session cookie, id binding and rotation, cookie
flags, rate limiting and the error copy; `npm run check:attendance` covers parsing and the
calendar.

The dashboard opens date-wise attendance in a month calendar when a subject is selected;
present and absent days use distinct colors, while non-attendance portal codes remain neutral.
Published result data is matched to the signed-in roll number rather than displaying an
unrelated student's record.

**Deployment note:** the IMS routes require a Node.js runtime with outbound HTTPS access to
`www.imsnsit.org`; they do not require Playwright or a persistent browser worker. IMS pages
and form behavior can change, so verify the flow against the live portal after deployment.


## Placement data

The Training & Placement page currently shows official T&P links and contact details, with a **Coming soon** panel in place of the dataset browser. The 602-entry source file now lives at `data/placements.json` (outside `public/`, so it is not downloadable) and can be moved back to `public/data/` when the dataset is ready to publish.

## Installable PWA (Progressive Web App)

NSUT Nest now includes the basic PWA files needed to install the deployed site on supported phones and desktops:

- `public/manifest.webmanifest` defines the app name, standalone display mode, colors, and icons.
- `public/sw.js` registers a service worker and caches only selected static assets plus the offline fallback.
- `public/offline.html` is shown when a page navigation cannot reach the server.
- `app/install-pwa.tsx` registers the service worker and provides an Install app control with Android/iPhone instructions.
- `public/icons/` contains the app icons generated from the existing NSUT Nest logo.

### Deploy and install

1. Commit/push these changes and deploy the project to your existing HTTPS hosting provider (for example, Vercel). Keep the existing environment variables and server/API routes unchanged.
2. Open the deployed site in Chrome on Android or a supported desktop browser. Use **Install app** when prompted, or the browser menu's **Install app / Add to Home screen** option.
3. On iPhone, open the HTTPS site in Safari, tap **Share**, then **Add to Home Screen**.
4. After deployment, check `/manifest.webmanifest`, `/sw.js`, and `/offline.html` on the deployed domain.

### Offline and data safety notes

The PWA can be installed, but it is not a full offline copy of the site. Results, notices, community pages, live IMS attendance, CAPTCHA/login requests, and API data still need the deployed server/internet connection. The service worker intentionally does **not** cache HTML page responses, `/api/*`, or `/data/*` to avoid retaining personalized or live data in its cache. The offline fallback is informational only. Do not remove these cache exclusions without reviewing the privacy implications.

The install control appears only as a native install prompt when the browser supports that prompt; on iOS and some browsers it opens the relevant manual installation steps.
