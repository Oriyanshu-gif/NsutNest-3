/**
 * Parses NSUT `pdftotext -layout` gazette exports and merges them into
 * data/students.json — the readable dataset that scripts/build-data.mjs turns
 * into the compact payloads the browser fetches.
 *
 * Usage:  node scripts/parse-gazette.mjs [--dry-run] /tmp/gaz/a.txt /tmp/gaz/b.txt
 *
 * Two layout facts shape this parser (checked against the real exports):
 *  - The "TOT CR / TOT CRP / SGPA" cluster printed on a student row often
 *    belongs to a NEIGHBOURING student: pdftotext interleaves the wrapped
 *    summary numbers across rows. The grades under the student's own roll are
 *    reliable, so the SGPA is recomputed from them (cp = gp × credits) and the
 *    printed SGPA is kept only to cross-check, never trusted.
 *  - The line directly under a student row carries that student's per-subject
 *    credits (the cluster of small numbers after the father's name); the crash
 *    of one missing element falls back to nothing and the record is marked.
 *
 * Merge policy: key (roll, semester, academic-year). Append cells that are new;
 * replace an existing cell only when the stored SGPA disagrees — this repairs
 * even-sem rows that were previously sourced from the (mis-printed) CGPA tables.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dryRun = process.argv.includes("--dry-run");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!files.length) {
  console.error("usage: node scripts/parse-gazette.mjs [--dry-run] <txt files...>");
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const datasetPath = join(root, "data/students.json");
const records = JSON.parse(await readFile(datasetPath, "utf8"));

const isRoll = (t) => /^\d{4}[A-Z]{2,4}\d{3,4}$/.test(t);
/** any gazette course code: letters then digits, e.g. BTBTC401, FCCH0103, VAPD0101 */
const isSubjectCode = (t) => /^[A-Z]{2,7}\d{3,5}$/.test(t);
const isGrade = (t) => t === "A+" || t === "B+" || /^[OABCD]$/.test(t) || t === "F0" || t === "FD" || t === "RL" || t === "F";
const FAIL = new Set(["F0", "FD", "RL", "F"]);

function titleCase(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 1 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");
}

/** "NOV - DEC - 2023" → { examPeriod: "Nov–Dec 2023", ay: 2023 }. */
function examPeriodOf(header) {
  const m = header.match(/([A-Z]{3})[^A-Za-z0-9]+([A-Z]{3})[^A-Za-z0-9]+(\d{4})/);
  if (!m) return null;
  const periods = { NOV: "Nov–Dec", DEC: "Nov–Dec", APR: "Apr–May", MAY: "Apr–May", JUN: "Jun–Jul", JUL: "Jun–Jul" };
  const period = periods[m[1].toUpperCase()] || `${m[1]}–${m[2]}`;
  const year = Number(m[3]);
  return { examPeriod: `${period} ${year}`, ay: /NOV|DEC|JUL/i.test(m[1]) ? year : year - 1 };
}

/**
 * College: grade token forms — "C  5  20" spaced, "A8" merged, "F0  0*" fail.
 * Returns { code, grade, gp, cp|null, cpWritten|null }.
 */
function readSubject(chunk) {
  if (!chunk.length) return null;
  const tokens = [...chunk];
  let grade = tokens[0];
  const digitVals = tokens.map((t) => ({ raw: t, v: Number(t.replace("*", "")) })).filter((t) => /^\d{1,3}\*?$/.test(t.raw));
  let gp = null;
  let cp = null; // cp is now derived later as gp * credits for every grade
  if (FAIL.has(grade)) {
    gp = 0; // failed / RL rows earn zero credit points
  } else {
    const merged = !isGrade(grade) ? grade.match(/^([OABCD])(\d)$/) : null;
    if (merged) {
      grade = merged[1];
      gp = Number(merged[2]);
    } else if (isGrade(grade)) {
      if (digitVals.length && digitVals[0].v <= 10) gp = digitVals[0].v;
    } else {
      return null; // junk: not a grade-shaped chunk
    }
  }
  return { grade, gp, cp };
}

