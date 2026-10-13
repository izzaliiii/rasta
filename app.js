/* ============================================================================
 * Rasta | app shell, router and views
 * Hash routing so every screen is shareable and back/forward works.
 * Views return HTML strings; anything interactive is wired up by the view's
 * own `mount` function after the HTML lands in the DOM.
 * ==========================================================================*/

(function () {
  'use strict';

  var main = document.getElementById('main');
  var tabbar = document.querySelector('.tabbar');

  /* ------------------------------------------------------------------ utils */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function linePill(line, extraClass) {
    return '<span class="pill pill-line ' + (extraClass || '') + '" style="background:' +
      esc(line.color) + ';color:' + esc(line.textOnColor || '#fff') + '">' + esc(line.shortName) + '</span>';
  }

  function confBadge(level) {
    if (!level) return '';
    return '<span class="badge-conf conf-' + esc(level) + '" title="How well this information is verified">' +
      esc(level) + '</span>';
  }

  function lineDots(stationId) {
    return Rasta.linesAtStation(stationId).map(function (l) {
      return '<span class="dot" style="background:' + esc(l.color) + '" title="' + esc(l.name) + '"></span>';
    }).join(' ');
  }

  /* ---------------------------------------------------------------- alerts */

  function severityLabel(s) {
    return s === 'high' ? 'Service disruption' : s === 'medium' ? 'Check before travel' : 'Note';
  }

  function freshnessLabel(level) {
    if (level === 'fresh') return 'Current';
    if (level === 'ageing') return 'Ageing: verify before relying on it';
    if (level === 'stale') return 'Out of date: do not rely on it';
    return 'Unknown';
  }

  function alertCard(a) {
    return '<div class="alert alert-' + esc(a.severity) + '">' +
      '<div class="alert-head">' +
        '<span class="alert-tag">' + esc(severityLabel(a.severity)) + '</span>' +
        '<span class="alert-date">' + esc(a.date) + '</span>' +
        (a.confidence === 'low' ? '<span class="alert-unconf">unconfirmed</span>' : '') +
      '</div>' +
      '<h3 class="alert-title">' + esc(a.title) + '</h3>' +
      '<p class="alert-body">' + esc(a.body) + '</p>' +
      (a.source
        ? '<p class="alert-src"><a href="' + esc(a.source) + '" target="_blank" rel="noopener noreferrer nofollow">Source</a></p>'
        : '') +
    '</div>';
  }

  function alertBanner(limit) {
    var list = Rasta.activeAlerts();
    if (!list.length) return '';
    var shown = limit ? list.slice(0, limit) : list;
    return '<div class="section-head" style="margin-top:0"><h2>Service alerts</h2>' +
      '<p>Things that may affect travel right now.</p></div>' +
      shown.map(alertCard).join('') +
      (limit && list.length > limit
        ? '<p style="margin:-4px 0 14px"><a href="#/alerts">See all ' + list.length + ' alerts</a></p>'
        : '');
  }

  /** Small marker shown on a line card when that line has alerts. */
  function alertBadge(lineId) {
    var n = Rasta.alertsForLine(lineId).length;
    if (!n) return '';
    var worst = Rasta.alertsForLine(lineId)[0];
    return '<span class="pill alert-pill alert-pill-' + esc(worst.severity) + '">' +
      (worst.severity === 'high' ? 'Disruption' : n + (n === 1 ? ' alert' : ' alerts')) +
      '</span>';
  }

  /**
   * Freshness notice. Only rendered once the data is old enough to mislead : * a permanent banner just trains people to ignore it. The whole point is
   * that a stale transit app fails silently, so this has to shout when it is.
   */
  function freshnessNotice() {
    var f = Rasta.freshness();
    if (f.level === 'fresh' || f.level === 'unknown') return '';
    var tone = f.level === 'stale' ? 'high' : 'medium';
    var title = f.level === 'stale'
      ? 'This data is out of date'
      : 'Data may be out of date';
    return '<div class="alert alert-' + tone + '">' +
      '<div class="alert-head">' +
        '<span class="alert-tag">' + esc(title) + '</span>' +
        '<span class="alert-date">as of ' + esc(Rasta.meta.dataAsOf) + '</span>' +
      '</div>' +
      '<p class="alert-body" style="margin-bottom:0">' + esc(f.message) + '</p>' +
    '</div>';
  }

  function stopsLabel(n) { return n + (n === 1 ? ' stop' : ' stops'); }

  function minsLabel(m) {
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + ' hr ' + r + ' min' : h + ' hr';
  }

  function money(n) { return 'Rs ' + n; }

  function parseHash() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var qIdx = raw.indexOf('?');
    var path = qIdx === -1 ? raw : raw.slice(0, qIdx);
    var query = {};
    if (qIdx !== -1) {
      raw.slice(qIdx + 1).split('&').forEach(function (pair) {
        if (!pair) return;
        var i = pair.indexOf('=');
        var k = decodeURIComponent(i === -1 ? pair : pair.slice(0, i));
        var v = i === -1 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
        query[k] = v;
      });
    }
    return { path: path.replace(/\/+$/, '') || '/', query: query };
  }

  /* Search across ALL known stations, not only served ones, so a station that
     is in the dataset but missing from a line sequence still resolves. */
  function resolveStation(text) {
    var q = Rasta.normalise(text);
    if (!q) return null;
    var ids = Rasta.servedIds;
    var i, s;
    for (i = 0; i < ids.length; i++) {
      s = Rasta.stations[ids[i]];
      if (Rasta.normalise(s.name) === q) return ids[i];
    }
    for (i = 0; i < ids.length; i++) {
      s = Rasta.stations[ids[i]];
      if (Rasta.normalise(s.area) === q) return ids[i];
    }
    var hits = Rasta.searchStations(text, 1);
    return hits.length ? hits[0].id : null;
  }

  /* =================================================================== HOME */

  var homeView = {
    title: 'Rasta | Islamabad & Rawalpindi bus routes',
    html: function () {
      var totalStops = Rasta.servedIds.length;
      var interchangeStops = Rasta.servedIds.filter(function (id) {
        return Rasta.linesAtStation(id).length > 1;
      });

      var lineCards = Rasta.lines.map(function (l) {
        return '<a class="list-link" href="#/route/' + esc(l.id) + '">' +
          '<span class="dot dot-lg" style="background:' + esc(l.color) + '"></span>' +
          '<span class="grow">' +
            '<span class="ttl">' + esc(l.shortName) + '</span>' +
            '<span class="sub">' + esc(Rasta.stationName(l.from)) + ' ↔ ' + esc(Rasta.stationName(l.to)) +
              ', ' + stopsLabel(l.stations.length) + '</span>' +
          '</span>' +
          alertBadge(l.id) +
          '<span class="chev" aria-hidden="true">›</span>' +
        '</a>';
      }).join('');

      return '' +
        freshnessNotice() +
        alertBanner(2) +

        '<div class="card">' +
          '<h1>Getting around the twin cities</h1>' +
          '<p style="color:var(--ink-2)">Routes, stops, timings and fares for the Metro Bus Red Line and the CDA Orange, Blue and Green Lines.</p>' +
          '<div class="search-wrap">' +
            '<label class="field" for="q" style="margin-bottom:8px"><span class="lbl">Find a stop or area</span></label>' +
            '<input type="search" id="q" placeholder="Try Faizabad, PIMS, NUST, airport..." autocomplete="off" enterkeyhint="search">' +
            '<button class="search-clear" id="qClear" type="button" aria-label="Clear search" hidden>&times;</button>' +
          '</div>' +
          '<div id="qResults" aria-live="polite"></div>' +
        '</div>' +

        '<div class="notice notice-warn" style="margin-bottom:14px">' +
          '<strong>Not a live tracker.</strong> These are published routes and scheduled service windows. ' +
          'Real bus positions are not available to us, so treat every time as an estimate. ' +
          '<a href="#/info">Read more</a>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>Plan a journey</h2></div>' +
          '<p style="color:var(--ink-2);font-size:.9rem">Pick where you are and where you are going. Rasta works out which lines to take, where to change, and roughly how long it takes.</p>' +
          '<div class="row wrap"><a class="btn btn-primary" href="#/plan" style="flex:1;text-align:center;text-decoration:none">Plan a journey</a>' +
          '<a class="btn" href="#/map" style="flex:1;text-align:center;text-decoration:none">Explore route map</a></div>' +
        '</div>' +

        '<div class="section-head"><h2>Network</h2><p>' + Rasta.lines.length + ' lines, ' + totalStops +
          ' stops, ' + interchangeStops.length + ' interchange points</p></div>' +

        '<div class="card" style="padding:4px 16px"><ul class="list">' + lineCards + '</ul></div>' +

        '<div class="card">' +
          '<div class="card-title"><h3>Popular interchanges</h3></div>' +
          '<p style="font-size:.86rem;color:var(--muted);margin-bottom:10px">Change here to move between lines.</p>' +
          '<ul class="list">' +
            interchangeStops.slice(0, 8).map(function (id) {
              var s = Rasta.stations[id];
              return '<li><a class="list-link" href="#/stop/' + esc(id) + '">' +
                '<span class="grow"><span class="ttl">' + esc(s.name) + '</span>' +
                '<span class="sub">' + esc(s.area) + ', ' + esc(s.city) + '</span></span>' +
                '<span style="display:flex;gap:4px">' + lineDots(id) + '</span></a></li>';
            }).join('') +
          '</ul>' +
        '</div>';
    },
    mount: function () {
      var input = document.getElementById('q');
      var clear = document.getElementById('qClear');
      var out = document.getElementById('qResults');

      function run() {
        var v = input.value.trim();
        clear.hidden = !v;
        if (v.length < 2) { out.innerHTML = ''; return; }
        var hits = Rasta.searchStations(v, 6);
        if (!hits.length) {
          out.innerHTML = '<p class="empty" style="padding:12px 0">No stop matches “' + esc(v) + '”.</p>';
          return;
        }
        out.innerHTML = '<ul class="list">' + hits.map(function (h) {
          var s = h.station;
          return '<li><a class="list-link" href="#/stop/' + esc(h.id) + '">' +
            '<span class="grow"><span class="ttl">' + esc(s.name) + '</span>' +
            '<span class="sub">' + esc(s.area) + ', ' + esc(s.city) + '</span></span>' +
            '<span style="display:flex;gap:4px">' + lineDots(h.id) + '</span></a></li>';
        }).join('') + '</ul>';
      }

      input.addEventListener('input', run);
      clear.addEventListener('click', function () {
        input.value = ''; run(); input.focus();
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var hits = Rasta.searchStations(input.value, 1);
          if (hits.length) location.hash = '#/stop/' + hits[0].id;
        }
      });
    }
  };

  /* ================================================================= ROUTES */

  var routesView = {
    title: 'All lines | Rasta',
    html: function () {
      return '<div class="section-head" style="margin-top:0"><h1>Lines</h1>' +
        '<p>Tap a line for its full stop sequence and timings.</p></div>' +
        Rasta.lines.map(function (l) {
          var km = Math.round(Rasta.totalLineKm(l) * 10) / 10;
          return '<div class="card" style="border-left:5px solid ' + esc(l.color) + '">' +
            '<div class="row-between wrap" style="margin-bottom:6px">' +
              '<div class="row">' + linePill(l) + confBadge(l.confidence) + '</div>' +
            '</div>' +
            '<h2 style="margin-bottom:4px">' + esc(l.name) + '</h2>' +
            '<p style="color:var(--ink-2);font-size:.9rem;margin-bottom:8px">' +
              esc(Rasta.stationName(l.from)) + ' ↔ ' + esc(Rasta.stationName(l.to)) + '</p>' +
            '<div class="leg-stats" style="margin:0 0 12px">' +
              '<span><b>' + l.stations.length + '</b> stops</span>' +
              '<span><b>' + (km || 'n/a') + '</b> km</span>' +
              '<span><b>' + esc(l.timings.firstDeparture) + '-' + esc(l.timings.lastDeparture) + '</b></span>' +
              '<span>every <b>' + l.timings.peakHeadwayMin + '</b> min peak</span>' +
              '<span>fare <b>' + (l.fare ? money(l.fare.amountPkr) : 'n/a') + '</b></span>' +
            '</div>' +
            '<a class="btn btn-primary btn-sm" href="#/route/' + esc(l.id) + '">View route</a>' +
          '</div>';
        }).join('');
    }
  };

  /* ================================================================ MAP */

  var mapView = {
    title: 'Route map — Rasta',
    html: function (params, query) {
      var selected = Rasta.lineById[query.line] || null;
      var ids = selected ? selected.stations.slice() : Rasta.servedIds.slice();
      var coords = ids.map(function (id) { return Rasta.stations[id].coord; });
      var lats = coords.map(function (c) { return c[0]; });
      var lons = coords.map(function (c) { return c[1]; });
      var minLat = Math.min.apply(Math, lats), maxLat = Math.max.apply(Math, lats);
      var minLon = Math.min.apply(Math, lons), maxLon = Math.max.apply(Math, lons);
      function point(id) {
        var c = Rasta.stations[id].coord;
        return { x: 34 + (c[1] - minLon) / (maxLon - minLon || 1) * 632,
          y: 30 + (maxLat - c[0]) / (maxLat - minLat || 1) * 450 };
      }
      var lines = (selected ? [selected] : Rasta.lines).map(function (line) {
        var d = line.stations.map(function (id, i) {
          var p = point(id); return (i ? 'L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
        }).join(' ');
        return '<path class="map-line" d="' + d + '" stroke="' + esc(line.color) + '"/>';
      }).join('');
      var stops = ids.map(function (id, i) {
        var s = Rasta.stations[id], p = point(id);
        var anchor = i % 2 ? 'end' : 'start';
        var dx = i % 2 ? -8 : 8;
        return '<a class="map-stop" href="#/stop/' + esc(id) + '" aria-label="' + esc(s.name) + ', open stop details">' +
          '<title>' + esc(s.name) + ' — ' + esc(s.city) + '</title>' +
          '<g transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')"><circle r="5"/><text x="' + dx + '" y="-7" text-anchor="' + anchor + '">' + esc(s.name) + '</text></g></a>';
      }).join('');
      var options = '<option value="">All bus lines</option>' + Rasta.lines.map(function (line) {
        return '<option value="' + esc(line.id) + '"' + (selected && selected.id === line.id ? ' selected' : '') + '>' + esc(line.shortName) + '</option>';
      }).join('');
      return '<div class="section-head" style="margin-top:0"><h1>Bus route map</h1><p>Explore stops and routes across Islamabad and Rawalpindi.</p></div>' +
        '<div class="card"><div class="map-controls"><label class="field" style="margin:0;flex:1"><span class="lbl">Show route</span><select id="mapLine">' + options + '</select></label>' +
        '<button class="btn" id="mapLocate" type="button">Show my location</button></div></div>' +
        '<div class="card network-map"><svg viewBox="0 0 700 510" role="img" aria-label="Schematic bus route map with selectable stops">' +
        '<text x="24" y="495" fill="var(--muted)" font-size="12">Schematic route map · stop coordinates are approximate</text>' + lines + stops + '<circle id="mapUser" class="map-user" r="8" cx="-30" cy="-30"/></svg></div>' +
        '<div class="card"><div class="card-title"><h2>Bus locations</h2><span class="pill pill-muted">No live feed</span></div>' +
        '<p style="color:var(--ink-2);margin-bottom:0">The operators do not publish bus GPS positions to this app, so moving bus markers and arrival predictions are unavailable. The map shows published routes and stops only. <a href="#/info">Data and sources</a></p></div>' +
        '<div id="mapStatus" class="notice" aria-live="polite" hidden></div>';
    },
    mount: function (params, query) {
      var selector = document.getElementById('mapLine');
      var locate = document.getElementById('mapLocate');
      var status = document.getElementById('mapStatus');
      var userPin = document.getElementById('mapUser');
      selector.addEventListener('change', function () {
        location.hash = '#/map' + (selector.value ? '?line=' + encodeURIComponent(selector.value) : '');
      });
      locate.addEventListener('click', function () {
        if (!navigator.geolocation) { status.hidden = false; status.textContent = 'Location is not available in this browser.'; return; }
        locate.disabled = true; locate.textContent = 'Finding you…';
        navigator.geolocation.getCurrentPosition(function (pos) {
          var lat = pos.coords.latitude, lon = pos.coords.longitude;
          var line = Rasta.lineById[query.line];
          var ids = line ? line.stations : Rasta.servedIds;
          var lats = ids.map(function (id) { return Rasta.stations[id].coord[0]; });
          var lons = ids.map(function (id) { return Rasta.stations[id].coord[1]; });
          var minLat = Math.min.apply(Math, lats), maxLat = Math.max.apply(Math, lats);
          var minLon = Math.min.apply(Math, lons), maxLon = Math.max.apply(Math, lons);
          var x = 34 + (lon - minLon) / (maxLon - minLon || 1) * 632;
          var y = 30 + (maxLat - lat) / (maxLat - minLat || 1) * 450;
          userPin.setAttribute('cx', x); userPin.setAttribute('cy', y);
          status.hidden = false; status.textContent = 'Your location is shown in blue. Bus locations are not available.';
          locate.disabled = false; locate.textContent = 'Update my location';
        }, function () {
          status.hidden = false; status.textContent = 'Could not get your location. Allow location access and try again.';
          locate.disabled = false; locate.textContent = 'Try location again';
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
      });
    }
  };

  /* =========================================================== ROUTE DETAIL */

  var routeView = {
    title: 'Route | Rasta',
    html: function (params, query) {
      var line = Rasta.lineById[params[0]];
      if (!line) return notFound('That line does not exist.');

      var reversed = query.dir === 'reverse';
      var seq = reversed ? line.stations.slice().reverse() : line.stations.slice();
      var originId = seq[0], destId = seq[seq.length - 1];
      var km = Math.round(Rasta.totalLineKm(line) * 10) / 10;

      var stops = seq.map(function (sid, i) {
        var s = Rasta.stations[sid];
        if (!s) return '';
        var isEnd = i === 0 || i === seq.length - 1;
        var isInter = Rasta.linesAtStation(sid).length > 1;
        var cls = [];
        if (isEnd) cls.push('is-end');
        if (isInter) cls.push('is-interchange');

        var others = Rasta.linesAtStation(sid).filter(function (o) { return o.id !== line.id; });
        var meta = others.length
          ? '<span class="meta">change: ' + others.map(function (o) { return esc(o.shortName); }).join(', ') + '</span>'
          : '<span class="meta">' + esc(s.city) + '</span>';

        return '<li class="' + cls.join(' ') + '">' +
          '<a href="#/stop/' + esc(sid) + '">' +
            '<span class="seq">' + (i + 1) + '</span>' +
            '<span class="nm">' + esc(s.name) + '</span>' +
            meta +
          '</a></li>';
      }).join('');

      var otherLines = Rasta.lines.filter(function (l) { return l.id !== line.id; });

      return '' +
        '<p style="margin:0 0 12px"><a href="#/routes">‹ All lines</a></p>' +

        '<div class="card" style="border-left:5px solid ' + esc(line.color) + '">' +
          '<div class="row wrap" style="gap:8px;margin-bottom:8px">' + linePill(line) + confBadge(line.confidence) + '</div>' +
          '<h1 style="margin-bottom:6px">' + esc(line.name) + '</h1>' +
          (line.nameUr ? '<p style="color:var(--muted);font-size:1.05rem;margin:-4px 0 8px" lang="ur" dir="rtl">' + esc(line.nameUr) + '</p>' : '') +
          '<p style="color:var(--ink-2);font-size:.9rem;margin-bottom:12px">Operated by ' + esc(line.operator) + '</p>' +
          '<div class="big-stat" style="margin-bottom:14px">' +
            '<div><span class="v">' + line.stations.length + '</span><span class="k">Stops</span></div>' +
            '<div><span class="v">' + (km || 'n/a') + '</span><span class="k">Km</span></div>' +
            '<div><span class="v">' + esc(line.timings.firstDeparture) + '</span><span class="k">First bus</span></div>' +
            '<div><span class="v">' + esc(line.timings.lastDeparture) + '</span><span class="k">Last bus</span></div>' +
          '</div>' +
          '<div class="row wrap" style="gap:8px">' +
            '<a class="btn btn-sm" href="#/route/' + esc(line.id) + (reversed ? '' : '?dir=reverse') + '">' +
              'Reverse direction</a>' +
            '<a class="btn btn-sm" href="#/plan?from=' + esc(originId) + '&to=' + esc(destId) + '">' +
              'Plan end to end</a>' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>Timings &amp; fare</h2></div>' +
          '<ul class="kv">' +
            '<li><span class="k">Direction</span><span class="v">' + esc(Rasta.stationName(originId)) + ' to ' + esc(Rasta.stationName(destId)) + '</span></li>' +
            '<li><span class="k">Service window</span><span class="v">' + esc(line.timings.firstDeparture) + ', ' + esc(line.timings.lastDeparture) + '</span></li>' +
            '<li><span class="k">Frequency</span><span class="v">about every ' + line.timings.peakHeadwayMin + ' min (peak), ' + line.timings.offPeakHeadwayMin + ' min (off-peak)</span></li>' +
            '<li><span class="k">Days</span><span class="v">' + esc(line.timings.days) + '</span></li>' +
            '<li><span class="k">Fare</span><span class="v">' + (line.fare ? money(line.fare.amountPkr) + (line.fare.type === 'flat' ? ' flat' : ' from') : ', ') +
              ' ' + (line.fare ? confBadge(line.fare.confidence) : '') + '</span></li>' +
          '</ul>' +
          '<div class="notice" style="margin-top:12px">' + esc(line.timings.note) + '</div>' +
          '<p style="font-size:.82rem;color:var(--muted);margin:10px 0 0">Fare and service information last reviewed ' + esc(Rasta.meta.dataAsOf) + '. This is a saved snapshot, not live operator data; confirm fare at the station.</p>' +
        '</div>' +

        '<div class="section-head"><h2>' + stopsLabel(line.stations.length) + '</h2>' +
          '<p>' + esc(Rasta.stationName(originId)) + ' to ' + esc(Rasta.stationName(destId)) + '</p></div>' +

        '<div class="card">' +
          '<ul class="stopline" style="--rail:' + esc(line.color) + '">' + stops + '</ul>' +
        '</div>' +

        (Rasta.alertsForLine(line.id).length
          ? '<div class="card">' +
            '<div class="card-title"><h3>Alerts for this line</h3>' + alertBadge(line.id) + '</div>' +
            Rasta.alertsForLine(line.id).map(function (a) {
              return '<div class="alert alert-' + esc(a.severity) + '" style="margin-bottom:8px">' +
                '<div class="alert-head"><span class="alert-tag">' + esc(severityLabel(a.severity)) + '</span>' +
                '<span class="alert-date">' + esc(a.date) + '</span>' +
                (a.confidence === 'low' ? '<span class="alert-unconf">unconfirmed</span>' : '') + '</div>' +
                '<h3 class="alert-title">' + esc(a.title) + '</h3>' +
                '<p class="alert-body" style="margin-bottom:0">' + esc(a.body) + '</p>' +
                (a.source ? '<p class="alert-src" style="margin-bottom:0"><a href="' + esc(a.source) + '" target="_blank" rel="noopener noreferrer nofollow">Source</a></p>' : '') +
                '</div>';
            }).join('') +
          '</div>'
          : '') +

        '<div class="card">' +
          '<div class="card-title"><h3>Connecting lines</h3></div>' +
          '<ul class="list">' + otherLines.map(function (l) {
            return '<li><a class="list-link" href="#/route/' + esc(l.id) + '">' +
              '<span class="dot" style="background:' + esc(l.color) + '"></span>' +
              '<span class="grow"><span class="ttl">' + esc(l.shortName) + '</span>' +
              '<span class="sub">' + esc(Rasta.stationName(l.from)) + ' ↔ ' + esc(Rasta.stationName(l.to)) + '</span></span>' +
              '<span class="chev">›</span></a></li>';
          }).join('') + '</ul>' +
        '</div>' +

        (line.sources && line.sources.length
          ? '<div class="card"><div class="card-title"><h3>Sources</h3></div><ul class="src-list">' +
            line.sources.map(function (u) {
              return '<li><a href="' + esc(u) + '" rel="noopener noreferrer nofollow" target="_blank">' + esc(u) + '</a></li>';
            }).join('') + '</ul></div>'
          : '');
    }
  };

  /* ================================================================== STOPS */

  var stopsView = {
    title: 'Stops | Rasta',
    html: function () {
      var ids = Rasta.servedIds.slice().sort(function (a, b) {
        return Rasta.stations[a].name.localeCompare(Rasta.stations[b].name);
      });

      var byCity = {};
      ids.forEach(function (id) {
        var c = Rasta.stations[id].city;
        (byCity[c] = byCity[c] || []).push(id);
      });

      var groups = Object.keys(byCity).sort().map(function (city) {
        return '<div class="section-head"><h2>' + esc(city) + '</h2><p>' + stopsLabel(byCity[city].length) + '</p></div>' +
          '<div class="card" style="padding:4px 16px"><ul class="list">' +
          byCity[city].map(function (id) {
            var s = Rasta.stations[id];
            return '<li><a class="list-link" href="#/stop/' + esc(id) + '">' +
              '<span class="grow"><span class="ttl">' + esc(s.name) + '</span>' +
              '<span class="sub">' + esc(s.area) + '</span></span>' +
              '<span style="display:flex;gap:4px">' + lineDots(id) + '</span></a></li>';
          }).join('') +
          '</ul></div>';
      }).join('');

      return '<div class="section-head" style="margin-top:0"><h1>Stops</h1>' +
        '<p>Every stop in the dataset, grouped by city.</p></div>' +
        '<div class="card"><div class="search-wrap">' +
          '<label class="field" for="sf" style="margin-bottom:8px"><span class="lbl">Filter stops</span></label>' +
          '<input type="search" id="sf" placeholder="Filter by name or area..." autocomplete="off">' +
        '</div></div>' +
        '<div id="stopGroups">' + groups + '</div>';
    },
    mount: function () {
      var input = document.getElementById('sf');
      var holder = document.getElementById('stopGroups');
      var original = holder.innerHTML;

      input.addEventListener('input', function () {
        var v = input.value.trim();
        if (!v) { holder.innerHTML = original; return; }
        var hits = Rasta.searchStations(v);
        if (!hits.length) {
          holder.innerHTML = '<p class="empty">No stop matches “' + esc(v) + '”.</p>';
          return;
        }
        holder.innerHTML = '<div class="card" style="padding:4px 16px"><ul class="list">' +
          hits.map(function (h) {
            var s = h.station;
            return '<li><a class="list-link" href="#/stop/' + esc(h.id) + '">' +
              '<span class="grow"><span class="ttl">' + esc(s.name) + '</span>' +
              '<span class="sub">' + esc(s.area) + ', ' + esc(s.city) + '</span></span>' +
              '<span style="display:flex;gap:4px">' + lineDots(h.id) + '</span></a></li>';
          }).join('') + '</ul></div>';
      });
    }
  };

  /* ============================================================ STOP DETAIL */

  var stopView = {
    title: 'Stop | Rasta',
    html: function (params) {
      var id = params[0];
      var s = Rasta.stations[id];
      if (!s) return notFound('That stop does not exist.');
      if (!Rasta.linesAtStation(id).length) {
        return '<p style="margin:0 0 12px"><a href="#/stops">‹ All stops</a></p>' +
          '<div class="card"><h1>' + esc(s.name) + '</h1>' +
          '<div class="notice notice-warn">This stop is in our dataset but no line sequence includes it yet. ' +
          'It may be misspelled or the line data is incomplete. ' +
          '<a href="#/info">See known gaps</a></div></div>';
      }

      var linesHtml = Rasta.linesAtStation(id).map(function (line) {
        var idx = line.stations.indexOf(id);
        var prevId = idx > 0 ? line.stations[idx - 1] : null;
        var nextId = idx < line.stations.length - 1 ? line.stations[idx + 1] : null;

        var both = [prevId, nextId].filter(Boolean).map(function (nid) {
          return '<a class="list-link" href="#/plan?from=' + esc(id) + '&to=' + esc(nid) + '" ' +
            'style="padding:8px 0;min-height:0">' +
            '<span class="grow"><span class="ttl" style="font-size:.92rem">To ' + esc(Rasta.stationName(nid)) + '</span>' +
            '<span class="sub">' + esc(Rasta.directionFor(line, id, nid) || '') + '</span></span>' +
            '<span class="chev">›</span></a>';
        }).join('');

        return '<div style="border-left:4px solid ' + esc(line.color) + ';padding-left:12px;margin-bottom:16px">' +
          '<div class="row-between wrap" style="margin-bottom:4px">' +
            '<a href="#/route/' + esc(line.id) + '" style="text-decoration:none">' + linePill(line) + '</a>' +
            '<span class="conf-' + esc(line.confidence) + '" style="font-size:.74rem">stop ' + (idx + 1) + ' of ' + line.stations.length + '</span>' +
          '</div>' +
          '<ul class="list" style="margin-top:6px">' + both + '</ul>' +
        '</div>';
      }).join('');

      return '' +
        '<p style="margin:0 0 12px"><a href="#/stops">‹ All stops</a></p>' +
        '<div class="card">' +
          '<h1 style="margin-bottom:4px">' + esc(s.name) + '</h1>' +
          (s.nameUr ? '<p lang="ur" dir="rtl" style="color:var(--muted);margin:-2px 0 8px">' + esc(s.nameUr) + '</p>' : '') +
          '<div class="row wrap" style="gap:6px;margin-bottom:12px">' +
            '<span class="pill pill-muted">' + esc(s.area) + '</span>' +
            '<span class="pill pill-muted">' + esc(s.city) + '</span>' +
            confBadge(s.confidence) +
          '</div>' +
          (s.landm ? '<ul class="kv"><li><span class="k">Nearby</span><span class="v">' + esc(s.landm) + '</span></li></ul>' : '') +
          (s.coord ? '<p style="font-size:.78rem;color:var(--muted);margin:10px 0 0">' +
            '<a href="https://www.openstreetmap.org/?mlat=' + s.coord[0] + '&mlon=' + s.coord[1] +
            '#map=16/' + s.coord[0] + '/' + s.coord[1] + '" target="_blank" rel="noopener noreferrer">' +
            'Show on OpenStreetMap</a>, ' + s.coord[0].toFixed(4) + ', ' + s.coord[1].toFixed(4) + '</p>' : '') +
        '</div>' +
        '<div class="section-head"><h2>Lines serving this stop</h2></div>' +
        '<div class="card">' + linesHtml + '</div>' +
        '<a class="btn btn-primary btn-block" href="#/plan?to=' + esc(id) + '" style="display:block;text-align:center;text-decoration:none">Plan a trip to here</a>';
    }
  };

  /* =================================================================== PLAN */

  var planView = {
    title: 'Plan a journey | Rasta',
    html: function (params, query) {
      var options = Rasta.servedIds.slice().sort(function (a, b) {
        return Rasta.stations[a].name.localeCompare(Rasta.stations[b].name);
      }).map(function (id) {
        var s = Rasta.stations[id];
        return '<option value="' + esc(s.name) + '">' + esc(s.area) + ', ' + esc(s.city) + '</option>';
      }).join('');

      var fromText = query.from ? Rasta.stationName(query.from) : '';
      var toText = query.to ? Rasta.stationName(query.to) : '';

      return '' +
        '<div class="section-head" style="margin-top:0"><h1>Plan a journey</h1>' +
        '<p>Rasta finds the lines to take, where to change, and an estimated time and fare.</p></div>' +

        '<div class="card">' +
          '<form id="planForm" novalidate>' +
            '<label class="field"><span class="lbl">From</span>' +
              '<input type="text" id="fromInput" list="stationList" placeholder="Start stop or area" ' +
              'autocomplete="off" value="' + esc(fromText) + '"></label>' +
            '<div class="row" style="justify-content:flex-end;margin:-6px 0 10px">' +
              '<button class="btn btn-sm swap-btn" type="button" id="swapBtn">Swap</button>' +
            '</div>' +
            '<label class="field"><span class="lbl">To</span>' +
              '<input type="text" id="toInput" list="stationList" placeholder="Destination stop or area" ' +
              'autocomplete="off" value="' + esc(toText) + '"></label>' +
            '<button class="btn btn-primary btn-block" type="submit" style="margin-top:4px">Find route</button>' +
          '</form>' +
          '<datalist id="stationList">' + options + '</datalist>' +
          '<div id="planError" aria-live="polite"></div>' +
        '</div>' +
        '<div id="planResult" aria-live="polite"></div>';
    },
    mount: function (params, query) {
      var form = document.getElementById('planForm');
      var fromInput = document.getElementById('fromInput');
      var toInput = document.getElementById('toInput');
      var errBox = document.getElementById('planError');
      var out = document.getElementById('planResult');

      document.getElementById('swapBtn').addEventListener('click', function () {
        var t = fromInput.value; fromInput.value = toInput.value; toInput.value = t;
      });

      function showError(msg) {
        errBox.innerHTML = '<div class="notice notice-warn" style="margin-top:12px">' + esc(msg) + '</div>';
        out.innerHTML = '';
      }

      function run() {
        errBox.innerHTML = '';
        var fromId = resolveStation(fromInput.value);
        var toId = resolveStation(toInput.value);

        if (!fromInput.value.trim() || !toInput.value.trim()) {
          showError('Enter both a starting point and a destination.');
          return;
        }
        if (!fromId) { showError('We do not recognise “' + fromInput.value.trim() + '”. Try picking a suggestion from the list.'); return; }
        if (!toId) { showError('We do not recognise “' + toInput.value.trim() + '”. Try picking a suggestion from the list.'); return; }
        if (fromId === toId) { showError('Those are the same stop. Pick two different stops.'); return; }

        // Keep the URL shareable without re-rendering this view.
        var newHash = '#/plan?from=' + encodeURIComponent(fromId) + '&to=' + encodeURIComponent(toId);
        if (location.hash !== newHash) history.replaceState(null, '', newHash);

        var plan = Rasta.planJourney(fromId, toId);

        if (!plan.ok) {
          showError(plan.reason === 'no-route'
            ? 'No connected route was found between those two stops in the current dataset. That usually means the line data is incomplete, not that no bus exists. Check the Info tab.'
            : 'No route found.');
          return;
        }

        var legsHtml = plan.legs.map(function (leg, i) {
          var line = Rasta.lineById[leg.lineId];
          var midStops = leg.stationIds.slice(1, -1);

          var transfer = i > 0
            ? '<div class="transfer-note">Change at <strong>' + esc(Rasta.stationName(leg.stationIds[0])) +
              '</strong>, allow about ' + leg.transferMin + ' min</div>'
            : '';

          var intermediate = midStops.length
            ? '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:.84rem;color:var(--muted)">' +
              'Show ' + stopsLabel(midStops.length) + ' in between</summary>' +
              '<ol style="margin:8px 0 0;padding-left:20px;font-size:.86rem;color:var(--ink-2)">' +
              midStops.map(function (sid) {
                return '<li><a href="#/stop/' + esc(sid) + '">' + esc(Rasta.stationName(sid)) + '</a></li>';
              }).join('') + '</ol></details>'
            : '';

          return transfer +
            '<div class="journey-leg" style="--leg:' + esc(line.color) + '">' +
              '<div class="leg-head">' + linePill(line) +
                '<span class="leg-route"><strong>' + esc(Rasta.stationName(leg.stationIds[0])) + '</strong> to <strong>' +
                esc(Rasta.stationName(leg.stationIds[leg.stationIds.length - 1])) + '</strong></span>' +
              '</div>' +
              '<div class="leg-stats">' +
                '<span><b>' + leg.stops + '</b> stops</span>' +
                '<span><b>' + leg.minutes + '</b> min</span>' +
                (leg.km ? '<span><b>' + leg.km + '</b> km</span>' : '') +
              '</div>' +
              intermediate +
            '</div>';
        }).join('');

        var fareText = plan.fareExact
          ? money(plan.fare)
          : 'about ' + money(plan.fareEstimate);

        out.innerHTML = '' +
          '<div class="card">' +
            '<div class="card-title"><h2>Your journey</h2></div>' +
            '<p style="color:var(--ink-2);font-size:.9rem;margin-bottom:12px">' +
              esc(Rasta.stationName(fromId)) + ' to ' + esc(Rasta.stationName(toId)) + '</p>' +
            '<div class="big-stat" style="margin-bottom:6px">' +
              '<div><span class="v">' + minsLabel(plan.totalMinutes) + '</span><span class="k">Estimated</span></div>' +
              '<div><span class="v">' + plan.fareEstimate + '</span><span class="k">' + (plan.fareExact ? 'Fare (Rs)' : 'Fare est. (Rs)') + '</span></div>' +
              '<div><span class="v">' + (plan.changes === 0 ? 'Direct' : plan.changes) + '</span><span class="k">' + (plan.changes === 0 ? 'No change' : 'Changes') + '</span></div>' +
              (plan.totalKm ? '<div><span class="v">' + plan.totalKm + '</span><span class="k">Km</span></div>' : '') +
            '</div>' +
            (plan.fareExact ? '' : '<p style="font-size:.78rem;color:var(--muted);margin:8px 0 0">Fare is estimated from distance and may differ from what you are charged.</p>') +
          '</div>' +

          '<div class="section-head"><h2>Step by step</h2></div>' +
          legsHtml +

          (Rasta.alertsForJourney(plan).length
            ? '<div class="section-head"><h2>Alerts on this route</h2></div>' +
              Rasta.alertsForJourney(plan).map(alertCard).join('')
            : '') +

          '<div class="notice" style="margin-top:6px">' +
            '<strong>Check before you travel.</strong> This is a plan based on published routes, not live data. ' +
            'Buses may be delayed, and the last service of the day can leave earlier than the schedule suggests.' +
          '</div>' +

          '<div class="row wrap" style="gap:8px;margin-top:14px">' +
            '<a class="btn btn-sm" href="#/plan?from=' + esc(toId) + '&to=' + esc(fromId) + '">Reverse this journey</a>' +
            '<button class="btn btn-sm" type="button" id="printBtn">Print / save</button>' +
          '</div>';

        document.getElementById('printBtn').addEventListener('click', function () { window.print(); });
      }

      form.addEventListener('submit', function (e) { e.preventDefault(); run(); });

      // Auto-run when the view was opened with a complete, valid query.
      if (query.from && query.to && Rasta.stations[query.from] && Rasta.stations[query.to]) {
        run();
      }
    }
  };

  /* ================================================================= ALERTS */

  var alertsView = {
    title: 'Service alerts | Rasta',
    html: function () {
      var list = Rasta.activeAlerts();
      return '<div class="section-head" style="margin-top:0"><h1>Service alerts</h1>' +
        '<p>Disruptions and unresolved conflicts in the data that may affect your travel.</p></div>' +
        (list.length
          ? list.map(alertCard).join('')
          : '<div class="card"><p class="empty">No alerts right now.</p></div>') +
        '<div class="card"><div class="card-title"><h3>Why alerts appear here</h3></div>' +
        '<p style="font-size:.9rem;color:var(--ink-2);margin-bottom:0">An alert appears when sources ' +
        'disagree, when a route has reportedly changed, or when something could not be confirmed. ' +
        'Anything marked <strong>unconfirmed</strong> comes from a single report and may be wrong. ' +
        'Check before you rely on it.</p></div>';
    }
  };

  /* =================================================================== INFO */

  var infoView = {
    title: 'About & data sources | Rasta',
    html: function () {
      var d = Rasta.meta;
      var lowConf = Rasta.lines.filter(function (l) { return l.confidence !== 'high'; });
      var lowStops = Rasta.servedIds.filter(function (id) {
        return Rasta.stations[id].confidence === 'low';
      }).length;

      return '' +
        '<div class="section-head" style="margin-top:0"><h1>About Rasta</h1></div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>About the creator</h2></div>' +
          '<p style="color:var(--ink-2);margin-bottom:0">Created by <strong>Syed Abdullah</strong>. Rasta was created to make Islamabad and Rawalpindi bus routes, stops, fares, and journey planning easier to find in one place.</p>' +
        '</div>' +

        '<div class="notice notice-warn" style="margin-bottom:14px">' +
          '<strong>Rasta is not a real-time bus tracker.</strong> ' +
          'It shows published routes, stop sequences and scheduled service windows. ' +
          'It cannot tell you where a bus is right now, or when the next one will actually arrive. ' +
          'If a live feed appears, this app can use it. Until then, treat every time here as a guide.' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>How current is this?</h2></div>' +
          '<p style="font-size:.9rem;color:var(--ink-2)">Rasta ships a <strong>fixed snapshot</strong> of the ' +
          'network. It does not update itself: there is no feed to poll and no API to call, because no ' +
          'machine-readable data is published for these services. Updates are made by hand and committed, ' +
          'so they are slower to arrive but reviewed before you see them.</p>' +
          '<ul class="kv">' +
            '<li><span class="k">Data as of</span><span class="v">' + esc(d.dataAsOf) + '</span></li>' +
            '<li><span class="k">Age</span><span class="v">' +
              (Rasta.dataAgeDays() === null ? 'unknown' : Rasta.dataAgeDays() + ' days') + '</span></li>' +
            '<li><span class="k">Status</span><span class="v">' +
              esc(freshnessLabel(Rasta.freshness().level)) + '</span></li>' +
            '<li><span class="k">Considered stale after</span><span class="v">' +
              Rasta.staleAfterDays + ' days</span></li>' +
          '</ul>' +
          '<div class="notice" style="margin-top:12px">' + esc(Rasta.freshness().message) + '</div>' +
          '<p style="font-size:.86rem;color:var(--ink-2);margin:12px 0 0">' +
            'The home screen will warn you once the data passes that age, so you are never shown an old ' +
            'timetable without being told it is old.' +
          '</p>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>What is covered</h2></div>' +
          '<ul class="list">' + Rasta.lines.map(function (l) {
            return '<li><a class="list-link" href="#/route/' + esc(l.id) + '">' +
              '<span class="dot" style="background:' + esc(l.color) + '"></span>' +
              '<span class="grow"><span class="ttl">' + esc(l.name) + '</span>' +
              '<span class="sub">' + esc(l.operator) + '</span></span>' +
              confBadge(l.confidence) + '</a></li>';
          }).join('') + '</ul>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>Dataset</h2></div>' +
          '<ul class="kv">' +
            '<li><span class="k">Data version</span><span class="v">' + esc(d.version) + '</span></li>' +
            '<li><span class="k">Data as of</span><span class="v">' + esc(d.dataAsOf) + '</span></li>' +
            '<li><span class="k">Lines</span><span class="v">' + Rasta.lines.length + '</span></li>' +
            '<li><span class="k">Stops served</span><span class="v">' + Rasta.servedIds.length + '</span></li>' +
            '<li><span class="k">Assumed average speed</span><span class="v">' + d.averageSpeedKmph + ' km/h</span></li>' +
            '<li><span class="k">Line-change allowance</span><span class="v">' + d.transferPenaltyMin + ' min</span></li>' +
          '</ul>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>How confident is this data?</h2></div>' +
          '<p style="font-size:.9rem;color:var(--ink-2)">Each line and stop carries a confidence badge. ' +
          'It reflects how many independent sources agreed, not how good the bus service is.</p>' +
          '<ul class="kv">' +
            '<li><span class="k">' + confBadge('high') + '</span><span class="v">Confirmed across multiple sources.</span></li>' +
            '<li><span class="k">' + confBadge('medium') + '</span><span class="v">Reasonably consistent, minor disagreement.</span></li>' +
            '<li><span class="k">' + confBadge('low') + '</span><span class="v">Single source or provisional, verify before relying on it.</span></li>' +
          '</ul>' +
          '<div class="notice" style="margin-top:12px">' +
            'Right now ' + lowConf.length + ' of ' + Rasta.lines.length + ' lines are not yet fully verified, and ' +
            lowStops + ' stops are marked low confidence. Each one is labelled where it appears.' +
          '</div>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>Known gaps</h2></div>' +
          '<p style="font-size:.9rem;color:var(--ink-2)">What this app cannot tell you.</p>' +
          '<ul style="margin:0;padding-left:20px;font-size:.9rem;color:var(--ink-2)">' +
            d.knownGaps.map(function (g) { return '<li>' + esc(g) + '</li>'; }).join('') +
          '</ul>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>Service alerts</h2></div>' +
          '<p style="font-size:.9rem;color:var(--ink-2)">Disruptions and source conflicts that may affect you.</p>' +
          '<a class="btn btn-sm" href="#/alerts">View all ' + Rasta.activeAlerts().length + ' alerts</a>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>Time estimates</h2></div>' +
          '<p style="font-size:.9rem;color:var(--ink-2)">Journey times are calculated from the distance between consecutive stops ' +
          'at an assumed average of <strong>' + d.averageSpeedKmph + ' km/h</strong>, plus ' + d.dwellMinutes +
          ' minutes at each stop and ' + d.transferPenaltyMin + ' minutes each time you change lines.</p>' +
          '<p style="font-size:.9rem;color:var(--ink-2);margin-bottom:0">That speed is deliberately conservative. ' +
          'On Murree Road and Kashmir Highway at peak times, real journeys are often slower still.</p>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>Reference sources</h2></div>' +
          '<ul class="src-list">' +
            '<li><a href="https://transport.punjab.gov.pk/metro_bus_services" target="_blank" rel="noopener noreferrer nofollow">Punjab Transport Department, Metro Bus Services</a></li>' +
            '<li><a href="https://pma.punjab.gov.pk/" target="_blank" rel="noopener noreferrer nofollow">Punjab Mass Transit Authority</a></li>' +
            '<li><a href="https://www.safar.fyi/islamabad" target="_blank" rel="noopener noreferrer nofollow">Safar, Islamabad Metrobus &amp; feeder routes</a></li>' +
            '<li><a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer nofollow">OpenStreetMap contributors</a></li>' +
          '</ul>' +
          '<p style="font-size:.8rem;color:var(--muted);margin:10px 0 0">Operated by CDA, the Capital Mass Transit Authority and the ' +
          'Punjab Mass Transit Authority. Rasta is an independent community project and is not affiliated with any government body.</p>' +
        '</div>' +

        '<div class="card">' +
          '<div class="card-title"><h2>Works offline</h2></div>' +
          '<p style="font-size:.9rem;color:var(--ink-2);margin-bottom:0">The whole dataset is stored inside the app, so routes, stops ' +
          'and journey planning keep working with no internet connection or mobile data, useful when you are underground or out of balance.</p>' +
        '</div>';
    }
  };

  /* ================================================================= router */

  function notFound(msg) {
    return '<div class="card"><h1>Not found</h1><p style="color:var(--ink-2)">' +
      esc(msg || 'That page does not exist.') + '</p>' +
      '<a class="btn btn-primary" href="#/">Back to home</a></div>';
  }

  var routeNotFoundView = { title: 'Not found | Rasta', html: function () { return notFound(); } };

  var ROUTES = [
    { re: /^\/$/,                 tab: 'home',   view: homeView },
    { re: /^\/routes$/,           tab: 'routes', view: routesView },
    { re: /^\/map$/,              tab: 'map',    view: mapView },
    { re: /^\/route\/(.+)$/,      tab: 'routes', view: routeView },
    { re: /^\/stops$/,            tab: 'stops',  view: stopsView },
    { re: /^\/stop\/(.+)$/,       tab: 'stops',  view: stopView },
    { re: /^\/plan$/,             tab: 'plan',   view: planView },
    { re: /^\/alerts$/,           tab: 'info',   view: alertsView },
    { re: /^\/info$/,             tab: 'info',   view: infoView }
  ];

  function render() {
    var parsed = parseHash();
    var match = null, params = [];
    for (var i = 0; i < ROUTES.length; i++) {
      var m = parsed.path.match(ROUTES[i].re);
      if (m) { match = ROUTES[i]; params = m.slice(1).map(decodeURIComponent); break; }
    }

    var view = match ? match.view : routeNotFoundView;
    var html = view.html(params, parsed.query);
    main.innerHTML = html;

    document.title = (view.title ? view.title : 'Rasta');
    Array.prototype.forEach.call(tabbar.querySelectorAll('a'), function (a) {
      if (a.getAttribute('data-tab') === (match ? match.tab : '')) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });

    if (match && typeof view.mount === 'function') view.mount(params, parsed.query);

    // New screen should start at the top; back/forward keeps scroll restoration.
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', render);

  /* --------------------------------------------------------------- theming */

  var THEME_KEY = 'rasta.theme';
  var themeToggle = document.getElementById('themeToggle');

  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'dark' ? '#0e1512' : '#0a7d4f');
  }

  var stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* private mode */ }

  if (stored === 'dark' || stored === 'light') {
    applyTheme(stored);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  } else {
    applyTheme('light');
  }

  themeToggle.addEventListener('click', function () {
    var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
  });

  /* ------------------------------------------------------- offline support */

  // Only meaningful over http(s). When index.html is opened from disk the
  // browser blocks service workers, which is fine, the data is local anyway.
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* non-fatal */ });
    });
  }

  /* ------------------------------------------------------------------ boot */

  if (!location.hash) location.replace('#/');
  render();
})();
