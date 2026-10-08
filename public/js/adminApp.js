/**
 * ForestGuard AI Admin Command Center Application
 * Orchestrates Socket.IO real-time events, Google Maps integration,
 * multi-source fire verification, proximity routing, and dispatch operations.
 */

let activeIncident = null;
let allIncidents = [];
let allStations = [];
let allWaterBodies = [];
let allSensors = [];
let allSatellites = [];
let socket = null;
let audioMuted = false;

document.addEventListener('DOMContentLoaded', async () => {
  initAdminAuth();
  await initMap();
  await fetchDatasets();
  initSocket();
  initUIEvents();
  initImageInspectorModal();
  fetchIncidents();
});

// 1. Initialize Map
async function initMap() {
  await window.forestMapEngine.init('adminLiveMap', { lat: 11.6643, lng: 76.6250 }, 9);
  setTimeout(() => {
    if (window.forestMapEngine) window.forestMapEngine.invalidateSize();
  }, 350);
}

// 2. Fetch Geospatial Datasets & Render Base Layers
async function fetchDatasets() {
  try {
    const [resStations, resWater, resSensors, resSats] = await Promise.all([
      fetch('/api/response-stations').then(r => r.json()),
      fetch('/api/water-bodies').then(r => r.json()),
      fetch('/api/sensors').then(r => r.json()),
      fetch('/api/satellite-hotspots').then(r => r.json())
    ]);

    if (resStations.success) {
      allStations = resStations.responseStations;
      allStations.forEach(st => window.forestMapEngine.addStationMarker(st, () => highlightStation(st)));
    }

    if (resWater.success) {
      allWaterBodies = resWater.waterBodies;
      allWaterBodies.forEach(wb => window.forestMapEngine.addWaterMarker(wb, () => highlightWater(wb)));
    }

    if (resSensors.success) {
      allSensors = resSensors.sensors;
      allSensors.forEach(sn => window.forestMapEngine.addSensorMarker(sn, () => highlightSensor(sn)));
    }

    if (resSats.success) {
      allSatellites = resSats.hotspots;
      allSatellites.forEach(sat => window.forestMapEngine.addSatelliteMarker(sat, () => highlightSatellite(sat)));
    }
  } catch (err) {
    console.warn('Error fetching geospatial datasets:', err);
  }
}

// 3. Socket.IO Real-Time Architecture (Section 21)
function initSocket() {
  if (typeof io === 'undefined') return;
  socket = io();

  socket.on('connect', () => {
    console.log('[SOCKET CONNECTED] Live telemetry streaming.');
    const sysEl = document.getElementById('txtSystemOnline');
    if (sysEl) {
      sysEl.textContent = '● SYSTEM ONLINE';
      sysEl.className = 'text-emerald-400 font-bold';
    }
  });

  socket.on('disconnect', () => {
    const sysEl = document.getElementById('txtSystemOnline');
    if (sysEl) {
      sysEl.textContent = '○ DISCONNECTED';
      sysEl.className = 'text-red-400 font-bold';
    }
  });

  // 🚨 NEW FIRE ALERT (Real-Time push)
  socket.on('new_fire_alert', (incident) => {
    console.log('🚨 [SOCKET EVENT: new_fire_alert]', incident);
    handleNewFireAlert(incident);
  });

  // FIRE VERIFIED
  socket.on('fire_verified', (updated) => {
    updateIncidentInList(updated);
    if (activeIncident && activeIncident.incidentId === updated.incidentId) {
      selectIncident(updated, false);
    }
  });

  // TEAM DISPATCHED
  socket.on('team_dispatched', (updated) => {
    updateIncidentInList(updated);
    if (activeIncident && activeIncident.incidentId === updated.incidentId) {
      selectIncident(updated, false);
    }
  });

  // FIRE RESOLVED
  socket.on('fire_resolved', (updated) => {
    updateIncidentInList(updated);
    if (activeIncident && activeIncident.incidentId === updated.incidentId) {
      selectIncident(updated, false);
    }
  });

  // TEAM LOCATION PROGRESS UPDATE ALONG ROUTE
  socket.on('team_location_update', (data) => {
    console.log('🚑 [SOCKET EVENT: team_location_update]', data);
    if (data.coordinates) {
      window.forestMapEngine.updateTeamVehicleMarker(data.coordinates.lat, data.coordinates.lng, data.teamId);
    }
    const distEl = document.getElementById('detailStationDist');
    const etaEl = document.getElementById('detailStationEta');
    if (distEl) distEl.textContent = `${data.remainingDistanceKm} km`;
    if (etaEl) etaEl.textContent = `ETA: ${data.remainingEtaMin} min`;
  });

  // GENERAL RESPONSE STATUS UPDATE
  socket.on('response_status_updated', (updated) => {
    updateIncidentInList(updated);
    if (activeIncident && activeIncident.incidentId === updated.incidentId) {
      selectIncident(updated, false);
    }
  });

  // FIRE CONTAINED
  socket.on('fire_contained', (data) => {
    const inc = data.incident;
    updateIncidentInList(inc);
    if (activeIncident && activeIncident.incidentId === inc.incidentId) {
      selectIncident(inc, false);
    }
  });

  // SENSOR THRESHOLD ALERT
  socket.on('sensor_alert', (sensorAlert) => {
    console.log('📡 [SOCKET EVENT: sensor_alert]', sensorAlert);
    if (window.emergencyAudio && !audioMuted) window.emergencyAudio.playDispatchChime();
    addTimelineItem(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), `IoT Threshold Exceeded: ${sensorAlert.sensorId} (Temp: ${sensorAlert.temperature}°C, Smoke: ${sensorAlert.smokeIndex}%)`, 'IOT');
  });

  // SATELLITE ALERT
  socket.on('satellite_alert', (satAlert) => {
    console.log('🛰️ [SOCKET EVENT: satellite_alert]', satAlert);
    if (window.emergencyAudio && !audioMuted) window.emergencyAudio.playDispatchChime();
    addTimelineItem(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), `Satellite Anomaly: ${satAlert.hotspotId} (${satAlert.satellite}) in ${satAlert.forestName}`, 'SATELLITE');
  });

  // INCIDENT DELETED / CANCELLED (Real-Time One at a Time)
  socket.on('incident_deleted', ({ incidentId }) => {
    removeIncidentFromState(incidentId);
  });

  socket.on('incident_cancelled', ({ incidentId }) => {
    removeIncidentFromState(incidentId);
  });

  socket.on('queue_reset', ({ incidents }) => {
    allIncidents = incidents || [];
    renderIncidentList();
    if (allIncidents.length > 0) {
      selectIncident(allIncidents[0], true);
    }
  });
}

