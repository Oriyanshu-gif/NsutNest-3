/**
 * The target-CGPA plan, kept apart from the UI so its arithmetic can be checked
 * without a browser.
 */

export type GradedSemester = { sgpa: number; credits: number };

/**
 * SGPA the remaining semesters must average to land on `target`.
 *
 * Weights are the registered credits of each finished semester, falling back to
 * one per semester when the gazette has no credit data, so the answer stays
 * meaningful for both kinds of record.
 */
export function requiredSgpa(target: number, done: GradedSemester[], remaining: number): number | null {
  if (!remaining || !done.length) return null;
  const weight = (row: GradedSemester) => (row.credits > 0 ? row.credits : 1);
  const earnedCredits = done.reduce((sum, row) => sum + weight(row), 0);
  const earnedPoints = done.reduce((sum, row) => sum + row.sgpa * weight(row), 0);
  const perSemester = earnedCredits / done.length;
  const totalCredits = earnedCredits + remaining * perSemester;
  return (target * totalCredits - earnedPoints) / (remaining * perSemester);
}
