// Self-check for lib/result-plan.ts: node scripts/check-result-plan.mjs
import assert from 'node:assert/strict';
import { requiredSgpa } from '../lib/result-plan.ts';

const at = (sgpa, credits) => ({ sgpa, credits });

// Even progress: 4 semesters at 8.0, target 8.5 over 8 → 9.0 average.
assert.equal(requiredSgpa(8.5, [at(8, 20), at(8, 20), at(8, 20), at(8, 20)], 4), 9);
// Already achieved: seven 10.0 semesters against a 5.0 target needs nothing.
assert.ok(requiredSgpa(5, Array.from({ length: 7 }, () => at(10, 20)), 1) < 0);
// Unreachable.
assert.ok(requiredSgpa(10, [at(5, 20)], 7) > 10);
// No credit data falls back to equal semester weights.
assert.equal(requiredSgpa(8, [at(6, 0)], 1), 10);
// Nothing graded, or no semesters left, has no answer.
assert.equal(requiredSgpa(8, [], 8), null);
assert.equal(requiredSgpa(8, [at(8, 20)], 0), null);

console.log('result-plan checks passed');