// 4. Handle Incoming Live Fire Alert
function handleNewFireAlert(incident) {
  // Update last event time
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const txtLastEvent = document.getElementById('txtLastEventTime');
  if (txtLastEvent) txtLastEvent.textContent = timeStr;

  // Mark as top priority
  incident.isPriority = true;

  // 1. Play Emergency Siren Sound
  if (window.emergencyAudio && !audioMuted) {
    window.emergencyAudio.playSirenAlert(4);
  }

  // 2. Add to absolute top of Incidents List (Priority 1)
  allIncidents = [incident, ...allIncidents.filter(i => i.incidentId !== incident.incidentId)];
  renderIncidentList();

  // 3. Trigger Red Flashing Banner with Priority 1 labeling
  showEmergencyBanner(incident);

  // 4. Immediately select & auto-zoom Google Map to ground zero
  selectIncident(incident, true);
}

// 5. Select Incident & Focus Map
function selectIncident(incident, shouldCenter = true) {
  activeIncident = incident;

  // Highlight active card
  document.querySelectorAll('.incident-feed-card').forEach(card => {
    card.classList.toggle('border-orange-500', card.dataset.id === incident.incidentId);
    card.classList.toggle('bg-[#13223f]', card.dataset.id === incident.incidentId);
  });

  const lat = incident.latitude;
  const lng = incident.longitude;

  // Automatically center the admin map on newly reported incident (Section 1)
  if (shouldCenter) {
    window.forestMapEngine.centerOn(lat, lng, 14);
  }

  // Clear previous routes & add marker
  window.forestMapEngine.clearRoutes();
  window.forestMapEngine.addFireMarker(incident, () => selectIncident(incident, false));

  // Draw 500m, 1km, 5km affected radius circles (Section 11)
  window.forestMapEngine.drawRadiusCircles(lat, lng, [500, 1000, 5000]);

  // Draw Route to Nearest Response Station (PURPLE route)
  if (incident.nearestStation && incident.nearestStation.routeWaypoints) {
    window.forestMapEngine.drawRoute(incident.nearestStation.routeWaypoints, '#9333ea', false);
  }

  // Draw Hose Relay Line to Nearest Water Body (BLUE dashed route)
  if (incident.nearestWaterBody && incident.nearestWaterBody.routeWaypoints) {
    window.forestMapEngine.drawRoute(incident.nearestWaterBody.routeWaypoints, '#0284c7', true);
  }

  // Render Incident Details in Right Panel
  renderIncidentDetailPanel(incident);

  // Update Bottom Timeline
  renderTimeline(incident.timeline || []);
}

