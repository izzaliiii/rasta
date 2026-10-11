/* ============================================================================
 * Rasta — render smoke test
 *
 * The data and planner are covered by run-tests.js, but none of that would
 * catch a broken HTML template, a typo in a view, or a mount function that
 * throws on a real element. This loads the ACTUAL app.js against a minimal DOM
 * stub and renders every route in the app, then asserts the output looks right.
 *
 *   node tests/render-test.js
 *
 * This is a stub, not a browser: it proves each view runs and produces the
 * expected markup. It does not prove layout, styling or interactivity.
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

/* ----------------------------------------------------------- minimal DOM -- */

/* The app renders a view by assigning main.innerHTML, then its mount() phase
 * looks up controls INSIDE that markup by id and writes into them. A stub that
 * returns a detached element would silently swallow everything mount produces,
 * so nested elements are bound back into their parent's markup: setting
 * innerHTML on #planResult actually rewrites #planResult inside #main. Without
 * this the harness would report empty results for a perfectly good app. */

function replaceElementHtml(parentHtml, id, newInner) {
  const re = new RegExp('(<([a-zA-Z]+)[^>]*\\bid="' + id + '"[^>]*>)([\\s\\S]*?)(<\\/\\2>)');
  const m = parentHtml.match(re);
  if (!m) return null;
  return parentHtml.replace(re, m[1] + newInner + m[4]);
}

function makeElement(tag, attrs) {
  const a = Object.assign({}, attrs);
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    _html: '',
    _id: a.id || null,
    _value: null,
    attributes: a,
    children: [],
    listeners: {},
    style: {},
    hidden: false,
    content: null,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = String(v);
      // Mirror the write back into the rendered markup so tests can see it.
      if (this._id) mirrorToParent(this._id, this._html);
    },
    /* An input's live value starts as whatever the markup rendered. Without
       this, a view that reads its own inputs during mount would see empty
       strings and behave as though the user typed nothing. */
    get value() {
      if (this._value !== null) return this._value;
      return 'value' in this.attributes ? this.attributes.value : '';
    },
    set value(v) { this._value = String(v); },
    getAttribute(n) { return n in this.attributes ? this.attributes[n] : null; },
    setAttribute(n, v) { this.attributes[n] = String(v); },
    removeAttribute(n) { delete this.attributes[n]; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
    click() { (this.listeners.click || []).forEach(fn => fn({ preventDefault() {} })); },
    submit() { (this.listeners.submit || []).forEach(fn => fn({ preventDefault() {} })); },
    dispatch(type, ev) { (this.listeners[type] || []).forEach(fn => fn(ev || { preventDefault() {} })); },
    closest() { return null; }
  };
  return el;
}

/** The single element the app treats as the render target. */
const mainEl = makeElement('main', { id: 'main' });

/** Write a nested element's content back into #main's markup. */
function mirrorToParent(id, html) {
  if (id === 'main') return;
  const updated = replaceElementHtml(mainEl._html, id, html);
  if (updated !== null) mainEl._html = updated;
}

const tabLinks = [
  makeElement('a', { 'data-tab': 'home', href: '#/' }),
  makeElement('a', { 'data-tab': 'routes', href: '#/routes' }),
  makeElement('a', { 'data-tab': 'plan', href: '#/plan' }),
  makeElement('a', { 'data-tab': 'stops', href: '#/stops' }),
  makeElement('a', { 'data-tab': 'info', href: '#/info' })
];
const tabbarEl = makeElement('nav', { 'class': 'tabbar' });
tabbarEl.querySelectorAll = () => tabLinks;

const themeToggleEl = makeElement('button', { id: 'themeToggle' });
const themeMetaEl = makeElement('meta', { name: 'theme-color' });
const documentEl = makeElement('html');
documentEl.setAttribute = function (n, v) { this.attributes[n] = String(v); };
documentEl.getAttribute = function (n) { return n in this.attributes ? this.attributes[n] : null; };

/** Elements created by id on demand, so mounts can find their own controls. */
const byId = {
  main: mainEl,
  themeToggle: themeToggleEl
};

