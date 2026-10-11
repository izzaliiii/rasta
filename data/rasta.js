/* ============================================================================
 * Rasta — data layer
 * Loads window.RASTA_DATA, indexes it, and exposes query + journey planning.
 * No framework, no dependencies. Everything here is pure/synchronous.
 * ==========================================================================*/

var Rasta = (function () {
  'use strict';

  var D = window.RASTA_DATA;
  if (!D) {
    throw new Error('Rasta: data/transit-data.js must load before rasta.js');
  }

  var META = D.meta;
  var STATIONS = D.stations;
  var LINES = D.lines;
  var SERVICE_ALERTS = D.serviceAlerts || [];

  /* ------------------------------------------------------------------ utils */

  function haversineKm(a, b) {
    if (!a || !b) return null;
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (b[0] - a[0]) * toRad;
    var dLon = (b[1] - a[1]) * toRad;
    var la1 = a[0] * toRad, la2 = b[0] * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** Straight-line distance underestimates road distance; apply a detour factor. */
  var ROAD_DETOUR_FACTOR = 1.25;

  function legKm(fromId, toId) {
    var straight = haversineKm(coordOf(fromId), coordOf(toId));
    return straight === null ? null : straight * ROAD_DETOUR_FACTOR;
  }

  function coordOf(id) {
    var s = STATIONS[id];
    return s && s.coord ? s.coord : null;
  }

  function minutesForKm(km) {
    return (km / META.averageSpeedKmph) * 60;
  }

  function stationName(id) {
    return STATIONS[id] ? STATIONS[id].name : id;
  }

  /* ---------------------------------------------------------------- indexes */

  var lineById = {};
  LINES.forEach(function (l) { lineById[l.id] = l; });

  /** station id -> array of { line, index } positions on that line. */
  var stationIndex = {};
  LINES.forEach(function (line) {
    line.stations.forEach(function (sid, idx) {
      if (!stationIndex[sid]) stationIndex[sid] = [];
      stationIndex[sid].push({ line: line, index: idx });
    });
  });

  /** Every station id that actually appears on at least one line. */
  var servedIds = Object.keys(stationIndex).filter(function (id) {
    return stationIndex[id].length > 0;
  });

  /* ------------------------------------------------------------------- fare */

  /**
   * Fare for one continuous ride on one line.
   * Flat fares ignore distance; distance fares are scaled from the published
   * base amount using the line's shortest and longest possible trips.
   */
  function fareForLeg(line, fromId, toId) {
    var f = line.fare;
    if (!f) return null;
    if (f.type === 'flat') return { amount: f.amountPkr, note: f.note, exact: f.confidence === 'high' };

    var km = legKm(fromId, toId);
    if (km === null) return { amount: f.amountPkr, note: f.note + ' (distance unknown; base fare shown)', exact: false };

    var total = totalLineKm(line);
    if (!total) return { amount: f.amountPkr, note: f.note, exact: false };

    var span = (f.maxPkr || f.amountPkr * 2) - f.amountPkr;
    var amount = Math.round((f.amountPkr + span * (km / total)) / 5) * 5;
    return { amount: amount, note: 'Estimated from distance', exact: false };
  }

  var _lineKmCache = {};
  function totalLineKm(line) {
    if (_lineKmCache[line.id] !== undefined) return _lineKmCache[line.id];
    var total = 0;
    for (var i = 1; i < line.stations.length; i++) {
      total += legKm(line.stations[i - 1], line.stations[i]) || 0;
    }
    _lineKmCache[line.id] = total;
    return total;
  }

  /* ------------------------------------------------------------ journey plan */

  /**
   * Build an adjacency graph over stations. Edges only connect ADJACENT stops
   * on the same line, which is what makes a shortest-path search produce
   * realistic "stay on this bus" results instead of teleporting between
   * distant stations that merely happen to share a line.
   */
  function buildGraph() {
    var graph = {};
    servedIds.forEach(function (id) { graph[id] = []; });

    LINES.forEach(function (line) {
      for (var i = 1; i < line.stations.length; i++) {
        var a = line.stations[i - 1], b = line.stations[i];
        var km = legKm(a, b);
        var cost = km === null
          ? META.dwellMinutes + 3
          : minutesForKm(km) + META.dwellMinutes;

        graph[a].push({ to: b, lineId: line.id, minutes: cost, km: km });
        graph[b].push({ to: a, lineId: line.id, minutes: cost, km: km });
      }
    });
    return graph;
  }

  var GRAPH = buildGraph();

  /**
   * Dijkstra with a transfer penalty. Cost of a path = travel time + dwell,
   * plus META.transferPenaltyMin every time the line changes. Returns the
   * cheapest path by that measure, not by stop count.
   */
  function planJourney(fromId, toId) {
    if (!STATIONS[fromId] || !STATIONS[toId]) {
      return { ok: false, reason: 'unknown-station' };
    }
    if (fromId === toId) {
      return { ok: false, reason: 'same-station' };
    }
    if (!GRAPH[fromId] || !GRAPH[toId]) {
      return { ok: false, reason: 'unserved' };
    }

    var dist = {}, prev = {}, visited = {};
    dist[fromId] = 0;

    // Small networks: simple linear scan for the nearest unvisited node is
    // faster in practice than maintaining a heap.
    for (;;) {
      var u = null, best = Infinity;
      for (var id in dist) {
        if (!visited[id] && dist[id] < best) { best = dist[id]; u = id; }
      }
      if (u === null) break;
      if (u === toId) break;
      visited[u] = true;

      GRAPH[u].forEach(function (edge) {
        var extra = 0;
        var p = prev[u];
        if (p && p.lineId !== edge.lineId) extra = META.transferPenaltyMin;

        var nd = dist[u] + edge.minutes + extra;
        if (dist[edge.to] === undefined || nd < dist[edge.to]) {
          dist[edge.to] = nd;
          // `to` must be stored, not inferred: the predecessor chain is walked
          // backwards from the destination, so each hop has to name its target.
          prev[edge.to] = {
            from: u, to: edge.to, lineId: edge.lineId,
            minutes: edge.minutes, km: edge.km, transferMin: extra
          };
        }
      });
    }

    if (dist[toId] === undefined) {
      return { ok: false, reason: 'no-route' };
    }

    // Walk the predecessor chain backwards, then reverse it.
    var hops = [];
    var cur = toId;
    while (cur !== fromId) {
      var step = prev[cur];
      if (!step) return { ok: false, reason: 'no-route' };
      hops.push(step);
      cur = step.from;
    }
    hops.reverse();

    /* Collapse hops into legs, one per continuous ride on a single line. */
    var legs = [];
    var nodeIds = [fromId].concat(hops.map(function (h) { return h.to; }));
    hops.forEach(function (hop, i) {
      var stopId = nodeIds[i + 1];
      var last = legs[legs.length - 1];
      if (last && last.lineId === hop.lineId) {
        last.stationIds.push(stopId);
        last.minutes += hop.minutes;
        last.km += hop.km || 0;
      } else {
        legs.push({
          lineId: hop.lineId,
          stationIds: [nodeIds[i], stopId],
          minutes: hop.minutes,
          km: hop.km || 0,
          transferMin: hop.transferMin || 0
        });
      }
    });

    var totalMinutes = legs.reduce(function (a, l) { return a + l.minutes + l.transferMin; }, 0);
    var totalKm = legs.reduce(function (a, l) { return a + l.km; }, 0);

    var fareTotal = 0, fareExact = true, fareNotes = [];
    legs.forEach(function (leg) {
      var f = fareForLeg(lineById[leg.lineId], leg.stationIds[0], leg.stationIds[leg.stationIds.length - 1]);
      if (f) {
        fareTotal += f.amount;
        if (!f.exact) fareExact = false;
        if (f.note) fareNotes.push(f.note);
      }
    });

    return {
      ok: true,
      from: fromId,
      to: toId,
      legs: legs.map(function (l) {
        return {
          lineId: l.lineId,
          lineName: lineById[l.lineId].name,
          color: lineById[l.lineId].color,
          stationIds: l.stationIds,
          stops: l.stationIds.length - 1,
          minutes: Math.round(l.minutes),
          km: Math.round(l.km * 10) / 10,
          transferMin: l.transferMin,
          direction: stationName(l.stationIds[0]) + ' to ' + stationName(l.stationIds[l.stationIds.length - 1])
        };
      }),
      changes: legs.length - 1,
      totalMinutes: Math.round(totalMinutes),
      totalKm: Math.round(totalKm * 10) / 10,
      fare: fareExact ? fareTotal : null,
      fareEstimate: fareTotal,
      fareExact: fareExact,
      fareNotes: fareNotes
    };
  }

  /* -------------------------------------------------------------- searching */

  function normalise(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Rank stations against a free-text query. Name match beats area beats landmark. */
  function searchStations(query, limit) {
    var q = normalise(query);
    if (!q) return [];
    var terms = q.split(' ');

    var scored = servedIds.map(function (id) {
      var s = STATIONS[id];
      var name = normalise(s.name);
      var area = normalise(s.area);
      var landm = normalise(s.landm);
      var city = normalise(s.city);
      var haystack = name + ' ' + area + ' ' + landm + ' ' + city;

      var ok = terms.every(function (t) { return haystack.indexOf(t) !== -1; });
      if (!ok) return null;

      var score = 0;
      if (name === q) score += 100;
      if (name.indexOf(q) === 0) score += 60;
      if (name.indexOf(q) !== -1) score += 40;
      if (area.indexOf(q) !== -1) score += 20;
      if (landm.indexOf(q) !== -1) score += 10;
      score -= name.length * 0.1;
      return { id: id, station: s, score: score };
    }).filter(Boolean);

    scored.sort(function (a, b) { return b.score - a.score; });
    return limit ? scored.slice(0, limit) : scored;
  }

  function linesAtStation(id) {
    return (stationIndex[id] || []).map(function (p) { return p.line; });
  }

  /* ---------------------------------------------------------- data freshness
   *
   * This app ships a FROZEN snapshot. Nothing here updates itself: there is no
   * feed to poll and no API to call. That is a deliberate consequence of no
   * machine-readable data existing for these services — but it means the app
   * will keep answering confidently long after the answer stops being true.
   *
   * A stale transit app fails silently and dangerously: it will show a last-bus
   * time that no longer runs and give no hint that anything is wrong. So the
   * age of the data is computed and surfaced rather than left implicit.
   */

  /** Data older than this is no longer safe to treat as current. */
  var STALE_AFTER_DAYS = 120;

  /** Whole days between the dataset's date and `now`. Negative if future-dated. */
  function dataAgeDays(now) {
    var asOf = META.dataAsOf;
    if (!asOf) return null;
    var then = Date.parse(asOf + 'T00:00:00');
    if (isNaN(then)) return null;
    var ref = now ? now.getTime() : Date.now();
    return Math.floor((ref - then) / 86400000);
  }

  /**
   * Freshness verdict for the UI.
   * `level` is one of: fresh | ageing | stale | unknown.
   */
  function freshness(now) {
    var days = dataAgeDays(now);
    if (days === null) return { level: 'unknown', days: null, message: 'Data date unknown.' };

    if (days < 0) {
      return {
        level: 'fresh', days: days,
        message: 'Dataset is dated in the future (' + META.dataAsOf + '). Check the system clock.'
      };
    }
    if (days <= 45) {
      return {
        level: 'fresh', days: days,
        message: 'Data is current as of ' + META.dataAsOf + ' (' + days + ' days old).'
      };
    }
    if (days <= STALE_AFTER_DAYS) {
      return {
        level: 'ageing', days: days,
        message: 'Data was last checked on ' + META.dataAsOf + ', ' + days +
                 ' days ago. Routes and fares may have changed since.'
      };
    }
    return {
      level: 'stale', days: days,
      message: 'This data is ' + days + ' days old and is likely out of date. Treat ' +
               'routes, fares and especially last-bus times as unreliable until it is ' +
               'refreshed.'
    };
  }

  /* --------------------------------------------------------------- alerts */

  /* Severity rank. Must be looked up defensively: `rank[x] || 9` would map a
     legitimate rank of 0 ("high") to 9 and sort the worst alerts last. An
     unknown severity still sorts to the end via a nullish fallback. */
  var SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

  function severityRank(severity) {
    var r = SEVERITY_RANK[severity];
    return r === undefined ? 9 : r;
  }

  /** Stable worst-first ordering, preserving source order within a severity. */
  function bySeverity(a, b) {
    var d = severityRank(a.severity) - severityRank(b.severity);
    if (d !== 0) return d;
    return (a._order || 0) - (b._order || 0);
  }

  /** Alerts affecting a given line, worst severity first. */
  function alertsForLine(lineId) {
    return SERVICE_ALERTS
      .map(function (a, i) { a._order = i; return a; })
      .filter(function (a) { return (a.lineIds || []).indexOf(lineId) !== -1; })
      .sort(bySeverity);
  }

  /**
   * Alerts relevant to a journey: anything touching a line the plan uses.
   * The planner must tell people about disruptions on the route it just
   * suggested, otherwise a correct plan can still strand them.
   */
  function alertsForJourney(plan) {
    if (!plan || !plan.ok) return [];
    var seen = {}, out = [];
    plan.legs.forEach(function (leg) {
      alertsForLine(leg.lineId).forEach(function (a) {
        if (!seen[a.id]) { seen[a.id] = true; out.push(a); }
      });
    });
    return out.sort(bySeverity);
  }

  /** Alerts worth interrupting the user about on the home screen. */
  function activeAlerts() {
    return SERVICE_ALERTS
      .map(function (a, i) { a._order = i; return a; })
      .sort(bySeverity);
  }

  /** Human direction label for travelling from `from` to `to` along `line`. */
  function directionFor(line, fromId, toId) {
    var i = line.stations.indexOf(fromId);
    var j = line.stations.indexOf(toId);
    if (i === -1 || j === -1) return null;
    return j > i
      ? 'Towards ' + stationName(line.to)
      : 'Towards ' + stationName(line.from);
  }

  /* ------------------------------------------------------------------ public */

  return {
    meta: META,
    stations: STATIONS,
    lines: LINES,
    serviceAlerts: SERVICE_ALERTS,
    lineById: lineById,
    servedIds: servedIds,
    stationName: stationName,
    coordOf: coordOf,
    legKm: legKm,
    totalLineKm: totalLineKm,
    fareForLeg: fareForLeg,
    planJourney: planJourney,
    searchStations: searchStations,
    linesAtStation: linesAtStation,
    alertsForLine: alertsForLine,
    alertsForJourney: alertsForJourney,
    activeAlerts: activeAlerts,
    dataAgeDays: dataAgeDays,
    freshness: freshness,
    staleAfterDays: STALE_AFTER_DAYS,
    directionFor: directionFor,
    normalise: normalise
  };
})();