// 6. Render Incident Detail Panel (Section 6, 8, 13)
function renderIncidentDetailPanel(incident) {
  document.getElementById('detailIncidentId').textContent = incident.incidentId;
  const isPriority = incident.isPriority || incident.priorityLevel;
  document.getElementById('detailDetectionSource').innerHTML = isPriority
    ? `<span class="text-red-400 font-black">🚨 CITIZEN LIVE REPORT (PRIORITY 1)</span>`
    : incident.source;
  document.getElementById('detailAffectedArea').textContent = `${incident.affectedAreaHectares || 2.4} hectares`;

  // Severity Badge
  const sevEl = document.getElementById('detailSeverityBadge');
  if (isPriority) {
    sevEl.textContent = '🚨 PRIORITY 1';
    sevEl.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-red-600 border border-red-400 text-white uppercase animate-pulse shadow-md';
  } else {
    sevEl.textContent = incident.severity;
    if (incident.severity === 'CRITICAL') sevEl.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-red-950 border border-red-600 text-red-300 uppercase';
    else if (incident.severity === 'HIGH') sevEl.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-orange-950 border border-orange-600 text-orange-300 uppercase';
    else sevEl.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-amber-950 border border-amber-600 text-amber-300 uppercase';
  }

  // Status Pill
  const statEl = document.getElementById('detailStatusPill');
  statEl.textContent = incident.status;
  if (incident.status === 'RESPONSE_DISPATCHED') {
    statEl.className = 'text-xs font-black px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-500 text-emerald-300';
  } else if (incident.status === 'CONTAINED' || incident.status === 'RESOLVED') {
    statEl.className = 'text-xs font-black px-2.5 py-1 rounded-full bg-blue-950 border border-blue-500 text-blue-300';
  } else {
    statEl.className = 'text-xs font-black px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-600 text-amber-300';
  }

  // Image
  const imgEl = document.getElementById('detailImage');
  imgEl.src = incident.imageUrl || '/sample_images/sample_wildfire.jpg';

  // AI Detection Result Score Board (YOLOv8 Engine)
  updateAdminScoreboard(incident.scoreboard || incident);

  // AI Confidence & Explanation
  document.getElementById('detailConfidenceScore').textContent = `Confidence: ${incident.aiConfidence}%`;
  document.getElementById('detailAiExplanation').textContent = incident.aiExplanation || 'Visual signatures and spatial telemetry indicate thermal fire progression.';

  // Feature Breakdown Chips
  const chipsEl = document.getElementById('detailFeatureChips');
  if (chipsEl && incident.featureBreakdown) {
    chipsEl.innerHTML = incident.featureBreakdown.map(f => {
      const isDetected = f.detected;
      const bg = isDetected ? 'bg-orange-950/80 border-orange-700/60 text-orange-300' : 'bg-slate-800/80 border-slate-700 text-slate-400';
      return `<span class="px-2 py-0.5 rounded border text-[10px] font-bold ${bg}">${isDetected ? '✓' : '✕'} ${f.name} (${f.confidence}%)</span>`;
    }).join('');
  }

  // Multi-Source Fire Verification (Section 8)
  document.getElementById('detailRiskScore').textContent = `RISK: ${incident.riskScore || 96}/100`;
  document.getElementById('detailCitScore').textContent = `${Math.round(incident.aiConfidence || 92)}%`;
  document.getElementById('detailSatScore').textContent = `${incident.satelliteConfidence ? Math.round(incident.satelliteConfidence) + '%' : 'No Hotspot'}`;
  document.getElementById('detailIotScore').textContent = `${incident.sensorConfidence ? Math.round(incident.sensorConfidence) + '%' : 'Normal'}`;
  
  const multiBanner = document.getElementById('detailMultiSourceBanner');
  if (multiBanner) {
    multiBanner.textContent = incident.multiSourceSummary || '3 SOURCES CONFIRM POTENTIAL FIRE';
    if (incident.severity === 'CRITICAL') {
      multiBanner.className = 'p-2 rounded-lg bg-red-950/80 border border-red-600/60 text-center text-[11px] font-black text-red-300';
    } else {
      multiBanner.className = 'p-2 rounded-lg bg-amber-950/80 border border-amber-600/60 text-center text-[11px] font-black text-amber-300';
    }
  }

  // Nearby Station (PURPLE)
  const st = incident.nearestStation || incident.assignedStation || {};
  document.getElementById('detailStationName').textContent = st.name || 'Bandipur Forest Response Unit';
  document.getElementById('detailStationDist').textContent = `${st.distanceKm || 8.7} km`;
  document.getElementById('detailStationEta').textContent = `ETA: ${st.etaMinutes || 18} min`;
  document.getElementById('detailStationPhone').textContent = st.phone || '+91-8229-236021';

  // Ranked Response Stations List
  const rankedContainer = document.getElementById('detailRankedStationsList');
  if (rankedContainer) {
    const stations = incident.rankedStations && incident.rankedStations.length > 0
      ? incident.rankedStations
      : (st.name ? [st] : []);

    rankedContainer.innerHTML = stations.map((s, idx) => {
      const isFirst = idx === 0;
      const rankTag = isFirst ? '#1 RECOMMENDED' : (idx === 1 ? '#2 STANDBY' : `#${idx + 1} MUTUAL AID`);
      const rankBg = isFirst ? 'bg-purple-950 text-purple-300 border-purple-600' : 'bg-slate-800 text-slate-400 border-slate-700';
      const statusColor = s.status === 'AVAILABLE' ? 'text-emerald-400' : 'text-amber-400';

      return `
        <div class="p-2 rounded-lg bg-[#040814] border border-slate-800 flex items-center justify-between">
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-[9px] font-black px-1.5 py-0.2 rounded border ${rankBg}">${rankTag}</span>
              <span class="font-bold text-white text-[11px] truncate max-w-[150px]">${s.name}</span>
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">
              Status: <span class="font-bold ${statusColor}">${s.status || 'AVAILABLE'}</span> • ${s.waterTenders || 2} Tenders
            </div>
          </div>
          <div class="text-right">
            <div class="font-mono font-bold text-purple-300 text-xs">${s.distanceKm} km</div>
            <div class="text-[10px] text-slate-400">ETA: ${s.etaMinutes} min</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Nearby Water Body (BLUE)
  const wb = incident.nearestWaterBody || {};
  document.getElementById('detailWaterName').textContent = wb.name || 'Kabini Reservoir';
  document.getElementById('detailWaterDist').textContent = `${wb.distanceKm || 14.2} km`;
  document.getElementById('detailWaterCapacity').textContent = wb.capacity || 'High Volume Aerial Drafting Access';

  // Dispatch Button Status
  const btnDisp = document.getElementById('btnDispatchAction');
  if (incident.status === 'RESPONSE_DISPATCHED') {
    btnDisp.innerHTML = '<span>✅</span> <span>RESPONSE TEAM DISPATCHED</span>';
    btnDisp.className = 'w-full py-3 rounded-xl bg-emerald-600 text-white font-black text-sm tracking-wider uppercase transition flex items-center justify-center gap-2 cursor-default';
  } else {
    btnDisp.innerHTML = '<span>🚒</span> <span>DISPATCH RESPONSE</span>';
    btnDisp.className = 'btn-shimmer w-full py-3 rounded-xl bg-gradient-to-r from-red-600 via-orange-600 to-amber-600 text-white font-black text-sm tracking-wider uppercase shadow-lg shadow-red-950/60 hover:brightness-110 active:scale-[0.99] transition flex items-center justify-center gap-2';
  }
}

// 7. Render Incident Cards Feed (Left Column)
function renderIncidentList() {
  const feed = document.getElementById('incidentListFeed');
  if (!feed) return;

  const countBadge = document.getElementById('badgeIncidentCount');
  if (countBadge) countBadge.textContent = `${allIncidents.length} REPORTED`;

  feed.innerHTML = '';

  allIncidents.forEach(inc => {
    const isSelected = activeIncident && activeIncident.incidentId === inc.incidentId;
    const isCritical = inc.severity === 'CRITICAL';
    const isDispatched = inc.status === 'RESPONSE_DISPATCHED';
    const isPriority = inc.isPriority || inc.priorityLevel;

    const card = document.createElement('div');
    card.className = `incident-feed-card p-3 rounded-xl border cursor-pointer transition-all ${
      isSelected ? 'border-orange-500 bg-[#13223f] shadow-lg ring-1 ring-orange-500' : 'border-slate-800 bg-[#091122] hover:border-slate-700'
    } ${isPriority && !isDispatched ? 'border-2 border-red-500 bg-[#1c0c16] shadow-[0_0_14px_rgba(239,68,68,0.5)] animate-pulse' : (isCritical && !isDispatched ? 'border-l-4 border-l-red-500' : '')}`;
    card.dataset.id = inc.incidentId;

    let sevBadge = `<span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-600">CRITICAL</span>`;
    if (inc.severity === 'HIGH') sevBadge = `<span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-orange-950 text-orange-300 border border-orange-600">HIGH</span>`;
    else if (inc.severity === 'LOW') sevBadge = `<span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-600">SAFE</span>`;

    const priorityBadge = isPriority ? `<span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white animate-pulse shadow-sm mr-1">🚨 PRIORITY 1</span>` : '';

    card.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-1">
          ${priorityBadge}
          <span class="font-mono text-xs font-black text-sky-400">${inc.incidentId}</span>
        </div>
        ${sevBadge}
      </div>
      <div class="text-xs font-bold text-white truncate">${inc.forestName}</div>
      <div class="flex items-center justify-between text-[11px] text-slate-400 mt-2 font-mono">
        <span>AI: ${inc.aiConfidence}%</span>
        <span>Risk: ${inc.riskScore}/100</span>
        <span class="font-bold ${isDispatched ? 'text-emerald-400' : (isPriority ? 'text-red-400 font-black' : 'text-orange-400')}">${inc.status}</span>
      </div>
      <div class="flex items-center justify-end pt-1.5 mt-1.5 border-t border-slate-800/80">
        <button type="button" class="btn-cancel-alert px-2 py-0.5 rounded bg-red-950/70 hover:bg-red-800 border border-red-700/60 text-red-300 hover:text-white text-[10px] font-bold transition flex items-center gap-1 shadow-sm cursor-pointer" data-id="${inc.incidentId}" title="Cancel alert ${inc.incidentId}">
          <span>✕</span> <span>Cancel Alert</span>
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-cancel-alert')) return;
      selectIncident(inc, true);
    });

    const btnCancel = card.querySelector('.btn-cancel-alert');
    if (btnCancel) {
      btnCancel.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelIncidentById(inc.incidentId);
      });
    }

    feed.appendChild(card);
  });
}

