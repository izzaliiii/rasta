/* ============================================================================
 * Rasta | tiny static server for local testing and phone access.
 *
 *   node serve.js            # http://localhost:8080
 *   node serve.js 3000       # custom port
 *
 * Deliberately dependency-free. An HTTP origin (rather than file://) is what
 * lets the service worker register, which is what makes the app work offline
 * and installable to a phone home screen.
 * ==========================================================================*/

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Strip the query string and decode, then resolve inside ROOT only.
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const resolved = path.join(ROOT, path.normalize(urlPath));
  if (!resolved.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + urlPath);
      return;
    }

    let body = data;
    let type = TYPES[path.extname(resolved).toLowerCase()] || 'application/octet-stream';

    /* Full-page screenshot support.
     * Chrome's --screenshot only captures the viewport, which cuts off long
     * pages like a 24-stop route. Adding ?full=1 grows the viewport to the
     * page's true scroll height so one screenshot captures the whole thing.
     * Test/demo only : it does not affect normal browsing. */
    if (urlPath.endsWith('.html') && /[?&]full=1\b/.test(req.url)) {
      const inject = `<style>html,body{height:auto!important;overflow:visible!important}</style>
<script>
(function(){
  function grow(){
    var h=Math.max(document.documentElement.scrollHeight,document.body.scrollHeight);
    if(h>0){ document.documentElement.style.height=h+'px'; document.body.style.height=h+'px'; }
  }
  window.addEventListener('load',function(){ grow(); setTimeout(grow,300); setTimeout(grow,900); });
})();
</script>`;
      body = Buffer.from(String(data).replace('</head>', inject + '</head>'), 'utf8');
      type = 'text/html; charset=utf-8';
    }

    /* Time-shift support for demonstrating the staleness warning.
     * ?now=YYYY-MM-DD makes the page believe the clock is at that date, so the
     * "this data is out of date" banner can be seen without editing the real
     * dataset. Development/demo only. */
    const nowMatch = req.url.match(/[?&]now=(\d{4}-\d{2}-\d{2})/);
    if (urlPath.endsWith('.html') && nowMatch) {
      const inject = `<script>
(function(){
  var RealDate = Date;
  var shifted = RealDate.parse('${nowMatch[1]}T12:00:00');
  var realNow = RealDate.now();
  function FakeDate(){
    if (arguments.length === 0) return new RealDate(shifted);
    return new (Function.prototype.bind.apply(RealDate, [null].concat([].slice.call(arguments))))();
  }
  FakeDate.now = function(){ return shifted; };
  FakeDate.parse = RealDate.parse;
  FakeDate.UTC = RealDate.UTC;
  FakeDate.prototype = RealDate.prototype;
  window.Date = FakeDate;
  window.__RASTA_TIME_SHIFTED = '${nowMatch[1]}';
})();
</script>`;
      body = Buffer.from(String(body).replace('</head>', inject + '</head>'), 'utf8');
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      // The service worker must be allowed to control the whole scope.
      'Service-Worker-Allowed': '/'
    });
    res.end(body);
  });
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const lan = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) lan.push(net.address);
    }
  }
  console.log('\nRasta is being served from ' + ROOT);
  console.log('  On this computer:  http://localhost:' + PORT);
  for (const ip of lan) {
    console.log('  On your phone:     http://' + ip + ':' + PORT + '   (same Wi-Fi)');
  }
  console.log('\nPress Ctrl+C to stop.\n');
});
