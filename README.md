# Rasta — رستہ

Route, stop, timing and fare information for the government-run bus services of
**Islamabad and Rawalpindi**: the Metro Bus Red Line and the CDA Orange, Blue and
Green Lines.

Zero build step. No framework. No dependencies. No server required.

---

## Open it

Double-click **`index.html`**. That is the whole install.

It works straight off the disk because the dataset ships as plain JavaScript
(`data/transit-data.js`) rather than JSON — `fetch()` on a local file is blocked
by the browser, and this avoids that entirely. There is nothing to compile and
nothing to `npm install`.

### Put it on a phone

Serve the folder over HTTP and open it in a mobile browser, then *Add to Home
screen*. It installs as an app, and a service worker caches the shell so it
reloads with no connection at all — useful when you are out of data.

```sh
node serve.js          # prints a localhost URL and your phone-accessible LAN URL
```

The service worker only registers over `http(s)`. Opening `index.html` directly
skips it — which is fine, because the dataset is a local file either way, so
routes, stops and journey planning work with no internet in both cases.

---

## What it does

| Screen | What it gives you |
|---|---|
| **Home** | Data-age warning when stale, service alerts, then stop search and the line list |
| **Lines** | All four lines with length, span, frequency and fare |
| **Line detail** | Every stop in order, with interchanges marked and a reverse-direction toggle |
| **Plan** | Pick two stops; get the lines to take, where to change, estimated time and fare |
| **Stops** | Every stop by city, with search that also matches landmarks and areas |
| **Info** | How current the data is, data confidence, known gaps, sources and the disclaimer |

Journey planning is a shortest-path search across the stop graph. It scores a
route by travel time plus an 8-minute penalty every time you change lines, so it
prefers a slower direct bus over a fast connection if the change is not worth it.
Fares are charged **per leg** — changing lines means paying again.

Dark mode follows your system setting and can be overridden with the ◐ button.
Every screen has its own URL (`#/plan?from=saddar&to=airport`), so journeys are
shareable and the back button works.

---

## Read this before trusting it

**The data is a frozen snapshot. It does not update itself.**

There is nothing to poll and no API to call, because no machine-readable feed
exists for these services. Routes, fares and timings change only when someone
edits `data/transit-data.js` and commits it. That is a real limitation, and the
app is built to be loud about it rather than quietly wrong: once the dataset
passes **120 days** old, the home screen shows an "out of date" warning above
everything else, and the Info screen always states the data's age.

A stale transit app fails silently — it keeps showing a last-bus time that no
longer runs. That is worse than showing nothing, so the age of the data is
computed and surfaced at all times.

You can see the warning without waiting 120 days:

```sh
node serve.js
# then open http://localhost:8080/index.html?now=2027-12-20#/
```

The `?now=` parameter shifts the clock for demonstration only.

**Rasta is not a live bus tracker, and it cannot be one yet.**

No GTFS feed, no GTFS-Realtime, no SIRI, no vehicle-position endpoint and no
arrival-prediction API exists for these services. This was checked properly:

- `data.gov.pk` is a dead 404.
- The Mobility Database has **no Pakistani feed at all**.
- GitHub search for `gtfs pakistan` returns **zero results**.
- Moovit covers Lahore and Karachi but not the twin cities — consistent with no
  feed existing, since Moovit ingests published feeds.
- Live positions do exist, but they sit inside a proprietary vendor backend
  (Kentkart, behind the official CDA app) and are not published or licensed.

So the app shows **published routes and scheduled service windows**, and says so
on every screen that could mislead. If a live feed ever appears, the data layer
is ready to consume it.

### Other honest limits

- **Journey times are modelled, not measured.** They come from straight-line
  distance between hand-placed coordinates × a 1.25 road-detour factor, at an
  assumed 18 km/h, plus 0.5 min per stop and 8 min per change. That speed is
  deliberately conservative.
- **Fares change constantly** and some are unconfirmed. Fares are the least
  reliable part of the dataset.
- **Sources disagree about the Green Line.** Four sources give four different
  stop lists, from 9 to 12 stops. Disputed stops are marked low confidence.
- **Changing at PIMS means a walk.** The Red Line calls at "PIMS" while the Blue
  and Green Lines call at a separate nearby stop. No surveyed walking distance
  exists, so the transfer time is a guess.
- **Feeder routes and the CDA Electric Bus Service are not included yet.** That
  is the biggest gap for journeys that do not start on a BRT corridor.

Every line and stop carries a confidence badge (`high` / `medium` / `low`), and
the Info screen lists all known gaps. Nothing is silently guessed.

---

## Data sources