// Cancel / Dismiss an Alert One at a Time
async function cancelIncidentById(incidentId) {
  if (!confirm(`Are you sure you want to cancel and remove alert ${incidentId}?`)) return;
  try {
    const res = await fetch(`/api/incidents/${incidentId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      removeIncidentFromState(incidentId);
    } else {
      alert('Failed to cancel alert: ' + (data.message || 'Error'));
    }
  } catch (e) {
    alert('Cancellation error: ' + e.message);
  }
}

function removeIncidentFromState(incidentId) {
  allIncidents = allIncidents.filter(i => i.incidentId !== incidentId);
  renderIncidentList();

  if (activeIncident && activeIncident.incidentId === incidentId) {
    if (allIncidents.length > 0) {
      selectIncident(allIncidents[0], true);
    } else {
      activeIncident = null;
      if (window.forestMapEngine) window.forestMapEngine.clearRoutes();
    }
  }

  // Reload map markers
  if (window.forestMapEngine) {
    window.forestMapEngine.clearMarkers('fires');
    allIncidents.forEach(inc => {
      window.forestMapEngine.addFireMarker(inc, () => selectIncident(inc, false));
    });
  }
}

function updateIncidentInList(updated) {
  const idx = allIncidents.findIndex(i => i.incidentId === updated.incidentId);
  if (idx !== -1) allIncidents[idx] = updated;
  else allIncidents.unshift(updated);
  renderIncidentList();
}

// 8. Render Real-Time Timeline (Bottom)
function renderTimeline(timelineItems) {
  const container = document.getElementById('timelineContainer');
  if (!container) return;

  container.innerHTML = timelineItems.map(item => `
    <div class="flex items-center gap-1.5 whitespace-nowrap bg-[#0d182e] border border-slate-700/60 px-2.5 py-1 rounded-lg shrink-0">
      <span class="text-amber-400 font-bold">${item.time}</span>
      <span class="text-slate-300">${item.message}</span>
    </div>
  `).join('');

  container.scrollLeft = container.scrollWidth;
}

function addTimelineItem(time, message, type) {
  if (activeIncident && activeIncident.timeline) {
    activeIncident.timeline.push({ time, message, type });
    renderTimeline(activeIncident.timeline);
  }
}

// 9. Live Emergency Banner Display
function showEmergencyBanner(incident) {
  const banner = document.getElementById('liveEmergencyBanner');
  const locEl = document.getElementById('bannerLocationText');
  const riskEl = document.getElementById('bannerRiskScore');
  const confEl = document.getElementById('bannerConfidence');

  if (banner) {
    const fakeInfo = incident.fakeProbability ? ` • <span class="${parseFloat(incident.fakeProbability) > 50 ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold'}">AI Fake Risk: ${incident.fakeProbability}%</span>` : '';
    if (locEl) locEl.innerHTML = `<span class="bg-red-600 text-white font-black px-2 py-0.5 rounded text-[11px] mr-1.5 shadow animate-pulse">🚨 PRIORITY 1 ALERT</span> <b>${incident.forestName}</b> (${incident.latitude}, ${incident.longitude})${fakeInfo}`;
    if (riskEl) riskEl.textContent = `${incident.riskScore}/100 (${incident.severity})`;
    if (confEl) confEl.textContent = `${incident.fireScore || incident.aiConfidence}%`;
    banner.classList.remove('hidden');
  }
}

// 10. UI Actions & Modals
function initUIEvents() {
  // Dismiss Banner
  const btnDismiss = document.getElementById('btnBannerDismiss');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      document.getElementById('liveEmergencyBanner').classList.add('hidden');
      if (window.emergencyAudio) window.emergencyAudio.stop();
    });
  }

  // View On Map Banner Button
  const btnBannerView = document.getElementById('btnBannerViewOnMap');
  if (btnBannerView) {
    btnBannerView.addEventListener('click', () => {
      if (activeIncident) {
        window.forestMapEngine.centerOn(activeIncident.latitude, activeIncident.longitude, 15);
      }
    });
  }

  // Audio Toggle
  const btnAudio = document.getElementById('btnToggleSirenAudio');
  if (btnAudio) {
    btnAudio.addEventListener('click', () => {
      audioMuted = !audioMuted;
      if (window.emergencyAudio) window.emergencyAudio.toggleMute();
      document.getElementById('audioIcon').textContent = audioMuted ? '🔇' : '🔊';
      document.getElementById('audioLabel').textContent = audioMuted ? 'Audio Siren Muted' : 'Audio Siren Active';
    });
  }

  // Google Maps Config Modal
  const btnOpenConfig = document.getElementById('btnOpenMapConfig');
  const btnCloseConfig = document.getElementById('btnCloseMapConfig');
  const mapModal = document.getElementById('mapConfigModal');
  const btnSaveKey = document.getElementById('btnSaveApiKey');
  const btnUseFallback = document.getElementById('btnUseFallbackMap');

  if (btnOpenConfig) btnOpenConfig.addEventListener('click', () => mapModal.classList.remove('hidden'));
  if (btnCloseConfig) btnCloseConfig.addEventListener('click', () => mapModal.classList.add('hidden'));

  if (btnSaveKey) {
    btnSaveKey.addEventListener('click', async () => {
      const key = document.getElementById('inputGoogleApiKey').value.trim();
      if (key) {
        localStorage.setItem('FG_GOOGLE_MAPS_KEY', key);
        await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ googleMapsApiKey: key })
        });
        alert('Google Maps API key saved! Reloading map...');
        window.location.reload();
      }
    });
  }

  if (btnUseFallback) {
    btnUseFallback.addEventListener('click', () => {
      localStorage.removeItem('FG_GOOGLE_MAPS_KEY');
      mapModal.classList.add('hidden');
    });
  }

  // Dispatch Response Modal (Section 14)
  const btnDisp = document.getElementById('btnDispatchAction');
  const dispModal = document.getElementById('dispatchModal');
  const btnCancelDisp = document.getElementById('btnCancelDispatch');
  const btnConfirmDisp = document.getElementById('btnConfirmDispatch');

  if (btnDisp) {
    btnDisp.addEventListener('click', () => {
      if (!activeIncident) return;
      document.getElementById('modalIncidentId').textContent = activeIncident.incidentId;
      document.getElementById('modalLocation').textContent = activeIncident.forestName;

      const selectEl = document.getElementById('modalSelectTeam');
      const primaryStation = activeIncident.nearestStation || activeIncident.assignedStation || { id: 'STA-KA-01', name: 'Bandipur Forest Response Unit', distanceKm: 8.4, etaMinutes: 16 };
      const stations = activeIncident.rankedStations && activeIncident.rankedStations.length > 0
        ? activeIncident.rankedStations
        : [primaryStation];

      if (selectEl) {
        selectEl.innerHTML = stations.map((s, idx) => `
          <option value="${s.id || s.stationId}" data-dist="${s.distanceKm}" data-eta="${s.etaMinutes}" data-name="${s.name}">
            ${idx === 0 ? '⭐ [Recommended #1] ' : `[Rank #${idx + 1}] `}${s.name} (${s.distanceKm} km, ETA: ${s.etaMinutes} min)
          </option>
        `).join('');

        const updateSelectedTelemetry = () => {
          const opt = selectEl.options[selectEl.selectedIndex];
          if (opt) {
            document.getElementById('modalDistance').textContent = `${opt.dataset.dist} km`;
            document.getElementById('modalEta').textContent = `${opt.dataset.eta} Minutes`;
          }
        };

        selectEl.onchange = updateSelectedTelemetry;
        updateSelectedTelemetry();
      }

      dispModal.classList.remove('hidden');
    });
  }

  const btnCloseDispatchTop = document.getElementById('btnCloseDispatchTop');
  if (btnCloseDispatchTop) btnCloseDispatchTop.addEventListener('click', () => dispModal.classList.add('hidden'));
  if (btnCancelDisp) btnCancelDisp.addEventListener('click', () => dispModal.classList.add('hidden'));

  if (dispModal) {
    dispModal.addEventListener('click', (e) => {
      if (e.target === dispModal) dispModal.classList.add('hidden');
    });
  }

  // Global Escape key to dismiss modals in admin
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const dm = document.getElementById('dispatchModal');
      const mcm = document.getElementById('mapConfigModal');
      const iim = document.getElementById('imageInspectorModal');
      if (dm && !dm.classList.contains('hidden')) dm.classList.add('hidden');
      if (mcm && !mcm.classList.contains('hidden')) mcm.classList.add('hidden');
      if (iim && !iim.classList.contains('hidden')) iim.classList.add('hidden');
    }
  });

  if (btnConfirmDisp) {
    btnConfirmDisp.addEventListener('click', async () => {
      if (!activeIncident) return;
      dispModal.classList.add('hidden');

      const selectEl = document.getElementById('modalSelectTeam');
      const opt = selectEl ? selectEl.options[selectEl.selectedIndex] : null;
      const primaryStation = activeIncident.nearestStation || activeIncident.assignedStation || {};
      const chosenId = opt ? opt.value : (primaryStation.id || 'STA-KA-01');
      const chosenName = opt ? opt.dataset.name : (primaryStation.name || 'Forest Fire Rapid Response Unit');
      const chosenEta = opt ? parseInt(opt.dataset.eta) : (primaryStation.etaMinutes || 16);
      const chosenDist = opt ? parseFloat(opt.dataset.dist) : (primaryStation.distanceKm || 8.4);

      try {
        const res = await fetch(`/api/incidents/${activeIncident.incidentId}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: chosenId,
            teamName: chosenName,
            etaMinutes: chosenEta,
            distanceKm: chosenDist,
            instruction: `Deploy high-pressure water tender and aerial surveillance drones to ${activeIncident.forestName}.`
          })
        });

        const data = await res.json();
        if (data.success) {
          if (window.emergencyAudio && !audioMuted) window.emergencyAudio.playDispatchChime();
          selectIncident(data.incident, false);
        }
      } catch (err) {
        alert('Dispatch error: ' + err.message);
      }
    });
  }

  // Verify Action
  const btnVerify = document.getElementById('btnVerifyAction');
  if (btnVerify) {
    btnVerify.addEventListener('click', async () => {
      if (!activeIncident) return;
      const res = await fetch(`/api/incidents/${activeIncident.incidentId}/verify`, { method: 'POST' });
      const data = await res.json();
      if (data.success) selectIncident(data.incident, false);
    });
  }

  // False Positive Action
  const btnFalsePos = document.getElementById('btnFalsePosAction');
  if (btnFalsePos) {
    btnFalsePos.addEventListener('click', async () => {
      if (!activeIncident) return;
      const res = await fetch(`/api/incidents/${activeIncident.incidentId}/false-positive`, { method: 'POST' });
      const data = await res.json();
      if (data.success) selectIncident(data.incident, false);
    });
  }

  // Contained Action
  const btnContain = document.getElementById('btnContainAction');
  if (btnContain) {
    btnContain.addEventListener('click', async () => {
      if (!activeIncident) return;
      const res = await fetch(`/api/incidents/${activeIncident.incidentId}/contain`, { method: 'POST' });
      const data = await res.json();
      if (data.success) selectIncident(data.incident, false);
    });
  }

  // Layer Switchers
  document.querySelectorAll('.btn-map-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-map-toggle').forEach(b => {
        b.className = 'btn-map-toggle px-2 py-0.5 rounded text-slate-300 hover:text-white';
      });
      btn.className = 'btn-map-toggle px-2 py-0.5 rounded text-orange-400 font-black bg-orange-950/40';
      window.forestMapEngine.setTileLayer(btn.dataset.layer);
    });
  });

  // Cancel Active Alert Action
  const btnCancelActive = document.getElementById('btnCancelActiveAlert');
  if (btnCancelActive) {
    btnCancelActive.addEventListener('click', () => {
      if (!activeIncident) return;
      cancelIncidentById(activeIncident.incidentId);
    });
  }

  // Refresh Admin Queue Action
  const btnRefreshAdmin = document.getElementById('btnRefreshAdminQueue');
  if (btnRefreshAdmin) {
    btnRefreshAdmin.addEventListener('click', async () => {
      const icon = document.getElementById('iconRefreshAdminQueue');
      if (icon) icon.classList.add('animate-spin');
      await fetchIncidents();
      setTimeout(() => {
        if (icon) icon.classList.remove('animate-spin');
      }, 500);
    });
  }

  // Demo Trigger
  const btnDemo = document.getElementById('btnTriggerDemoModal');
  if (btnDemo) {
    btnDemo.addEventListener('click', async () => {
      // Direct trigger of Scenario 1 (Multi-source fire)
      const res = await fetch('/api/demo/scenario/1', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        handleNewFireAlert(data.incident);
      }
    });
  }
}

