/* ============================================================================
 * Build a self-contained demo gallery.
 *
 *   node demo/build-demo.js
 *
 * Embeds the captured screenshots as data URIs so demo/index.html works when
 * opened straight from disk, with no server and no broken image links.
 * ==========================================================================*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');

const STEPS = [
  {
    file: '01-home.png',
    title: '1. Home — it leads with the bad news',
    caption:
      'Service alerts come first, before anything else. The Red Line disruption reported on ' +
      '11 October 2026 sits at the top, tagged <em>unconfirmed</em> because we could only find ' +
      'one report of it and could not verify it with the operator. Each line card carries a ' +
      'warning badge, and there is a plain statement that this is not a live tracker.'
  },
  {
    file: '02-planner.png',
    title: '2. Journey planner — Saddar to the airport',
    caption:
      'The headline numbers: <strong>2 hr 48 min</strong>, <strong>Rs 90</strong>, ' +
      '<strong>1 change</strong>, 44.8 km. Then step by step: Red Line for 13 stops to ' +
      'Faiz Ahmad Faiz, change there allowing about 8 minutes, then the Orange Line for 8 stops ' +
      'to the airport. Each leg can be expanded to show its intermediate stops. At the bottom, ' +
      '<strong>Alerts on this route</strong> pulls in only the disruptions affecting the lines ' +
      'this particular journey uses — which is why the PIMS walking-transfer warning appears ' +
      'on a Saddar-to-airport trip.'
  },
  {
    file: '03-route.png',
    title: '3. Line detail — the full Red Line',
    caption:
      'All 24 stops in order down a route rail, with interchanges marked by a ring: ' +
      '<strong>Faiz Ahmad Faiz</strong> (change for the Orange Line) and <strong>PIMS</strong> ' +
      '(change for the Blue and Green Lines). The header gives 24 stops, 23.7 km, first bus ' +
      '06:15, last bus 21:00 — the earlier time, not the 22:00 still published on other sites. ' +
      'There is a reverse-direction toggle and an end-to-end planning shortcut.'
  },
  {
    file: '04-stops.png',
    title: '4. Stops — every stop, grouped by city',
    caption:
      'All 57 stops grouped into Islamabad and Rawalpindi, each showing which lines serve it. ' +
      'The filter box searches names, areas <em>and</em> landmarks, so typing "expressway" ' +
      'finds the Blue Line stops along that corridor.'
  },
  {
    file: '05-alerts.png',
    title: '5. Service alerts — all of them, worst first',
    caption:
      'Every disruption and every unresolved source conflict, sorted by severity. A ' +
      '<em>low</em>-confidence alert is required by the test suite to carry a source link, ' +
      'because an unverifiable alert that makes someone miss a bus is worse than no alert.'
  },
  {
    file: '06-info.png',
    title: '6. Info — what it cannot do',
    caption:
      'The honest page: what is covered, how confident each line is, and a "Known gaps" list ' +
      'stating outright that there is no live feed, that the Green Line stop list is disputed ' +
      'between four sources, that fares are the least reliable data, and that stop coordinates ' +
      'are approximate. A tool that hides its blind spots is worse than one that admits them.'
  }
];

function dataUri(file) {
  const buf = fs.readFileSync(path.join(SHOTS, file));
  return 'data:image/png;base64,' + buf.toString('base64');
}

const cards = STEPS.map(function (s) {
  const full = path.join(SHOTS, s.file);
  if (!fs.existsSync(full)) {
    console.warn('missing screenshot: ' + s.file);
    return '';
  }
  return (
    '<figure class="step">\n' +
    '  <figcaption>\n' +
    '    <h2>' + s.title + '</h2>\n' +
    '    <p>' + s.caption + '</p>\n' +
    '  </figcaption>\n' +
    '  <div class="shot"><img src="' + dataUri(s.file) + '" alt="' + s.title.replace(/"/g, '') + '"></div>\n' +
    '</figure>'
  );
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rasta — demo walkthrough</title>
<style>
  :root {
    --brand: #0a7d4f; --bg: #f4f6f5; --card: #fff; --ink: #14201a;
    --ink2: #4a5a52; --muted: #78877f; --line: #e2e7e4;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  }
  header {
    background: var(--brand); color: #fff; padding: 30px 22px;
  }
  header .wrap { max-width: 1000px; margin: 0 auto; }
  header h1 { margin: 0 0 6px; font-size: 1.6rem; letter-spacing: -.01em; }
  header p { margin: 0; opacity: .92; font-size: .95rem; }
  main { max-width: 1000px; margin: 0 auto; padding: 24px 22px 70px; }

  .notice {
    background: #fff6e5; border: 1px solid #f0d9a8; color: #7a5300;
    border-radius: 10px; padding: 14px 16px; font-size: .9rem; margin: 0 0 26px;
  }
  .notice strong { color: inherit; }

  .step {
    margin: 0 0 34px; background: var(--card); border: 1px solid var(--line);
    border-radius: 14px; overflow: hidden;
    box-shadow: 0 1px 2px rgba(16,32,24,.06), 0 6px 20px rgba(16,32,24,.05);
  }
  figcaption { padding: 20px 22px 18px; }
  figcaption h2 { margin: 0 0 8px; font-size: 1.12rem; }
  figcaption p { margin: 0; color: var(--ink2); font-size: .93rem; }
  .shot { background: #e9edeb; border-top: 1px solid var(--line); text-align: center; }
  .shot img { display: block; width: 100%; max-width: 430px; margin: 0 auto; height: auto; }

  .two { display: grid; gap: 34px; }
  @media (min-width: 900px) {
    .two { grid-template-columns: 1fr 1fr; }
    .two .step { margin-bottom: 0; }
  }

  .foot { color: var(--muted); font-size: .86rem; margin-top: 34px; }
  .foot code { background: var(--card); border: 1px solid var(--line); padding: 1px 6px; border-radius: 5px; }
  a { color: var(--brand); }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <h1>Rasta — رستہ</h1>
    <p>A walkthrough of the real app: Islamabad &amp; Rawalpindi Metro Bus and CDA bus routes.</p>
  </div>
</header>

<main>
  <div class="notice">
    <strong>These are real screenshots of the working app</strong>, captured from a running
    build — not mockups. They were taken in headless Chrome at phone width. Chrome's
    <code>--window-size</code> includes browser chrome, so the rendered page is a little wider
    than the captured image and some right-edge text is cropped in these pictures only; the
    layout itself measures <strong>0px horizontal overflow</strong> at 420&nbsp;px across all
    seven screens. Open <code>index.html</code> to see it uncropped.
  </div>

  ${cards}

  <p class="foot">
    Rasta is not a live bus tracker and cannot be one: no GTFS feed, no real-time API and no
    open data portal exists for these services. Journey times are modelled from distance, and
    disputed information is labelled rather than hidden. See <code>README.md</code>.
  </p>
</main>
</body>
</html>
`;

const outFile = path.join(__dirname, 'index.html');
fs.writeFileSync(outFile, html, 'utf8');
console.log('wrote ' + outFile + '  (' + Math.round(fs.statSync(outFile).size / 1024) + ' KB, self-contained)');