| Source | Used for |
|---|---|
| [Rawalpindi–Islamabad Metrobus (Wikipedia)](https://en.wikipedia.org/wiki/Rawalpindi%E2%80%93Islamabad_Metrobus) and its [route diagram](https://en.wikipedia.org/wiki/Template:Rawalpindi-Islamabad_Metrobus) | Line membership and stop order |
| [Punjab Mass Transit Authority](https://pma.punjab.gov.pk/) — operating hours and fare policy | Operating window, fare |
| [Punjab Transport Department](https://transport.punjab.gov.pk/metro_bus_services) | Operator and route confirmation |
| [Safar](https://www.safar.fyi/islamabad) | Cross-checking route counts and fares *(reference only — all rights reserved, not ingested)* |
| [Daily Ausaf](https://dailyausaf.com/en/pakistan/metro-bus-service-suspended-at-9-pm/) | Service reduction reporting |
| [OpenStreetMap](https://www.openstreetmap.org/) | Reference for the corridor geography |

Some of this data was **verified against sources but the coordinates are ours**:
hand-placed points on the road corridor, not surveyed platform positions and not
imported from OSM. So no ODbL obligation attaches to this dataset. If you later
import OSM geometry, you must credit "© OpenStreetMap contributors" and release
the derived database under ODbL — it is share-alike.

Rasta is an independent community project. It is not affiliated with CDA, the
Capital Mass Transit Authority or the Punjab Mass Transit Authority.

---

## Project layout

```
rasta/
├── index.html                 app shell
├── styles.css                 all styling, light + dark
├── app.js                     router and views
├── sw.js                      service worker (offline caching over http)
├── manifest.webmanifest       install-to-home-screen
├── serve.js                   dependency-free static server for testing
├── data/
│   ├── transit-data.js        THE DATASET — edit this to fix data
│   └── rasta.js               indexes, search, fare maths, journey planner
├── demo/
│   ├── index.html             self-contained screenshot walkthrough
│   ├── build-demo.js          regenerates demo/index.html from the screenshots
│   └── shots/                 the captured screens
└── tests/
    ├── all.js                 run everything
    ├── run-tests.js           data integrity, planner, freshness (46 checks)
    ├── calibrate.js           are the coordinates geographically sane?
    └── render-test.js         every view renders + controls work (44 checks)
```

---

## Licence

**Code** (everything except `data/` and `demo/shots/`) is MIT — see `LICENSE`.

**Dataset** (`data/transit-data.js`) is a compilation of facts about a public
transport network. Route topology and stop names were sourced from the Wikimedia
article *Rawalpindi–Islamabad Metrobus*, which is licensed **CC BY-SA 4.0**, so
that portion carries the same share-alike terms — credit it and keep any
derivative under a compatible licence. Coordinates are original work and
approximate.

**Screenshots** in `demo/shots/` depict the app itself and inherit the code
licence.

---

## Tests

```sh
node tests/all.js
```

Three suites, all dependency-free:

**`run-tests.js`** — 46 checks over the dataset and planner. Structural integrity
(no duplicate ids, no orphan stations, no two stops sharing a coordinate),
network connectivity (every stop reachable from every other), planner correctness
(legs are contiguous runs on real lines, adjacent legs never repeat a line,
transfers are actually charged), edge cases (same origin, unknown stop, nonsense
input), the alert channel, and data freshness (the age calculation must escalate
from fresh to ageing to stale at the right thresholds, because a snapshot that
never admits its age is dangerous).

**`calibrate.js`** — measures each line the way the app does and compares it to
the operator's published corridor length. The Red Line is published at ~22.5 km
and measures ~23.6 km. It also flags any single hop over 12 km and any implied
speed outside a believable 8–45 km/h band.

**`render-test.js`** — 44 checks. Loads the real `app.js` against a minimal DOM
and renders every route, then drives the controls: types two stops and submits,
swaps endpoints, filters the stop list, toggles the theme. It also fakes the
system clock to prove the staleness warning actually reaches the screen at 60
and 400 days, rather than only computing the right answer internally.

These have already earned their keep. They caught a missing field in the journey
planner's predecessor chain, three false interchange claims, a severity sort
where `|| 9` made the worst alerts sort last, and the fact that every line's
coordinates were stretched badly enough to nearly double the Red Line's length.

---

## Fixing or updating the data

Edit `data/transit-data.js`, then run `node tests/all.js`. The file is commented
throughout and structured so that:

- `STATIONS` holds each stop once, keyed by id, with `coord`, `city`, `area`,
  `interchange` and a `confidence` level.
- `LINES` holds an **ordered** list of station ids from `from` to `to`. The
  reverse direction is the same list walked backwards; never duplicate it.
- `SERVICE_ALERTS` holds disruptions and unresolved source conflicts, each with
  a date, a severity and a confidence. A `low`-confidence alert **must** carry a
  source URL — a test enforces that, because an unverifiable alert that makes
  someone miss a bus is worse than no alert.

Two tests will fight you if you get this wrong, which is the point: interchange
flags must match the lines that actually serve a station, and `from`/`to` must
match the ends of the station sequence.

### Highest-value next steps

1. **Add the CDA feeder routes, the Electric Bus Service and the airport express.**
   The official stop lists and timings are published as PDFs by CDA, and there is
   a community-parsed CSV of them. That needs geocoding, which is the real work.
2. **Fix the Green Line.** Get one authoritative stop list and settle the
   9-vs-12-stop disagreement.
3. **Confirm the fares,** especially the Blue and Green Lines and the current
   status of the reported Red Line section suspension.
4. **Replace the modelled timings** with measured segment times, if you can find
   or collect them.