/** Statically defined elements outside #main, looked up by a real selector. */
const staticElements = {
  themeToggle: themeToggleEl
};

/** Pull the attributes of `<tag id="x" ...>` out of a markup string. */
function attrsFromMarkup(html, id) {
  const m = html.match(new RegExp('<[a-zA-Z]+[^>]*\\bid="' + id + '"([^>]*)>'));
  if (!m) return null;
  const attrs = { id };
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;
  let part;
  while ((part = re.exec(m[1])) !== null) attrs[part[1]] = part[2];
  return attrs;
}

const document = {
  documentElement: documentEl,
  title: '',
  createElement: (t) => makeElement(t),
  getElementById(id) {
    if (id in byId && byId[id]) return byId[id];
    if (id in staticElements) return staticElements[id];

    // Views look up controls they have just rendered. Rebuild the stub from the
    // real markup so attributes such as input `value` are populated: a view
    // that reads its own inputs during mount must see what was rendered.
    const attrs = attrsFromMarkup(mainEl._html, id);
    const tag = attrs && attrs.list ? 'input' : 'div';
    const el = makeElement(tag, attrs || { id });
    byId[id] = el;
    return el;
  },
  querySelector(sel) {
    if (sel === '.tabbar') return tabbarEl;
    if (sel === 'meta[name="theme-color"]') return themeMetaEl;
    if (sel === '#main') return mainEl;
    return makeElement('div');
  },
  querySelectorAll() { return []; },
  addEventListener() {}
};

/* ---------------------------------------------------------- window / env -- */

let currentHash = '#/';
const navigator = {};

const location = {
  get hash() { return currentHash; },
  set hash(v) { currentHash = v; },
  protocol: 'file:',
  replace(v) { currentHash = v; },
  pathname: '/index.html'
};

const storage = {};
const localStorage = {
  getItem: (k) => (k in storage ? storage[k] : null),
  setItem: (k, v) => { storage[k] = String(v); },
  removeItem: (k) => { delete storage[k]; }
};

const listeners = {};
const window = {
  location,
  navigator,
  localStorage,
  print() {},
  scrollTo() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  removeEventListener() {},
  history: { replaceState() {}, pushState() {} }
};
// app.js reads `location` and `history` as globals, not off window.
const history = window.history;

/* ------------------------------------------------------------- load app -- */

const sandbox = {
  window, document, location, history, localStorage, navigator,
  console, setTimeout, clearTimeout, Promise, URL, Date, Math, JSON
};
sandbox.self = window;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const rel of ['data/transit-data.js', 'data/rasta.js', 'app.js']) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: rel });
  } catch (err) {
    console.error(`FATAL: ${rel} threw during load:\n  ${err.stack}`);
    process.exit(1);
  }
}

