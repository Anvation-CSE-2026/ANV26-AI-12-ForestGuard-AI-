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
  await initMap();
  await fetchDatasets();
  initSocket();
  initUIEvents();
  fetchIncidents();
});

// 1. Initialize Map
async function initMap() {
  await window.forestMapEngine.init('adminLiveMap', { lat: 11.6643, lng: 76.6250 }, 9);
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
}

// 4. Handle Incoming Live Fire Alert
function handleNewFireAlert(incident) {
  // Update last event time
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const txtLastEvent = document.getElementById('txtLastEventTime');
  if (txtLastEvent) txtLastEvent.textContent = timeStr;

  // 1. Play Emergency Siren Sound
  if (window.emergencyAudio && !audioMuted) {
    window.emergencyAudio.playSirenAlert(3.5);
  }

  // 2. Add to top of Incidents List
  allIncidents = [incident, ...allIncidents.filter(i => i.incidentId !== incident.incidentId)];
  renderIncidentList();

  // 3. Trigger Red Flashing Banner (Section 3)
  showEmergencyBanner(incident);

  // 4. Select Incident & Center Map (Section 1)
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
  document.getElementById('detailForestName').textContent = incident.forestName;
  document.getElementById('detailCoords').textContent = `${incident.latitude}, ${incident.longitude}`;
  document.getElementById('detailDetectionSource').textContent = incident.source;
  document.getElementById('detailAffectedArea').textContent = `${incident.affectedAreaHectares || 2.4} hectares`;

  // Severity Badge
  const sevEl = document.getElementById('detailSeverityBadge');
  sevEl.textContent = incident.severity;
  if (incident.severity === 'CRITICAL') sevEl.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-red-950 border border-red-600 text-red-300 uppercase';
  else if (incident.severity === 'HIGH') sevEl.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-orange-950 border border-orange-600 text-orange-300 uppercase';
  else sevEl.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-amber-950 border border-amber-600 text-amber-300 uppercase';

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

    const card = document.createElement('div');
    card.className = `incident-feed-card p-3 rounded-xl border cursor-pointer transition-all ${
      isSelected ? 'border-orange-500 bg-[#13223f] shadow-lg' : 'border-slate-800 bg-[#091122] hover:border-slate-700'
    } ${isCritical && !isDispatched ? 'border-l-4 border-l-red-500' : ''}`;
    card.dataset.id = inc.incidentId;

    let sevBadge = `<span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-600">CRITICAL</span>`;
    if (inc.severity === 'HIGH') sevBadge = `<span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-orange-950 text-orange-300 border border-orange-600">HIGH</span>`;
    else if (inc.severity === 'LOW') sevBadge = `<span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-600">SAFE</span>`;

    card.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <span class="font-mono text-xs font-black text-sky-400">${inc.incidentId}</span>
        ${sevBadge}
      </div>
      <div class="text-xs font-bold text-white truncate">${inc.forestName}</div>
      <div class="flex items-center justify-between text-[11px] text-slate-400 mt-2 font-mono">
        <span>AI: ${inc.aiConfidence}%</span>
        <span>Risk: ${inc.riskScore}/100</span>
        <span class="font-bold ${isDispatched ? 'text-emerald-400' : 'text-orange-400'}">${inc.status}</span>
      </div>
    `;

    card.addEventListener('click', () => selectIncident(inc, true));
    feed.appendChild(card);
  });
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
    if (locEl) locEl.textContent = `${incident.forestName} (${incident.latitude}, ${incident.longitude})`;
    if (riskEl) riskEl.textContent = `${incident.riskScore}/100 (${incident.severity})`;
    if (confEl) confEl.textContent = `${incident.aiConfidence}%`;
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

  if (btnCancelDisp) btnCancelDisp.addEventListener('click', () => dispModal.classList.add('hidden'));

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
    if (data.success && data.incidents && data.incidents.length > 0) {
      allIncidents = data.incidents;
      renderIncidentList();
      selectIncident(allIncidents[0], true);
    }
  } catch (err) {
    console.warn('Initial incidents fetch error:', err);
  }
}