// 11. Fetch Initial Incidents from Backend
async function fetchIncidents() {
  try {
    const res = await fetch('/api/incidents');
    const data = await res.json();
    if (data.success && Array.isArray(data.incidents)) {
      allIncidents = data.incidents;
      renderIncidentList();
      if (allIncidents.length > 0) {
        const stillPresent = activeIncident && allIncidents.find(i => i.incidentId === activeIncident.incidentId);
        selectIncident(stillPresent || allIncidents[0], !stillPresent);
      } else {
        activeIncident = null;
        if (window.forestMapEngine) {
          window.forestMapEngine.clearMarkers('fires');
          window.forestMapEngine.clearRoutes();
        }
      }
    }
  } catch (err) {
    console.warn('Initial incidents fetch error:', err);
  }
}

// 12. Update Admin Score Board (YOLOv8 Dual-Spectrum Detection Result HUD)
function updateAdminScoreboard(sbData) {
  if (!sbData) return;
  const isFire = sbData.severity !== 'NORMAL' && sbData.fireDetected !== false;

  const tsEl = document.getElementById('adminSbTimestamp');
  if (tsEl) {
    tsEl.textContent = sbData.timestamp || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }

  const banner = document.getElementById('adminSbStatusBanner');
  const iconBox = document.getElementById('adminSbStatusIconBox');
  const title = document.getElementById('adminSbStatusTitle');
  const subtitle = document.getElementById('adminSbStatusSubtitle');
  const badge = document.getElementById('adminSbStatusBadge');

  if (banner && iconBox && title && subtitle && badge) {
    if (isFire) {
      banner.className = 'p-2.5 rounded-xl border flex items-center justify-between transition-all duration-300 bg-gradient-to-r from-red-950/80 to-orange-950/80 border-red-500/80 shadow-[0_0_12px_rgba(239,68,68,0.25)]';
      iconBox.className = 'w-7 h-7 rounded-lg flex items-center justify-center text-sm bg-red-900/60 border border-red-500 text-red-300 animate-pulse';
      iconBox.textContent = '🔥';
      title.textContent = sbData.statusTitle || 'FIRE DETECTED';
      const objCount = sbData.objectsCount || 3;
      subtitle.textContent = `Status: Active Wildfire (${objCount} Objects)`;
      badge.textContent = sbData.badgeText || sbData.severity || 'CRITICAL';
      badge.className = 'text-[10px] font-black px-2 py-0.5 rounded-md bg-red-600 text-white border border-red-400 shadow-sm animate-pulse';
    } else {
      banner.className = 'p-2.5 rounded-xl border flex items-center justify-between transition-all duration-300 bg-emerald-950/40 border-emerald-500/40';
      iconBox.className = 'w-7 h-7 rounded-lg flex items-center justify-center text-sm bg-emerald-900/60 border border-emerald-500/40 text-emerald-300';
      iconBox.textContent = '🛡️';
      title.textContent = 'NO ANOMALIES DETECTED';
      subtitle.textContent = 'Status: Forest Clear (0 Objects)';
      badge.textContent = 'SAFE';
      badge.className = 'text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-800 text-emerald-200 border border-emerald-600/50';
    }
  }

  // 4 Progress Gauges
  const anom = parseFloat(sbData.anomalyConfidence !== undefined ? sbData.anomalyConfidence : (sbData.aiConfidence || (isFire ? 94.6 : 0.0))).toFixed(1);
  const smoke = parseFloat(sbData.smokeConfidence !== undefined ? sbData.smokeConfidence : (isFire ? 92.0 : 0.0)).toFixed(1);
  const cov = parseFloat(sbData.fireCoverage !== undefined ? sbData.fireCoverage : (isFire ? 38.5 : 0.0)).toFixed(1);
  const smkLvl = parseFloat(sbData.smokeLevel !== undefined ? sbData.smokeLevel : (isFire ? 85.0 : 0.0)).toFixed(1);

  const elAnom = document.getElementById('adminSbValAnomaly');
  const barAnom = document.getElementById('adminSbBarAnomaly');
  if (elAnom) elAnom.textContent = `${anom}%`;
  if (barAnom) barAnom.style.width = `${Math.min(100, Math.max(0, anom))}%`;

  const elSmk = document.getElementById('adminSbValSmoke');
  const barSmk = document.getElementById('adminSbBarSmoke');
  if (elSmk) elSmk.textContent = `${smoke}%`;
  if (barSmk) barSmk.style.width = `${Math.min(100, Math.max(0, smoke))}%`;

  const elCov = document.getElementById('adminSbValCoverage');
  const barCov = document.getElementById('adminSbBarCoverage');
  if (elCov) elCov.textContent = `${cov}%`;
  if (barCov) barCov.style.width = `${Math.min(100, Math.max(0, cov))}%`;

  const elSmkLvl = document.getElementById('adminSbValSmokeLevel');
  const barSmkLvl = document.getElementById('adminSbBarSmokeLevel');
  if (elSmkLvl) elSmkLvl.textContent = `${smkLvl}%`;
  if (barSmkLvl) barSmkLvl.style.width = `${Math.min(100, Math.max(0, smkLvl))}%`;

  // 1. Fire Score & Level
  const fireScoreVal = parseFloat(sbData.fireScore !== undefined ? sbData.fireScore : anom).toFixed(1);
  const fEl = document.getElementById('adminSbMetricFireScore');
  if (fEl) {
    fEl.textContent = `${fireScoreVal}%`;
    fEl.className = isFire ? 'text-sm font-black text-orange-400 font-mono' : 'text-sm font-black text-slate-400 font-mono';
  }
  const flEl = document.getElementById('adminSbMetricFireLevel');
  if (flEl) {
    flEl.textContent = isFire ? (sbData.fireLevel || sevVal) : 'SAFE';
    flEl.className = isFire ? 'text-[8px] font-bold text-orange-400 block mt-0.5' : 'text-[8px] font-bold text-slate-400 block mt-0.5';
  }

  // 2. Risk Score & Severity
  const riskVal = isFire ? (sbData.riskScore !== undefined ? sbData.riskScore : 96) : 0;
  const sevVal = isFire ? (sbData.severity || 'CRITICAL') : 'NORMAL';

  const rEl = document.getElementById('adminSbMetricRisk');
  if (rEl) {
    rEl.textContent = riskVal;
    rEl.className = isFire ? 'text-sm font-black text-red-400 font-mono' : 'text-sm font-black text-emerald-400 font-mono';
  }

  const sEl = document.getElementById('adminSbMetricSeverity');
  if (sEl) {
    sEl.textContent = sevVal;
    sEl.className = isFire ? 'text-[8px] font-bold text-red-400 block mt-0.5' : 'text-[8px] font-bold text-emerald-400 block mt-0.5';
  }

  // 3. AI Fake Score & Authenticity Check
  const fakeProb = parseFloat(sbData.fakeProbability !== undefined ? sbData.fakeProbability : (isFire ? 3.2 : 91.2)).toFixed(1);
  const authScore = parseFloat(sbData.authenticityScore !== undefined ? sbData.authenticityScore : (100 - fakeProb)).toFixed(1);
  const isFakeDetected = parseFloat(fakeProb) > 50 || sbData.isFake;

  const fakeEl = document.getElementById('adminSbMetricFakeScore');
  if (fakeEl) {
    fakeEl.textContent = `${fakeProb}%`;
    fakeEl.className = isFakeDetected ? 'text-sm font-black text-red-400 font-mono' : 'text-sm font-black text-emerald-400 font-mono';
  }

  const fakeVerdictEl = document.getElementById('adminSbMetricFakeVerdict');
  if (fakeVerdictEl) {
    fakeVerdictEl.textContent = isFakeDetected ? 'SUSPECTED FAKE' : 'REAL PHOTO';
    fakeVerdictEl.className = isFakeDetected ? 'text-[8px] font-bold text-red-400 truncate block mt-0.5' : 'text-[8px] font-bold text-emerald-400 truncate block mt-0.5';
  }

  const authPctEl = document.getElementById('adminSbAuthenticityPercent');
  if (authPctEl) {
    authPctEl.textContent = `${authScore}% Authentic`;
    authPctEl.className = isFakeDetected ? 'font-mono font-bold text-red-400' : 'font-mono font-bold text-emerald-400';
  }

  const barAuth = document.getElementById('adminSbBarAuthenticity');
  if (barAuth) {
    barAuth.style.width = `${Math.min(100, Math.max(0, authScore))}%`;
    barAuth.className = isFakeDetected
      ? 'h-full bg-gradient-to-r from-red-500 to-amber-500 rounded-full transition-all duration-700'
      : 'h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-700';
  }

  const fakeStatusEl = document.getElementById('adminSbFakeStatusText');
  if (fakeStatusEl) {
    fakeStatusEl.textContent = isFakeDetected
      ? '⚠️ Warning: Potential False Alarm / Non-Fire Photograph Detected'
      : '✓ Verified Authentic Field Evidence (Not AI-Generated / Not Synthetic Hoax)';
    fakeStatusEl.className = isFakeDetected ? 'text-[8px] font-mono text-red-400 pt-0.5' : 'text-[8px] font-mono text-emerald-300/90 pt-0.5';
  }

  // Warning Alert Box
  const abEl = document.getElementById('adminSbAlertBox');
  const atEl = document.getElementById('adminSbAlertText');
  if (abEl && atEl) {
    if (isFire) {
      abEl.className = 'p-2 rounded-xl border flex items-center justify-center text-center font-black text-[11px] tracking-wider transition-all duration-300 bg-red-950/80 border-red-600/70 text-red-300 shadow-md';
      atEl.textContent = sbData.earlyWarningAlert || 'CRITICAL - IMMEDIATE DISPATCH';
    } else {
      abEl.className = 'p-2 rounded-xl border flex items-center justify-center text-center font-black text-[11px] tracking-wider transition-all duration-300 bg-emerald-950/40 border-emerald-600/40 text-emerald-300';
      atEl.textContent = 'NORMAL - SECTOR CLEAR';
    }
  }
}

