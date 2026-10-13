/* ============================================================================
 * One-off cleanup: remove em dashes and decorative glyphs.
 *
 *   node tools/dedash.js            dry run
 *   node tools/dedash.js --write    apply
 *
 * Also run by hand to check nothing has crept back in:
 *   node tools/dedash.js            (reports REMAINING counts)
 *
 * Two things this must not break:
 *   1. URLs. Several real links contain an en dash, for example the Wikipedia
 *      article "Rawalpindi-Islamabad Metrobus". Those are protected before any
 *      replacement runs and restored afterwards.
 *   2. Filenames and numeric ranges. `data/rasta.js` and "8-45 km/h" should keep
 *      a plain hyphen rather than being turned into prose.
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');

const FILES = [
  'app.js',
  'data/rasta.js',
  'data/transit-data.js',
  'styles.css',
  'index.html',
  'sw.js',
  'serve.js',
  'README.md',
  'LICENSE',
  'manifest.webmanifest',
  'tests/all.js',
  'tests/run-tests.js',
  'tests/calibrate.js',
  'tests/render-test.js',
  'demo/build-demo.js'
];

/* Park any URL containing a dash so the generic rules cannot corrupt it. */
const URL_TOKEN = '\u0000URL';
const FILENAME_TOKEN = '\u0000FILE';

const RULES = [
  /* --- protect things that must keep their dashes ---------------------- */
  [/https?:\/\/[^\s"'<>)\]]+/g, (m) => URL_TOKEN + Buffer.from(m, 'utf8').toString('base64') + URL_TOKEN],
  [/`[\w./-]*\/[\w./-]+`/g, (m) => FILENAME_TOKEN + Buffer.from(m, 'utf8').toString('base64') + FILENAME_TOKEN],

  /* --- specific patterns, before any generic rule ---------------------- */
  [/Rasta — /g, 'Rasta | '],
  [/ — Rasta/g, ' | Rasta'],
  [/# Rasta — /g, '# Rasta | '],
  [/'Ageing — /g, "'Ageing: "],
  [/'Out of date — /g, "'Out of date: "],
  [/\(km \|\| '—'\)/g, "(km || 'n/a')"],
  [/\(l\.fare \? money\(l\.fare\.amountPkr\) : '—'\)/g, "(l.fare ? money(l.fare.amountPkr) : 'n/a')"],
  [/\(line\.fare \? money\(line\.fare\.amountPkr\)[^)]*: '—'\)/g, "(line.fare ? money(line.fare.amountPkr) : 'n/a')"],

  /* --- decorative glyphs ---------------------------------------------- */
  [/⚠ /g, ''],
  [/⇅ /g, ''],
  [/↺ /g, ''],
  [/✕/g, 'x'],
  [/…/g, '...'],
  // A midline dot used as a separator reads as typographic showing off. A
  // comma is what a person would type.
  [/\s*·\s*/g, ', '],
  [/→/g, 'to'],

  /* --- ranges keep a plain hyphen ------------------------------------- */
  [/(\d)\s*–\s*(\d)/g, '$1-$2'],
  [/(\d{2}:\d{2})\s*–\s*(\d{2}:\d{2})/g, '$1 to $2'],
  [/(\d{2}:\d{2})\s*—\s*(\d{2}:\d{2})/g, '$1 to $2'],

  /* --- generic dashes become ordinary punctuation ---------------------- */
  [/^(\s*\*[^—]*)—\s+/gm, '$1: '],
  [/\s+—\s+/g, ', '],
  [/—\s+/g, ', '],
  [/\s+—/g, ','],
  [/—/g, ', '],
  [/\s+–\s+/g, ', '],
  [/–/g, '-'],

  /* --- restore protected spans ---------------------------------------- */
  [new RegExp(FILENAME_TOKEN + '([A-Za-z0-9+/=]+)' + FILENAME_TOKEN, 'g'),
    (m, b64) => Buffer.from(b64, 'base64').toString('utf8')],
  [new RegExp(URL_TOKEN + '([A-Za-z0-9+/=]+)' + URL_TOKEN, 'g'),
    (m, b64) => Buffer.from(b64, 'base64').toString('utf8')]
];

let changedFiles = 0;

for (const rel of FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { console.log('  missing: ' + rel); continue; }

  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  const applied = [];

  RULES.forEach(([pattern, replacement], i) => {
    // Reset lastIndex for the stateful global regexes.
    if (pattern.global) pattern.lastIndex = 0;
    if (!pattern.test(after)) return;
    if (pattern.global) pattern.lastIndex = 0;
    after = after.replace(pattern, replacement);
    applied.push(i);
  });

  const remaining = (after.match(/[—–]/g) || []).length;
  const glyphs = (after.match(/[⚠⇅↺✕…]/g) || []).length;
  if (after !== before) changedFiles++;

  console.log(
    (after !== before ? 'CHANGED' : 'clean  ').padEnd(9) + rel.padEnd(26) +
    (applied.length ? applied.length + ' rules' : '') +
    (remaining ? '   REMAINING dashes: ' + remaining : '') +
    (glyphs ? '   REMAINING glyphs: ' + glyphs : '')
  );

  if (after !== before && WRITE) fs.writeFileSync(file, after, 'utf8');
}

console.log(`\n${WRITE ? 'Applied to' : 'Would change'} ${changedFiles} file(s).`);
if (!WRITE) console.log('Dry run. Re-run with --write to apply.');