/* ------------------------------------------------------------ assertions -- */

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`${name}\n      ${err.message}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

/** Render a hash route the way a navigation would, then return the markup.
 *  The hash is set BEFORE dispatch: a real navigation has the new hash already
 *  in place when the hashchange handler runs, and planView.mount reads it back
 *  out of location to auto-run a journey. Setting it afterwards would test a
 *  state the browser never produces. */
function render(hash) {
  currentHash = hash;
  mainEl._html = '';
  // Discard control stubs from the previous view: a re-render creates new
  // elements, and reusing a stale stub would leak listeners and old values.
  for (const k of Object.keys(byId)) {
    if (k !== 'main' && k !== 'themeToggle') delete byId[k];
  }
  const fns = listeners.hashchange || [];
  assert(fns.length > 0, 'app never registered a hashchange listener');
  fns.forEach(fn => fn({}));
  return mainEl._html;
}

/** Look up a rendered control the way the app's own mount code would. */
function ui(id) {
  return document.getElementById(id);
}

/** app.js boots by calling render() once at load; that output is already set. */
const bootHtml = mainEl._html;

console.log('\nRasta render smoke test');
console.log('='.repeat(64));

/* --- boot ---------------------------------------------------------------- */

check('app booted and rendered the home screen without throwing', () => {
  assert(bootHtml && bootHtml.length > 200, `home screen rendered ${bootHtml.length} chars`);
});

check('boot redirected an empty hash to #/', () => {
  assert(currentHash === '#/' || currentHash === '/', `hash was "${currentHash}"`);
});

/* --- every route renders ------------------------------------------------- */

const ROUTE_CASES = [
  ['#/', 'home', ['Getting around the twin cities', 'Plan a journey', 'Network']],
  ['#/routes', 'routes list', ['Lines', 'Red Line', 'Orange Line', 'Blue Line', 'Green Line']],
  ['#/route/red', 'red route detail', ['Metro Bus Red Line', 'Saddar', 'Pak Secretariat', 'Reverse direction']],
  ['#/route/orange', 'orange route detail', ['Orange Line', 'Islamabad International Airport']],
  ['#/route/blue', 'blue route detail', ['Blue Line', 'Gulberg']],
  ['#/route/green', 'green route detail', ['Green Line', 'Barakahu']],
  ['#/stops', 'stops index', ['Stops', 'Islamabad', 'Rawalpindi']],
  ['#/stop/faizabad', 'stop detail', ['Faizabad', 'Lines serving this stop']],
  ['#/stop/pims', 'interchange stop detail', ['PIMS', 'Red Line', 'Blue Line', 'Green Line']],
  ['#/plan', 'journey planner form', ['Plan a journey', 'From', 'To', 'Find route']],
  ['#/alerts', 'alerts screen', ['Service alerts']],
  ['#/info', 'info screen', ['About Rasta', 'Known gaps', 'Reference sources']]
];

for (const [hash, label, needles] of ROUTE_CASES) {
  check(`renders ${label} (${hash})`, () => {
    const html = render(hash);
    assert(html.length > 100, `rendered only ${html.length} chars`);
    for (const n of needles) {
      assert(html.includes(n), `output is missing expected text "${n}"`);
    }
  });
}

/* --- alerts actually surface -------------------------------------------- */

check('home screen leads with the Red Line disruption alert', () => {
  const html = render('#/');
  assert(html.includes('Service alerts'), 'no service alerts section on home');
  assert(/suspended between Kashmir Highway/i.test(html),
    'the red line suspension alert is not shown on the home screen');
  assert(html.includes('unconfirmed'), 'low-confidence alert is not labelled unconfirmed');
});

check('the disruption alert appears on the Red Line route page', () => {
  const html = render('#/route/red');
  assert(html.includes('Alerts for this line'), 'no per-line alerts block on the red route page');
  assert(/suspended between Kashmir Highway/i.test(html), 'red alert missing from the red route page');
});

check('the alerts screen lists every alert', () => {
  const html = render('#/alerts');
  const expected = sandbox.Rasta.serviceAlerts.length;
  const tags = (html.match(/class="alert alert-/g) || []).length;
  assert(tags === expected, `alerts screen rendered ${tags} cards, expected ${expected}`);
});

check('a rail line with no alerts shows no alerts block', () => {
  const html = render('#/route/orange');
  assert(!html.includes('Alerts for this line'),
    'orange line shows an alerts block despite having no orange-specific alert');
});

/* --- journey planning through the UI ------------------------------------ */

check('planning a journey through the planner renders legs and totals', () => {
  const html = render('#/plan?from=saddar&to=pak_secretariat');
  assert(html.includes('Your journey'), 'no journey summary rendered');
  assert(html.includes('Step by step'), 'no step-by-step section rendered');
  assert(html.includes('Red Line'), 'the leg does not name its line');
  assert(/Rs \d+/.test(html), 'no fare shown');
  assert(html.includes('min'), 'no journey time shown');
});

check('a multi-line journey renders a change instruction', () => {
  const html = render('#/plan?from=saddar&to=airport');
  assert(html.includes('Change at'), 'no change instruction for a two-line journey');
  assert(html.includes('Alerts on this route'), 'journey did not surface alerts for the lines it uses');
});

check('a journey between the same stop shows a friendly error, not a crash', () => {
  const html = render('#/plan?from=pims&to=pims');
  assert(html.includes('same stop'), 'expected a same-stop warning');
  assert(!html.includes('Your journey'), 'a same-stop request produced a journey');
});

check('an unrecognised station in the URL does not crash the planner', () => {
  const html = render('#/plan?from=not_a_station&to=pims');
  assert(html.length > 100, 'planner rendered nothing for a bad station');
  assert(!html.includes('Your journey'), 'planner produced a journey from an unknown stop');
});

/* --- escaping and robustness -------------------------------------------- */

check('rendered markup escapes user-controlled text', () => {
  // A stop with an apostrophe must render as an HTML entity, not raw markup.
  const html = render('#/stop/blue_childrens');
  assert(html.includes('Children'), 'childrens hospital stop did not render');
  assert(!/<script/i.test(html), 'output contains a raw <script> tag');
});

check('every station referenced by a line renders on a stop page', () => {
  const Rasta = sandbox.Rasta;
  const missing = [];
  for (const line of Rasta.lines) {
    for (const sid of line.stations) {
      const html = render('#/stop/' + sid);
      if (!html.includes('Lines serving this stop')) missing.push(sid);
    }
  }
  assert(missing.length === 0, `stops failed to render: ${missing.join(', ')}`);
});

check('unknown routes render a not-found page rather than throwing', () => {
  const html = render('#/nonsense/path');
  assert(html.includes('Not found'), 'unknown route did not render not-found');
});

check('an unknown line id renders not-found rather than throwing', () => {
  const html = render('#/route/does_not_exist');
  assert(html.includes('Not found'), 'unknown line did not render not-found');
});

/* --- real interaction ----------------------------------------------------
 * Auto-run from the URL is covered above. These drive the controls the way a
 * person would: type into the fields and submit the form. */

check('typing two stops and submitting produces a journey', () => {
  render('#/plan');
  const from = ui('fromInput');
  const to = ui('toInput');
  from.value = 'Faizabad';
  to.value = 'PIMS';
  ui('planForm').dispatch('submit', { preventDefault() {} });
  const html = mainEl._html;
  assert(html.includes('Your journey'), 'submitting the form produced no journey');
  assert(html.includes('Faizabad') && html.includes('PIMS'), 'journey does not name its endpoint stops');
  assert(/Rs \d+/.test(html), 'no fare rendered for an interactive journey');
});

check('typing an area name instead of a stop name still resolves', () => {
  render('#/plan');
  ui('fromInput').value = 'Gulberg';
  ui('toInput').value = 'Barakahu';
  ui('planForm').dispatch('submit', { preventDefault() {} });
  assert(mainEl._html.includes('Your journey'), 'an area-name lookup failed to plan');
});

check('submitting with only one endpoint explains what is missing', () => {
  render('#/plan');
  ui('fromInput').value = 'PIMS';
  ui('toInput').value = '';
  ui('planForm').dispatch('submit', { preventDefault() {} });
  assert(mainEl._html.includes('Enter both'), 'no guidance shown when a field is empty');
  assert(!mainEl._html.includes('Your journey'), 'a half-empty form produced a journey');
});

check('submitting a misspelled stop gives a helpful error, not a crash', () => {
  render('#/plan');
  ui('fromInput').value = 'Zzzznowhere';
  ui('toInput').value = 'PIMS';
  ui('planForm').dispatch('submit', { preventDefault() {} });
  assert(/do not recognise/i.test(mainEl._html), 'no recognition error for a nonsense stop');
  assert(!mainEl._html.includes('Your journey'), 'a nonsense stop produced a journey');
});

check('the swap button exchanges the two fields', () => {
  render('#/plan');
  const from = ui('fromInput');
  const to = ui('toInput');
  from.value = 'Saddar';
  to.value = 'Barakahu';
  ui('swapBtn').click();
  assert(from.value === 'Barakahu', `from is "${from.value}" after swap`);
  assert(to.value === 'Saddar', `to is "${to.value}" after swap`);
});

check('planning survives being run twice in a row', () => {
  render('#/plan');
  ui('fromInput').value = 'Saddar';
  ui('toInput').value = 'PIMS';
  ui('planForm').dispatch('submit', { preventDefault() {} });
  const first = mainEl._html;
  assert(first.includes('Your journey'), 'first submission failed');
  ui('fromInput').value = 'Gulberg';
  ui('planForm').dispatch('submit', { preventDefault() {} });
  assert(mainEl._html.includes('Your journey'), 'second submission failed');
  assert(mainEl._html.includes('Gulberg'), 'second submission did not update the result');
});

check('the home search finds stops as the user types', () => {
  render('#/');
  const q = ui('q');
  q.value = 'Faiz';
  q.dispatch('input', {});
  const html = mainEl._html;
  assert(html.includes('Faizabad'), 'typing "Faiz" did not surface Faizabad');
  assert(html.includes('Faiz Ahmad Faiz'), 'typing "Faiz" did not surface Faiz Ahmad Faiz');
});

check('the home search handles a one-character query without erroring', () => {
  render('#/');
  const q = ui('q');
  q.value = 'F';
  q.dispatch('input', {});
  assert(mainEl._html.length > 100, 'a single-character search broke the page');
});

check('the home search reports no match rather than failing silently', () => {
  render('#/');
  const q = ui('q');
  q.value = 'zzzzqqqq';
  q.dispatch('input', {});
  assert(/No stop matches/i.test(mainEl._html), 'no no-match message shown');
});

/** Extract one element's inner markup, balancing nested tags properly.
 *  A non-greedy regex is not enough here: it stops at the first nested </div>
 *  and silently pulls in following content, which would make an assertion about
 *  what the list does NOT contain meaningless. */
function extractInnerById(id) {
  const start = mainEl._html.search(new RegExp('<div[^>]*\\bid="' + id + '"[^>]*>'));
  if (start === -1) return '';
  const openEnd = mainEl._html.indexOf('>', start) + 1;
  let depth = 1, i = openEnd;
  const re = /<(\/?)div\b[^>]*>/g;
  re.lastIndex = openEnd;
  let m;
  while ((m = re.exec(mainEl._html)) !== null) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return mainEl._html.slice(openEnd, m.index);
    i = re.lastIndex;
  }
  return mainEl._html.slice(openEnd);
}

/** The filtered stop list, on its own. */
function stopGroupsHtml() {
  return extractInnerById('stopGroups') || mainEl._html;
}

check('the stops filter narrows the list', () => {
  render('#/stops');
  const sf = ui('sf');
  sf.value = 'Waris';
  sf.dispatch('input', {});
  const list = stopGroupsHtml();
  assert(list.includes('Waris Khan'), 'filter did not keep the matching stop');
  // Assert against the filtered list, not the whole page: the query and its
  // result both live in #main, so a page-wide search proves very little.
  assert(!list.includes('Gulberg'), 'filter did not remove a non-matching stop');
  assert(!list.includes('Koral'), 'filter left an unrelated stop in the list');
});

check('the stops filter searches landmarks as well as names', () => {
  render('#/stops');
  const sf = ui('sf');
  sf.value = 'Expressway';
  sf.dispatch('input', {});
  const list = stopGroupsHtml();
  assert(list.includes('Koral') || list.includes('Sohan'),
    'a landmark-only search found no expressway stops');
});

check('clearing the stops filter restores the full list', () => {
  render('#/stops');
  const sf = ui('sf');
  sf.value = 'Waris';
  sf.dispatch('input', {});
  assert(!stopGroupsHtml().includes('Gulberg'), 'filter did not apply');
  sf.value = '';
  sf.dispatch('input', {});
  assert(stopGroupsHtml().includes('Gulberg'), 'clearing the filter did not restore the list');
});

/* --- theming ------------------------------------------------------------- */

check('the theme toggle switches to dark and persists the choice', () => {
  render('#/');
  ui('themeToggle').click();
  const theme = documentEl.getAttribute('data-theme');
  assert(theme === 'dark' || theme === 'light', `theme attribute is "${theme}"`);
  assert(storage['rasta.theme'] === theme, 'theme choice was not persisted');
});

/* --- report ------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed\n`);

if (failures.length) {
  console.log('FAILURES');
  console.log('-'.repeat(64));
  failures.forEach((f, i) => console.log(`${i + 1}. ${f}\n`));
  process.exit(1);
}

console.log('All views render.\n');