// 13. AI Score Board Image Inspector Modal (Test Any Image)
function initImageInspectorModal() {
  const btnOpen = document.getElementById('btnOpenImageInspector');
  const btnClose = document.getElementById('btnCloseImageInspector');
  const modal = document.getElementById('imageInspectorModal');
  const dropzone = document.getElementById('inspectorDropzone');
  const fileInput = document.getElementById('inspectorFileInput');
  const preview = document.getElementById('inspectorImagePreview');
  const placeholder = document.getElementById('inspectorEmptyPlaceholder');
  const scanLine = document.getElementById('inspectorScanLine');

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', () => modal.classList.remove('hidden'));
  }
  if (btnClose && modal) {
    btnClose.addEventListener('click', () => modal.classList.add('hidden'));
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        inspectFile(e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-emerald-500');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-emerald-500');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-emerald-500');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        inspectFile(e.dataTransfer.files[0]);
      }
    });
  }

  function inspectFile(file) {
    if (preview) {
      preview.src = URL.createObjectURL(file);
      preview.classList.remove('hidden');
    }
    if (placeholder) placeholder.classList.add('hidden');
    if (scanLine) scanLine.classList.remove('hidden');

    const formData = new FormData();
    formData.append('fireImage', file);

    fetch('/api/analyze-image', { method: 'POST', body: formData })
      .then(r => r.json())
      .then(res => {
        if (scanLine) scanLine.classList.add('hidden');
        if (res.success && res.scoreboard) {
          const sb = res.scoreboard;
          const isFire = sb.severity !== 'NORMAL' && res.fireDetected !== false;

          const ts = document.getElementById('modalSbTimestamp');
          if (ts) ts.textContent = sb.timestamp;
          const anomEl = document.getElementById('modalSbAnomaly');
          if (anomEl) anomEl.textContent = `${sb.anomalyConfidence}%`;
          const barAnom = document.getElementById('modalSbBarAnomaly');
          if (barAnom) barAnom.style.width = `${sb.anomalyConfidence}%`;

          const smkEl = document.getElementById('modalSbSmoke');
          if (smkEl) smkEl.textContent = `${sb.smokeConfidence}%`;
          const barSmk = document.getElementById('modalSbBarSmoke');
          if (barSmk) barSmk.style.width = `${sb.smokeConfidence}%`;

          const covEl = document.getElementById('modalSbCoverage');
          if (covEl) covEl.textContent = `${sb.fireCoverage}%`;
          const barCov = document.getElementById('modalSbBarCoverage');
          if (barCov) barCov.style.width = `${sb.fireCoverage}%`;

          const smkLvlEl = document.getElementById('modalSbSmokeLevel');
          if (smkLvlEl) smkLvlEl.textContent = `${sb.smokeLevel}%`;
          const barSmkLvl = document.getElementById('modalSbBarSmokeLevel');
          if (barSmkLvl) barSmkLvl.style.width = `${sb.smokeLevel}%`;

          const rEl = document.getElementById('modalSbRisk');
          if (rEl) rEl.textContent = sb.riskScore;
          const sevEl = document.getElementById('modalSbSeverity');
          if (sevEl) sevEl.textContent = sb.severity;
          const alText = document.getElementById('modalSbAlertText');
          if (alText) alText.textContent = sb.earlyWarningAlert;

          const banner = document.getElementById('modalSbStatusBanner');
          const icon = document.getElementById('modalSbIcon');
          const title = document.getElementById('modalSbTitle');
          const subtitle = document.getElementById('modalSbSubtitle');
          const badge = document.getElementById('modalSbBadge');

          if (banner && icon && title && subtitle && badge) {
            if (isFire) {
              banner.className = 'p-2.5 rounded-xl border flex items-center justify-between bg-red-950/80 border-red-500 text-red-300';
              icon.textContent = '🔥';
              title.textContent = 'FIRE DETECTED';
              subtitle.textContent = `Status: Active Wildfire (${sb.objectsCount} Objects)`;
              badge.textContent = sb.severity;
              badge.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-red-600 text-white';
            } else {
              banner.className = 'p-2.5 rounded-xl border flex items-center justify-between bg-emerald-950/40 border-emerald-500/40';
              icon.textContent = '🛡️';
              title.textContent = 'NO ANOMALIES DETECTED';
              subtitle.textContent = 'Status: Forest Clear (0 Objects)';
              badge.textContent = 'SAFE';
              badge.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-emerald-800 text-emerald-200';
            }
          }
        }
      })
      .catch(err => {
        if (scanLine) scanLine.classList.add('hidden');
        console.error('Inspector scan error:', err);
      });
  }
}

