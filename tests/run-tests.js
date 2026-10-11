/* ============================================================================
 * Rasta — data integrity and routing tests
 *
 * Runs the REAL data and logic files in a browser-like sandbox, then checks
 * every structural invariant the UI depends on. No test framework, no deps.
 *
 *   node tests/run-tests.js
 *
 * Exits non-zero if any check fails, so it is safe to wire into CI.
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* --- load the app's data files exactly as the browser would --------------- */

const sandbox = { window: {}, console };
vm.createContext(sandbox);

for (const rel of ['data/transit-data.js', 'data/rasta.js']) {
  const file = path.join(ROOT, rel);
  const code = fs.readFileSync(file, 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: rel });
  } catch (err) {
    console.error(`FATAL: ${rel} threw while loading: ${err.message}`);
    process.exit(1);
  }
}

const Rasta = sandbox.Rasta;
const DATA = sandbox.window.RASTA_DATA;

if (!Rasta) { console.error('FATAL: data/rasta.js did not export Rasta'); process.exit(1); }
if (!DATA) { console.error('FATAL: data/transit-data.js did not set window.RASTA_DATA'); process.exit(1); }

/* --- tiny assertion harness ---------------------------------------------- */

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    const r = fn();
    if (r === false) throw new Error('returned false');
    passed++;
  } catch (err) {
    failures.push(`${name}\n      ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('\nRasta test suite');
console.log('='.repeat(60));

/* --- 1. structural integrity -------------------------------------------- */

check('every line has a unique id', () => {
  const seen = new Set();
  for (const l of Rasta.lines) {
    assert(!seen.has(l.id), `duplicate line id ${l.id}`);
    seen.add(l.id);
  }
});

check('every line has the fields the UI renders', () => {
  const required = ['id', 'name', 'shortName', 'operator', 'color', 'from', 'to', 'timings', 'fare', 'confidence'];
  for (const l of Rasta.lines) {
    for (const f of required) {
      assert(l[f] !== undefined && l[f] !== null, `line ${l.id} missing "${f}"`);
    }
    for (const f of ['firstDeparture', 'lastDeparture', 'peakHeadwayMin', 'offPeakHeadwayMin', 'days', 'note']) {
      assert(l.timings[f] !== undefined, `line ${l.id} timings missing "${f}"`);
    }
  }
});

check('every line references only stations that exist', () => {
  for (const l of Rasta.lines) {
    for (const sid of l.stations) {
      assert(Rasta.stations[sid], `line ${l.id} references unknown station "${sid}"`);
    }
  }
});

check('every line has at least 2 stations and no duplicates', () => {
  for (const l of Rasta.lines) {
    assert(l.stations.length >= 2, `line ${l.id} has ${l.stations.length} stations`);
    const seen = new Set();
    for (const sid of l.stations) {
      assert(!seen.has(sid), `line ${l.id} lists station "${sid}" twice`);
      seen.add(sid);
    }
  }
});

check('line from/to agree with the station sequence endpoints', () => {
  for (const l of Rasta.lines) {
    assert(l.stations[0] === l.from,
      `line ${l.id}: first station is ${l.stations[0]} but from is ${l.from}`);
    assert(l.stations[l.stations.length - 1] === l.to,
      `line ${l.id}: last station is ${l.stations[l.stations.length - 1]} but to is ${l.to}`);
  }
});

check('every station has name, area, city and a valid confidence level', () => {
  const levels = new Set(['high', 'medium', 'low']);
  for (const [id, s] of Object.entries(Rasta.stations)) {
    for (const f of ['name', 'area', 'city']) {
      assert(typeof s[f] === 'string' && s[f].trim(), `station ${id} missing ${f}`);
    }
    assert(levels.has(s.confidence), `station ${id} has bad confidence "${s.confidence}"`);
  }
});

check('station coordinates are valid and inside the twin-cities region', () => {
  for (const [id, s] of Object.entries(Rasta.stations)) {
    const c = s.coord;
    assert(Array.isArray(c) && c.length === 2, `station ${id} coord malformed`);
    const [lat, lon] = c;
    assert(lat >= 33.3 && lat <= 33.9, `station ${id} latitude ${lat} outside expected range`);
    assert(lon >= 72.7 && lon <= 73.3, `station ${id} longitude ${lon} outside expected range`);
  }
});

check('every station is served by at least one line (no orphans)', () => {
  const orphans = Object.keys(Rasta.stations).filter(id => Rasta.linesAtStation(id).length === 0);
  assert(orphans.length === 0, `orphan stations: ${orphans.join(', ')}`);
});

check('no two stations share a coordinate (would break distance maths)', () => {
  const seen = new Map();
  for (const [id, s] of Object.entries(Rasta.stations)) {
    const key = s.coord.join(',');
    assert(!seen.has(key), `stations ${seen.get(key)} and ${id} share coordinate ${key}`);
    seen.set(key, id);
  }
});

check('interchange flags agree with which lines actually serve a station', () => {
  for (const [id, s] of Object.entries(Rasta.stations)) {
    const actual = new Set(Rasta.linesAtStation(id).map(l => l.id));
    const declared = new Set(s.interchange || []);
    for (const d of declared) {
      assert(actual.has(d), `station ${id} declares interchange with ${d} but no such line serves it`);
    }
  }
});

/* --- 2. network connectivity -------------------------------------------- */

check('every station is reachable from every other station', () => {
  const ids = Rasta.servedIds;
  const start = ids[0];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const l of Rasta.linesAtStation(cur)) {
      const i = l.stations.indexOf(cur);
      for (const nb of [l.stations[i - 1], l.stations[i + 1]]) {
        if (nb && !seen.has(nb)) { seen.add(nb); queue.push(nb); }
      }
    }
  }
  const unreachable = ids.filter(id => !seen.has(id));
  assert(unreachable.length === 0, `unreachable from ${start}: ${unreachable.join(', ')}`);
});

check('planning between every ordered station pair succeeds', () => {
  const ids = Rasta.servedIds;
  const broken = [];
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const p = Rasta.planJourney(a, b);
      if (!p.ok) broken.push(`${a}->${b}: ${p.reason}`);
    }
  }
  assert(broken.length === 0, `${broken.length} pairs failed, e.g. ${broken.slice(0, 5).join(' | ')}`);
});

check('journeys are symmetric in stop count within a tolerance', () => {
  const ids = Rasta.servedIds;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const f = Rasta.planJourney(ids[i], ids[j]);
      const r = Rasta.planJourney(ids[j], ids[i]);
      if (!f.ok || !r.ok) continue;
      // Boarding the same corridor in reverse must not take wildly longer.
      const ratio = f.totalMinutes / r.totalMinutes;
      assert(ratio > 0.5 && ratio < 2,
        `asymmetric plan for ${ids[i]} <-> ${ids[j]}: ${f.totalMinutes} vs ${r.totalMinutes} min`);
    }
  }
});

/* --- 3. planner correctness --------------------------------------------- */

check('a direct same-line journey makes no changes', () => {
  const line = Rasta.lineById.red;
  const p = Rasta.planJourney(line.stations[0], line.stations[5]);
  assert(p.ok, 'plan failed');
  assert(p.changes === 0, `expected 0 changes, got ${p.changes}`);
  assert(p.legs.length === 1, `expected 1 leg, got ${p.legs.length}`);
  assert(p.legs[0].stops === 5, `expected 5 stops, got ${p.legs[0].stops}`);
});

check('legs never contain a gap: each leg starts where the previous ended', () => {
  for (const a of Rasta.servedIds) {
    for (const b of Rasta.servedIds) {
      if (a === b) continue;
      const p = Rasta.planJourney(a, b);
      if (!p.ok) continue;
      let cursor = a;
      for (const leg of p.legs) {
        assert(leg.stationIds[0] === cursor,
          `plan ${a}->${b}: leg starts at ${leg.stationIds[0]} but previous ended at ${cursor}`);
        cursor = leg.stationIds[leg.stationIds.length - 1];
      }
      assert(cursor === b, `plan ${a}->${b} ended at ${cursor}`);
    }
  }
});

check('every leg is a real contiguous run on its stated line', () => {
  for (const a of Rasta.servedIds.slice(0, 12)) {
    for (const b of Rasta.servedIds.slice(0, 12)) {
      if (a === b) continue;
      const p = Rasta.planJourney(a, b);
      if (!p.ok) continue;
      for (const leg of p.legs) {
        const line = Rasta.lineById[leg.lineId];
        assert(line, `unknown line ${leg.lineId} in plan ${a}->${b}`);
        const from = line.stations.indexOf(leg.stationIds[0]);
        const to = line.stations.indexOf(leg.stationIds[leg.stationIds.length - 1]);
        assert(from !== -1 && to !== -1, `leg endpoints not on line ${leg.lineId}`);
        const step = to > from ? 1 : -1;
        for (let k = 0; k < leg.stationIds.length; k++) {
          assert(line.stations[from + k * step] === leg.stationIds[k],
            `leg on ${leg.lineId} jumps: expected ${line.stations[from + k * step]}, got ${leg.stationIds[k]}`);
        }
      }
    }
  }
});

check('adjacent legs always use different lines', () => {
  for (const a of Rasta.servedIds) {
    for (const b of Rasta.servedIds) {
      if (a === b) continue;
      const p = Rasta.planJourney(a, b);
      if (!p.ok) continue;
      for (let i = 1; i < p.legs.length; i++) {
        assert(p.legs[i].lineId !== p.legs[i - 1].lineId,
          `plan ${a}->${b} has two consecutive legs on ${p.legs[i].lineId}`);
      }
    }
  }
});

check('journey time and distance are positive and plausible', () => {
  const ids = Rasta.servedIds;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const p = Rasta.planJourney(ids[i], ids[j]);
      if (!p.ok) continue;
      assert(p.totalMinutes > 0, `non-positive time for ${ids[i]}->${ids[j]}`);
      assert(p.totalKm > 0, `non-positive distance for ${ids[i]}->${ids[j]}`);
      // Twin cities are roughly 60 km across; nothing should exceed that.
      assert(p.totalKm < 80, `implausible distance ${p.totalKm} km for ${ids[i]}->${ids[j]}`);
      // 5 km/h floor guards against a negative or absurd corridor speed.
      const impliedKmph = p.totalKm / (p.totalMinutes / 60);
      assert(impliedKmph > 5, `implied speed ${impliedKmph.toFixed(1)} km/h for ${ids[i]}->${ids[j]}`);
    }
  }
});

check('transfer penalty is actually applied when lines change', () => {
  const p = Rasta.planJourney('saddar', 'airport');
  assert(p.ok, 'saddar -> airport plan failed');
  assert(p.changes >= 1, `expected at least one change, got ${p.changes}`);
  const transfer = p.legs.slice(1).reduce((a, l) => a + l.transferMin, 0);
  assert(transfer >= Rasta.meta.transferPenaltyMin, `transfer time ${transfer} below penalty`);
});

check('fare is charged per leg and grows with the number of changes', () => {
  const direct = Rasta.planJourney('saddar', 'faizabad');   // red line only
  const multi = Rasta.planJourney('saddar', 'airport');     // red + orange
  assert(direct.ok && multi.ok, 'plans failed');
  assert(direct.fareEstimate > 0, 'direct fare not positive');
  assert(multi.fareEstimate > direct.fareEstimate,
    `multi-leg fare ${multi.fareEstimate} should exceed direct fare ${direct.fareEstimate}`);
});

/* --- 4. planner edge cases ---------------------------------------------- */

check('same origin and destination is rejected clearly', () => {
  const p = Rasta.planJourney('faizabad', 'faizabad');
  assert(!p.ok && p.reason === 'same-station', `got ${JSON.stringify(p)}`);
});

check('unknown station ids are rejected, not crashed on', () => {
  assert(!Rasta.planJourney('does_not_exist', 'faizabad').ok, 'unknown origin accepted');
  assert(!Rasta.planJourney('faizabad', 'does_not_exist').ok, 'unknown destination accepted');
  assert(!Rasta.planJourney(null, undefined).ok, 'null ids accepted');
});

/* --- 5. search ----------------------------------------------------------- */

check('search finds a station by exact name', () => {
  const hits = Rasta.searchStations('Faizabad', 5);
  assert(hits.length > 0, 'no hits for Faizabad');
  assert(hits[0].station.name.toLowerCase().includes('faizabad'), `top hit was ${hits[0].station.name}`);
});

check('search is case and punctuation insensitive', () => {
  const a = Rasta.searchStations('PIMS', 3).map(h => h.id).join(',');
  const b = Rasta.searchStations('  pims. ', 3).map(h => h.id).join(',');
  assert(a === b, `"PIMS" gave [${a}] but "  pims. " gave [${b}]`);
});

check('search finds stations by area, not just name', () => {
  const hits = Rasta.searchStations('G-9', 5);
  assert(hits.length > 0, 'no hits for area G-9');
});

check('empty search returns nothing rather than everything', () => {
  assert(Rasta.searchStations('', 5).length === 0, 'empty query returned results');
  assert(Rasta.searchStations('   ', 5).length === 0, 'whitespace query returned results');
});

check('nonsense search returns an empty list, not an error', () => {
  assert(Rasta.searchStations('zzzzqqqq', 5).length === 0, 'nonsense query matched something');
});

/* --- 6. limits of the data (documented, not silently ignored) ------------ */

check('every line carries a non-empty timings note for the user', () => {
  for (const l of Rasta.lines) {
    assert(l.timings.note && l.timings.note.length > 10, `line ${l.id} has no useful timings note`);
  }
});

check('a disclaimer exists for the UI to display', () => {
  assert(typeof Rasta.meta.disclaimer === 'string' && Rasta.meta.disclaimer.length > 40,
    'meta.disclaimer missing or too short');
});

check('known gaps are listed for the Info screen', () => {
  assert(Array.isArray(Rasta.meta.knownGaps) && Rasta.meta.knownGaps.length > 0,
    'meta.knownGaps is missing or empty');
});

/* --- 7. service alerts --------------------------------------------------
 * An alert that names a line which does not exist would either crash the UI or
 * silently hide a real disruption. These checks keep the alert channel honest. */

check('every service alert has the fields the UI renders', () => {
  assert(Rasta.serviceAlerts.length > 0, 'no service alerts defined');
  for (const a of Rasta.serviceAlerts) {
    for (const f of ['id', 'severity', 'title', 'body', 'date', 'confidence']) {
      assert(a[f], `alert ${a.id || '(no id)'} missing "${f}"`);
    }
    assert(['high', 'medium', 'low'].includes(a.severity), `alert ${a.id} bad severity "${a.severity}"`);
    assert(['high', 'medium', 'low'].includes(a.confidence), `alert ${a.id} bad confidence "${a.confidence}"`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(a.date), `alert ${a.id} date "${a.date}" is not YYYY-MM-DD`);
  }
});

check('service alert ids are unique', () => {
  const seen = new Set();
  for (const a of Rasta.serviceAlerts) {
    assert(!seen.has(a.id), `duplicate alert id ${a.id}`);
    seen.add(a.id);
  }
});

check('every service alert names only real lines', () => {
  for (const a of Rasta.serviceAlerts) {
    assert(Array.isArray(a.lineIds) && a.lineIds.length, `alert ${a.id} names no lines`);
    for (const id of a.lineIds) {
      assert(Rasta.lineById[id], `alert ${a.id} references unknown line "${id}"`);
    }
  }
});

check('a sourcing alert carries a URL, so a claim can be checked', () => {
  for (const a of Rasta.serviceAlerts) {
    if (a.confidence === 'low') {
      // Low-confidence claims must be traceable, or they should not be shown.
      assert(a.source, `low-confidence alert ${a.id} has no source URL to verify against`);
    }
  }
});

check('alertsForLine returns the disruptions affecting that line', () => {
  const red = Rasta.alertsForLine('red');
  assert(red.length > 0, 'no alerts surfaced for the red line');
  assert(red.every(a => a.lineIds.includes('red')), 'alertsForLine returned an unrelated alert');
  // Highest severity must come first so the UI leads with what matters.
  const rank = { high: 0, medium: 1, low: 2 };
  for (let i = 1; i < red.length; i++) {
    assert(rank[red[i].severity] >= rank[red[i - 1].severity],
      'alertsForLine is not sorted worst-first');
  }
});

check('a planned journey reports disruptions on the lines it uses', () => {
  const p = Rasta.planJourney('saddar', 'pak_secretariat');
  assert(p.ok, 'plan failed');
  const alerts = Rasta.alertsForJourney(p);
  assert(alerts.length > 0, 'a red-line journey surfaced no alerts despite red-line alerts existing');
  assert(alerts.some(a => a.lineIds.includes('red')), 'journey alerts missed the red line');
});

check('alertsForJourney on a failed plan returns nothing instead of throwing', () => {
  assert(Rasta.alertsForJourney(null).length === 0, 'null plan produced alerts');
  assert(Rasta.alertsForJourney({ ok: false }).length === 0, 'failed plan produced alerts');
});

check('activeAlerts is sorted worst-first for the home screen', () => {
  const list = Rasta.activeAlerts();
  const rank = { high: 0, medium: 1, low: 2 };
  assert(list.length === Rasta.serviceAlerts.length, 'activeAlerts dropped or duplicated alerts');
  for (let i = 1; i < list.length; i++) {
    assert(rank[list[i].severity] >= rank[list[i - 1].severity], 'activeAlerts is not sorted worst-first');
  }
  assert(rank[list[0].severity] === 0, `the most severe alert is not first (got ${list[0].severity})`);
});

/* --- report -------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed\n`);

if (failures.length) {
  console.log('FAILURES');
  console.log('-'.repeat(60));
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}\n`));
  process.exit(1);
}

/* A short human-readable sample so the numbers can be eyeballed. */
console.log('Sample plans (sanity check on the estimates)');
console.log('-'.repeat(60));
const samples = [
  ['saddar', 'pak_secretariat'],
  ['faizabad', 'pims'],
  ['saddar', 'airport'],
  ['pims', 'nust'],
  ['gulberg', 'barakahu'],
  ['koral', 'faiz_ahmad_faiz']
];
for (const [a, b] of samples) {
  const p = Rasta.planJourney(a, b);
  if (!p.ok) { console.log(`${a} -> ${b}: FAILED`); continue; }
  console.log(
    `${Rasta.stationName(a)} -> ${Rasta.stationName(b)}: ` +
    `${p.totalMinutes} min, ${p.totalKm} km, ` +
    `${p.changes === 0 ? 'direct' : p.changes + ' change(s)'}, ` +
    `Rs ${p.fareEstimate}${p.fareExact ? '' : ' (est.)'} ` +
    `[${p.legs.map(l => Rasta.lineById[l.lineId].shortName).join(' + ')}]`
  );
}
console.log('');
