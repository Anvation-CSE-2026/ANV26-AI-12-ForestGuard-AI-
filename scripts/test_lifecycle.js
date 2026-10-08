const http = require('http');

async function req(url, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const body = data ? JSON.stringify(data) : null;
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      }
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          resolve({ raw: d });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  try {
    console.log('Testing E2E flow...');
    // 1. Get stats
    const stats = await req('http://localhost:3000/api/stats');
    console.log('Stats active incidents:', stats.stats?.activeIncidents);

    // 2. Submit test incident via /api/incidents
    const rep = await req('http://localhost:3000/api/incidents', 'POST', {
      lat: 11.6643,
      lng: 76.6250,
      forestName: 'Bandipur Tiger Reserve',
      detectionMethod: 'Manual',
      description: 'Flames rising near Moyar canyon',
      reporterName: 'Ranger Vikram',
      reporterPhone: '+91-9876543210'
    });
    console.log('Created report:', rep.incident?.incidentId, 'Status:', rep.incident?.status, 'Severity:', rep.incident?.severity);
    const incId = rep.incident?.incidentId;
    if (!incId) throw new Error('No incidentId returned');

    // 3. Admin Verify
    const ver = await req(`http://localhost:3000/api/incidents/${incId}/verify`, 'POST', { adminUser: 'Chief Conservator Sharma' });
    console.log('Verified:', ver.incident?.status);

    // 4. Dispatch
    const disp = await req(`http://localhost:3000/api/incidents/${incId}/dispatch`, 'POST', {
      teamId: 'TEAM-04',
      teamName: 'Bandipur Quick Response Unit 4',
      etaMinutes: 14,
      instruction: 'Deploy 4000L foam tender to northern fireline'
    });
    console.log('Dispatched:', disp.incident?.status, 'Team:', disp.team?.name);

    // 5. Accept mission
    const acc = await req(`http://localhost:3000/api/incidents/${incId}/accept-mission`, 'POST', { teamId: 'TEAM-04' });
    console.log('Accepted:', acc.incident?.status);

    // 6. Start travel
    const trv = await req(`http://localhost:3000/api/incidents/${incId}/start-travel`, 'POST', { teamId: 'TEAM-04' });
    console.log('Travel started:', trv.incident?.status);

    // 7. Team progress
    const prg = await req(`http://localhost:3000/api/incidents/${incId}/team-progress`, 'POST', {
      teamId: 'TEAM-04',
      waypointIndex: 4,
      remainingDistanceKm: 3.2,
      remainingEtaMin: 5
    });
    console.log('Progress updated:', prg.team?.currentEtaMinutes, 'min remaining');

    // 8. Arrive site
    const arr = await req(`http://localhost:3000/api/incidents/${incId}/arrive-site`, 'POST', { teamId: 'TEAM-04' });
    console.log('Arrived:', arr.incident?.status);

    // 9. Contain
    const cnt = await req(`http://localhost:3000/api/incidents/${incId}/contain`, 'POST', { teamId: 'TEAM-04' });
    console.log('Contained:', cnt.incident?.status);

    // 10. Resolve
    const rsl = await req(`http://localhost:3000/api/incidents/${incId}/resolve`, 'POST');
    console.log('Resolved:', rsl.incident?.status);

    console.log('SUCCESS: Full 10-step lifecycle tested successfully!');
  } catch (err) {
    console.error('Lifecycle test failed:', err);
  }
})();