/** Students, subjects and the credits line — per gazette file. */
function parseFile(text) {
  const lines = text.split(/\r?\n/);
  let semester = null;
  let meta = null;
  const students = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/B\.Tech\. - Semester: (\d+) .*? examination held in (.{10,120})/);
    if (h) {
      semester = Number(h[1]);
      meta = examPeriodOf(h[2]);
      continue;
    }
    if (semester === null || !meta) continue;

    const row = line.match(/^\s*(?:Sl\s*)?\d{1,4}\s+(\d{4}[A-Z]{2,4}\d{3,4})(\s+.*)$/);
    if (!row) {
      const last = students.length ? students[students.length - 1] : null;
      if (last && last.waitingCreditLine === 1) {
        // The line right under the row: father's name + per-subject credits.
        // Consume it once — later drift lines ("24 RL") must not overwrite it.
        const fatherNamed = /^[A-Z]{2,}/.test(line.trim());
        const hasRoll = line.trim().split(/\s+/).some(isRoll);
        if (fatherNamed && !hasRoll) {
          const small = (line.match(/\d+/g) ?? []).map(Number).filter((v) => v <= 6);
          last.creditCounts = small;
          last.waitingCreditLine = 2; // consumed
        }
      }
      continue;
    }
    if (students.length) students[students.length - 1].waitingCreditLine = 0;
    const roll = row[1];
    const rest = row[2].trim();
    const tokens = rest.split(/\s+/);

    // name = caps words before the first subject code
    let nameEnd = 0;
    for (let t = 0; t < tokens.length; t++) {
      if (isSubjectCode(tokens[t])) break;
      if (t < 12 && !isSubjectCode(tokens[t])) nameEnd = t + 1;
    }
    const name = titleCase(tokens.slice(0, nameEnd).join(" "));

    // subjects: cut the rest at every subject code and read grade/gp/cp per chunk
    const subjects = [];
    for (let t = 0; t < tokens.length; t++) {
      if (!isSubjectCode(tokens[t])) continue;
      const next = tokens.findIndex((v, j) => j > t && isSubjectCode(v));
      const chunk = tokens.slice(t + 1, next === -1 ? tokens.length : next);
      const parsed = readSubject(chunk);
      if (parsed) subjects.push({ code: tokens[t], ...parsed });
      t = next === -1 ? tokens.length - 1 : next - 1;
    }

    // the printed "SGPA CS" tail; only floating-point values with a CS column are
    // reliable-enough candidates (any "int int" tail is a drifted CR/CRP pair)
    let printedSgpa = null;
    const tail = rest.match(/(\d\.\d\d)\s+\d{1,3}(?:\.\d)?\s*$/);
    if (tail) printedSgpa = Number(tail[1]);

    students.push({ name, roll, semester, meta, subjects, printedSgpa, waitingCreditLine: 1, creditCounts: null });
  }
  return students.filter((s) => s.roll);
}

// -------------------------------------------------------------- aggregate
/** students keyed roll|semester|ay */
const all = new Map();
for (const f of files) {
  for (const s of parseFile(await readFile(f, "utf8"))) {
    const key = `${s.roll}|${s.semester}|${s.meta.ay}`;
    all.set(key, s);
  }
}

// course credits: majority-learned from this run's father lines, then fall
// back to the credits already published in the app (code → credits)
let courseCredits = {};
try {
  ({ courseCredits } = JSON.parse(await readFile(join(root, "public/data/subjects.json"), "utf8")));
} catch { /* optional */ }

const creditsByCode = new Map();
for (const s of all.values()) {
  const n = s.subjects.length;
  if (!s.creditCounts || s.creditCounts.length < n) continue;
  s.subjects.forEach((sub, i) => {
    const cr = s.creditCounts[i];
    if (cr > 0) creditsByCode.set(sub.code, cr);
  });
}
console.log(`father-line credits learned for ${creditsByCode.size} course codes`);

const parsed = [];
for (const s of all.values()) {
  const n = s.subjects.length;
  // Father line: the first n small numbers are the per-subject credits (they
  // always precede the drifted summary tail), so cut the list at n.
  const crs = s.creditCounts && s.creditCounts.length >= n
    ? s.creditCounts.slice(0, n)
    : s.subjects.map((sub) => {
        const known = creditsByCode.get(sub.code) ?? courseCredits[sub.code];
        return known > 0 ? known : null;
      });
  const subjects = s.subjects.map((sub, i) => {
    const cr = crs[i];
    const gp = sub.gp ?? 0; // RL / missing grade → 0 points so sums still add up
    return { code: sub.code, grade: sub.grade, gp: sub.gp, cp: typeof cr === "number" ? gp * cr : null, cr: typeof cr === "number" ? cr : null };
  });

  let credits = null;
  let creditPoints = null;
  const creditKnown = subjects.length > 0 && subjects.every((x) => x.cr !== null);
  if (creditKnown) {
    credits = subjects.reduce((n, x) => n + x.cr, 0);
    creditPoints = subjects.reduce((n, x) => n + (x.cp ?? 0), 0);
  }

  let sgpa = null;
  if (creditKnown && credits > 0) {
    // RL rows keep their credits but score nothing — flag them as result pending
    const allPending = subjects.every((x) => x.grade === "RL");
    sgpa = allPending ? null : Math.round((creditPoints / credits) * 100) / 100;
  } else if (s.printedSgpa !== null) {
    sgpa = s.printedSgpa;
  }

  parsed.push({
    name: s.name, roll: s.roll, semester: s.semester, ay: s.meta.ay,
    examPeriod: s.meta.examPeriod, subjects, credits, creditPoints, sgpa,
    printedSgpa: s.printedSgpa, creditLine: s.creditCounts?.length ?? -1,
  });
}