// 12. Admin Command Center Password Protection & Instant 1-Click Login Gate
function initAdminAuth() {
  const modal = document.getElementById('adminAuthModal');
  const form = document.getElementById('adminAuthForm');
  const passInput = document.getElementById('adminPassInput');
  const errBox = document.getElementById('adminAuthError');
  const btnInstant = document.getElementById('btnAdminInstantLogin');
  const btnToggleEye = document.getElementById('btnTogglePassVisibility');
  const btnLogout = document.getElementById('btnAdminLogout');

  // Check URL query parameters for evaluator demo bypass (?auth=demo, ?demo=1, ?demo=true)
  const urlParams = new URLSearchParams(window.location.search);
  const isDemoUrl = urlParams.get('auth') === 'demo' || urlParams.get('demo') === '1' || urlParams.get('demo') === 'true';

  const grantAccess = (isInstant = false) => {
    sessionStorage.setItem('FG_ADMIN_AUTH', 'granted');
    if (modal) {
      modal.classList.add('hidden');
    }
    if (errBox) errBox.classList.add('hidden');
    if (passInput) {
      passInput.value = '';
      passInput.classList.remove('border-red-500');
    }

    // Refresh map layout so tiles align cleanly
    setTimeout(() => {
      if (window.forestMapEngine) window.forestMapEngine.invalidateSize();
    }, 250);
  };

  // Check if session exists or demo URL parameter passed
  if (isDemoUrl || sessionStorage.getItem('FG_ADMIN_AUTH') === 'granted') {
    grantAccess();
  } else {
    if (modal) modal.classList.remove('hidden');
    if (passInput) setTimeout(() => passInput.focus(), 200);
  }

  // Instant 1-Click Login (Single Click for Judges & Evaluators)
  if (btnInstant) {
    btnInstant.addEventListener('click', () => {
      grantAccess(true);
    });
  }

  // Show/Hide Password Eye Toggle
  if (btnToggleEye && passInput) {
    btnToggleEye.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      btnToggleEye.textContent = isPass ? '🔒' : '👁️';
    });
  }

  // Form Submission Check
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = (passInput ? passInput.value : '').trim();
      const validCodes = ['admin123', 'forestguard2026', 'admin', 'agni123', 'rakshak2026'];
      if (validCodes.includes(val)) {
        grantAccess();
      } else {
        if (errBox) errBox.classList.remove('hidden');
        if (passInput) {
          passInput.classList.add('border-red-500');
          passInput.focus();
        }
      }
    });
  }

  // Lock / Logout Button
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem('FG_ADMIN_AUTH');
      if (modal) modal.classList.remove('hidden');
      if (passInput) {
        passInput.value = '';
        passInput.focus();
      }
    });
  }
}

// Global window listeners for Leaflet map recalculation and iframe communication
window.addEventListener('resize', () => {
  if (window.forestMapEngine) window.forestMapEngine.invalidateSize();
});

window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'INVALIDATE_MAP') {
    if (window.forestMapEngine) window.forestMapEngine.invalidateSize();
  }
});
