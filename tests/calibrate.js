/* ============================================================================
 * Rasta | calibration check
 *
 * The journey planner derives every time estimate from inter-stop distance, so
 * if the coordinates are wrong the timings are wrong. This script measures each
 * line the way the app does and compares it against the operator's published
 * corridor length where one exists.
 *
 *   node tests/calibrate.js
 *
 * Station coordinates are hand-placed points on the road, not survey data, so
 * the measured length will never match the published figure exactly. Passing
 * here means the geometry is geographically sane : not that it is accurate to
 * the metre.
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const sandbox = { window: {}, console };
vm.createContext(sandbox);
for (const rel of ['data/transit-data.js', 'data/rasta.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
}
const Rasta = sandbox.Rasta;
const DETOUR = Rasta.meta.roadDetourFactor;

/* How far the measured chain may sit from the published corridor length.
 * 25% is generous but honest: hand-placed coordinates on a winding urban
 * corridor cannot do better without a real geometry source. A value outside
 * this band means something is genuinely wrong, not merely imprecise. */
const TOLERANCE = 0.25;

/** Longest believable gap between two consecutive BRT stops, in km. */
const MAX_HOP_KM = 12;

/** Implied door-to-door speed band for a stopping urban BRT service, km/h. */
const MIN_KMPH = 8;
const MAX_KMPH = 45;

console.log('\nRasta line calibration');
console.log('='.repeat(70));

let bad = 0;

/* --- 1. published length ------------------------------------------------- */

console.log('\n1. Corridor length vs. published figure');
console.log('-'.repeat(70));
for (const line of Rasta.lines) {
  let straight = 0;
  for (let i = 1; i < line.stations.length; i++) {
    straight += Rasta.legKm(line.stations[i - 1], line.stations[i]);
  }
  const straightKm = straight / DETOUR;     // divide out the app's road detour
  const appKm = Rasta.totalLineKm(line);    // what the app actually uses
  const published = line.publishedLengthKm;

  let verdict = 'no published reference : measurement recorded only';
  let status = 'INFO';

  if (published) {
    const ratio = straightKm / published;
    const ok = Math.abs(ratio - 1) <= TOLERANCE;
    const pct = ((ratio - 1) * 100).toFixed(1);
    status = ok ? 'PASS' : 'FAIL';
    verdict = `published ~${published} km, measured ${straightKm.toFixed(1)} km (${pct > 0 ? '+' : ''}${pct}%)`;
    if (!ok) bad++;
  }

  console.log(`${status.padEnd(5)} ${line.shortName.padEnd(12)} ${String(line.stations.length).padStart(2)} stops  ` +
    `road ${appKm.toFixed(1).padStart(5)} km   ${verdict}`);
}

/* --- 2. individual gaps -------------------------------------------------- */

console.log('\n2. Longest single hop per line (a huge gap usually means bad data)');
console.log('-'.repeat(70));
for (const line of Rasta.lines) {
  let worst = null;
  for (let i = 1; i < line.stations.length; i++) {
    const d = Rasta.legKm(line.stations[i - 1], line.stations[i]) / DETOUR;
    if (!worst || d > worst.km) {
      worst = { km: d, from: line.stations[i - 1], to: line.stations[i] };
    }
  }
  if (!worst) continue;
  const over = worst.km > MAX_HOP_KM;
  if (over) bad++;
  console.log(`  ${line.shortName.padEnd(12)} ${worst.km.toFixed(1).padStart(5)} km  ` +
    `${Rasta.stationName(worst.from)} -> ${Rasta.stationName(worst.to)}${over ? '   <-- TOO LONG' : ''}`);
}

/* --- 3. implied speed ---------------------------------------------------- */

console.log('\n3. Implied end-to-end speed (must be believable for a stopping bus)');
console.log('-'.repeat(70));
for (const line of Rasta.lines) {
  const km = Rasta.totalLineKm(line);
  const p = Rasta.planJourney(line.from, line.to);
  if (!p.ok) {
    console.log(`  ${line.shortName}: end-to-end plan FAILED (${p.reason})`);
    bad++;
    continue;
  }
  const kmph = km / (p.totalMinutes / 60);
  let note = 'plausible';
  if (kmph < MIN_KMPH) { note = 'TOO SLOW, coordinates likely stretched'; bad++; }
  if (kmph > MAX_KMPH) { note = 'TOO FAST, coordinates likely compressed'; bad++; }
  console.log(`  ${line.shortName.padEnd(12)} ${String(p.totalMinutes).padStart(4)} min  ` +
    `${km.toFixed(1).padStart(5)} km  ${kmph.toFixed(1).padStart(5)} km/h   ${note}`);
}

/* --- 4. interchange reachability ----------------------------------------- */

console.log('\n4. Every line-to-line change the app can offer');
console.log('-'.repeat(70));
const multi = Rasta.servedIds.filter(id => Rasta.linesAtStation(id).length > 1);
if (!multi.length) {
  console.log('  no shared stations found, the network would be unconnected');
  bad++;
} else {
  for (const id of multi) {
    const names = Rasta.linesAtStation(id).map(l => l.shortName).join(' + ');
    console.log(`  ${Rasta.stationName(id).padEnd(22)} ${names}`);
  }
}

console.log('');
if (bad) {
  console.log(`${bad} calibration problem(s) found. Fix the coordinates before trusting any timing.\n`);
  process.exit(1);
}
console.log('Calibration OK.\n');
