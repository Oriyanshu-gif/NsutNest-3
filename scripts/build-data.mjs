/**
 * Turns the readable dataset in data/students.json into the compact payloads the
 * browser downloads at runtime (public/data/*.json).
 *
 * Keeping the dataset out of the JavaScript bundle matters: as an `import` it
 * produced a 3.9 MB chunk that every visitor had to download and parse before
 * the results appeared. As a fetched JSON file the page paints first and the
 * data arrives alongside it, and each file is cached separately.
 *
 * Run automatically by `npm run dev` / `npm run build` (see package.json).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const allRecords = JSON.parse(await readFile(join(root, "data/students.json"), "utf8"));

/**
 * Admission batches published on the portal. Records from other batches are
 * dropped here, so an older gazette row (or a stray backlog record) can never
 * leak into the payload the browser downloads. Add a batch here once its
 * results are imported.
 */
const BATCHES = new Set(["2022", "2023", "2024", "2025", "2026"]);

const records = allRecords.filter((r) => BATCHES.has(String(r.year)));
const dropped = allRecords.length - records.length;
if (dropped) console.log(`filtered out ${dropped} records outside batches ${[...BATCHES].sort().join(", ")}`);

// [roll, name, branch, year, semester, sgpa|null, academicYearStart, cgpa|null]
//
// The academic-year start is carried per record because a semester can be sat in
// more than one session: the 2023 batch sat semester 1 in Nov-Dec 2023, and the
// students who failed it sat it again in Nov-Dec 2025. The exam period the record
// belongs to cannot be derived from the semester alone.
//
// `cgpa` is the cumulative CGPA printed in the university's CGPA tables (null when
// none was published). It is the same on every record of a student, but carried per
// row so the leaderboard can show it without a second request.
const list = records.map((r) => [
  r.roll,
  r.name,
  r.branch,
  Number(r.year),
  r.semester,
  r.sgpa,
  r.ay,
  r.cgpa ?? null,
]);

// Course credit weight: cp/gp is unambiguous for every course in the gazette,
// so one lookup table lets the profile page show credits for failed subjects too
// (where cp is 0 and the ratio carries no information).
const courseCredits = {};
for (const r of records) {
  for (const s of r.subjects ?? []) {
    if (s.gp) courseCredits[s.code] = s.cp / s.gp;
  }
}

// roll -> semester -> [registered credits, credit points, [[code, grade, cp], ...], ay]
//
// When a student sat the same semester twice the profile shows the better
// attempt, so the payload stores the same choice: the highest SGPA, with a
// missing SGPA (RL) treated as the lowest. `best` remembers the SGPA used for
// that comparison so it never leaks into the payload.
const subjects = {};
const best = {};
for (const r of records) {
  if (!r.subjects || r.subjects.length === 0) continue;
  const key = `${r.roll}\u0000${r.semester}`;
  const sgpa = r.sgpa === null ? -1 : r.sgpa;
  if (best[key] !== undefined && sgpa <= best[key]) continue;
  best[key] = sgpa;
  (subjects[r.roll] ??= {})[r.semester] = [
    r.credits,
    r.creditPoints,
    r.subjects.map((s) => [s.code, s.grade, s.cp]),
    r.ay,
  ];
}

await mkdir(join(root, "public/data"), { recursive: true });
const write = async (name, value) => {
  const path = join(root, "public/data", name);
  await writeFile(path, JSON.stringify(value));
  const bytes = (await readFile(path)).length;
  console.log(`${name}: ${(bytes / 1024).toFixed(1)} kB`);
};
await write("students.json", list);
await write("subjects.json", { courseCredits, semesters: subjects });
console.log(`records: ${records.length}, semesters with subject data: ${records.filter((r) => r.subjects?.length).length}`);