console.log(`parsed students: ${parsed.length}`);
const byAySem = new Map();
for (const p of parsed) {
  const k = `${p.ay} s${p.semester}`;
  byAySem.set(k, (byAySem.get(k) || 0) + 1);
}
console.log("parsed by (ay, semester):", [...byAySem.entries()].sort().map(([k, v]) => `${k}:${v}`).join(", "));

const noSubjects = parsed.filter((p) => !p.subjects.length);
const printedAndComputed = parsed.filter((p) => p.printedSgpa !== null && p.sgpa !== null);
const agree = printedAndComputed.filter((p) => Math.abs(p.printedSgpa - p.sgpa) <= 0.005).length;
console.log(`printed sgpa captured on ${printedAndComputed.length}/${parsed.length} rows; agrees with recomputed on ${agree}/${printedAndComputed.length} (drift expected: the printed cluster migrates between rows in -layout exports)`);

// ---------------------------------------------------------------- merge
const index = new Map();
records.forEach((r, i) => index.set(`${r.roll}|${r.semester}|${r.ay}`, i));
const cgpaByRoll = new Map();
for (const r of records) if (r.cgpa !== null) cgpaByRoll.set(r.roll, r.cgpa);

let appended = 0, replaced = 0, kept = 0, keptUncomputed = 0;
const replacedSample = [];
for (const p of parsed) {
  const key = `${p.roll}|${p.semester}|${p.ay}`;
  const idx = index.get(key);
  const base = {
    name: p.name,
    roll: p.roll,
    branch: p.roll.match(/^\d{4}([A-Z]+)\d+/)?.[1] ?? "",
    year: p.roll.slice(0, 4),
    semester: p.semester,
    ay: p.ay,
    academicYear: `${p.ay}-${String((p.ay + 1) % 100).padStart(2, "0")}`,
    examPeriod: p.examPeriod,
    sgpa: p.sgpa,
    resultStatus: "available",
    credits: p.credits,
    creditPoints: p.creditPoints,
    subjects: p.subjects.map((s) => ({ code: s.code, grade: s.grade, gp: s.gp, cp: s.cp })),
    cgpa: null,
  };

  if (process.env.GAZ_DEBUG_ROLLS) {
    const rolls = process.env.GAZ_DEBUG_ROLLS.split(",");
    if (rolls.includes(p.roll)) {
      console.log(`DEBUG ${p.roll} s${p.semester} ay${p.ay} printed=${p.printedSgpa} computed=${base.sgpa} credits=${base.credits} creditLine=${p.creditLine}/${p.subjects.length}`);
      console.log("  subjects:", JSON.stringify(p.subjects));
    }
  }

  if (idx !== undefined) {
    const cur = records[idx];
    // Replace on a recomputed SGPA (grade × father-line credits) — including when
    // the SGPA merely agrees but the stored row carries no per-subject detail
    // (old schema: sgpa-only rows). The printed cluster drifts between rows, so
    // never trust the printed value for an existing cell — if the credits are
    // missing we keep the stored value.
    if (base.sgpa !== null && p.credits !== null && p.subjects.length > 0 &&
        (cur.sgpa !== base.sgpa || !cur.subjects || cur.subjects.length === 0)) {
      base.cgpa = cur.cgpa ?? cgpaByRoll.get(p.roll) ?? null;
      records[idx] = base;
      replaced++;
      if (replacedSample.length < 8) {
        replacedSample.push({ roll: p.roll, sem: p.semester, ay: p.ay, dataset: cur.sgpa, computed: base.sgpa, printed: p.printedSgpa, subjects: base.subjects.length });
      }
    } else {
      kept++;
      if (p.credits === null) keptUncomputed++;
    }
  } else {
    base.cgpa = cgpaByRoll.get(p.roll) ?? null;
    if (base.sgpa === null) base.sgpa = p.printedSgpa;
    records.push(base);
    index.set(key, records.length - 1);
    appended++;
  }
}

console.log(`records: kept ${kept} (same sgpa; ${keptUncomputed} without computable sgpa), replaced ${replaced}, appended ${appended}`);
console.log(`no printed sgpa captured on ${parsed.length - printedAndComputed.length} rows; no father-credit line at all: ${parsed.filter(p => p.creditLine === -1).length}`);
if (process.env.GAZ_DEBUG) {
  console.log("replaced sample:", JSON.stringify(replacedSample, null, 1));
  console.log("no-subject sample:", JSON.stringify(noSubjects.slice(0, 5).map((p) => p.roll), null, 0));
}

if (!dryRun) {
  await writeFile(datasetPath, JSON.stringify(records, null, 1));
  console.log("wrote data/students.json");
} else {
  console.log("dry run: data/students.json not modified");
}
