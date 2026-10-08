const http = require('http');

async function testEndpoint(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        resolve({
          url,
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          length: data.length
        });
      });
    }).on('error', err => resolve({ url, status: 500, ok: false, error: err.message }));
  });
}

(async () => {
  const routes = [
    'http://localhost:3000/index.html',
    'http://localhost:3000/user.html',
    'http://localhost:3000/admin.html',
    'http://localhost:3000/station.html',
    'http://localhost:3000/report.html',
    'http://localhost:3000/satellite.html',
    'http://localhost:3000/iot.html',
    'http://localhost:3000/analytics.html',
    'http://localhost:3000/api/incidents',
    'http://localhost:3000/api/response-stations',
    'http://localhost:3000/api/water-bodies',
    'http://localhost:3000/api/sensors',
    'http://localhost:3000/api/satellite-hotspots',
    'http://localhost:3000/api/emergency-contacts',
    'http://localhost:3000/api/stats',
    'http://localhost:3000/api/config'
  ];

  console.log('Testing all frontend pages and backend APIs...');
  let allPass = true;
  for (const r of routes) {
    const res = await testEndpoint(r);
    const mark = res.ok ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} [${res.status}] ${r} (${res.length} bytes)`);
    if (!res.ok) allPass = false;
  }

  if (allPass) {
    console.log('\n🎉 ALL 16 PAGES AND API ENDPOINTS ARE FULLY OPERATIONAL!');
  } else {
    console.log('\n⚠️ Some endpoints failed verification.');
    process.exit(1);
  }
})();
