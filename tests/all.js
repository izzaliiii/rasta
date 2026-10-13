/* ============================================================================
 * Rasta | run every check.
 *
 *   node tests/all.js
 *
 * 1. run-tests.js    data integrity, planner correctness, edge cases, alerts
 * 2. calibrate.js    are the coordinates geographically sane?
 * 3. render-test.js  does every view actually render, and do the controls work?
 *
 * Exits non-zero if any suite fails.
 * ==========================================================================*/

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const SUITES = [
  ['Data, planner and alerts', 'run-tests.js'],
  ['Geographic calibration', 'calibrate.js'],
  ['View rendering and interaction', 'render-test.js']
];

let failed = 0;

console.log('\n' + '#'.repeat(66));
console.log('#  Rasta | full check suite');
console.log('#'.repeat(66));

for (const [label, script] of SUITES) {
  console.log(`\n\n===== ${label} (${script}) =====\n`);
  const res = spawnSync(process.execPath, [path.join(__dirname, script)], {
    stdio: 'inherit'
  });
  if (res.status !== 0) failed++;
}

console.log('\n' + '#'.repeat(66));
if (failed) {
  console.log(`#  ${failed} of ${SUITES.length} suites FAILED`);
  console.log('#'.repeat(66) + '\n');
  process.exit(1);
}
console.log(`#  All ${SUITES.length} suites passed.`);
console.log('#'.repeat(66) + '\n');
