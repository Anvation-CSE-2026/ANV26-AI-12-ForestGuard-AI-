/**
 * AgniRakshak Mission Control & Incident Response Command Center
 * Orchestrates Socket.io real-time alerts, map auto-zooming, glowing fire markers,
 * AI telemetry rendering, nearest station / water body routing, and squad dispatching.
 */

let adminMap = null;
let currentIncident = null;
let socket = null;

// Map layers and active graphics
let fireMarkerLayer = null;
let stationMarkerLayer = null;
let waterMarkerLayer = null;
let stationRouteLayer = null;
let waterRouteLayer = null;
let movingTruckMarker = null;
let evacuationCircleLayer = null;
let truckAnimationInterval = null;

let allIncidents = [];
let audioMuted = false;

document.addEventListener('DOMContentLoaded', () => {
  initAdminMap();
  initSocketConnection();
  initUIControls();
  fetchInitialData();
});

// 1. Initialize Tactical Leaflet Map
function initAdminMap() {
  const mapElement = document.getElementById('adminMap');
  if (!mapElement) return;

  // Default center at New Delhi
  adminMap = L.map('adminMap', {
    center: [28.6329, 77.2195],
    zoom: 13,
    zoomControl: false
  });

  L.control.zoom({ position: 'bottomright' }).addTo(adminMap);

  // Tile Providers: Google Satellite / Hybrid and Dark Carto
  const googleHybridTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Map Imagery &copy; Google Maps'
  });

  const darkTacticalTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; CartoDB & OSM'
  });

  const googleStreetsTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps'
  });

  // Default to Google Hybrid (Satellite + Roads/Labels)
  googleHybridTiles.addTo(adminMap);

  window.mapTileLayers = {
    hybrid: googleHybridTiles,
    dark: darkTacticalTiles,
    streets: googleStreetsTiles
  };
}

// 2. Socket.io Connection & Live Event Handlers
function initSocketConnection() {
  socket = io();

  socket.on('connect', () => {
    console.log('[SOCKET CONNECTED] Listening for live emergency alerts.');
    const netStatus = document.getElementById('networkStatusIndicator');
    if (netStatus) {
      netStatus.textContent = 'ONLINE / CONNECTED';
      netStatus.style.color = '#00e676';
    }
  });

  socket.on('disconnect', () => {
    console.warn('[SOCKET DISCONNECTED]');
    const netStatus = document.getElementById('networkStatusIndicator');
    if (netStatus) {
      netStatus.textContent = 'DISCONNECTED';
      netStatus.style.color = '#ff4d4d';
    }
  });

  // 🚨 INCOMING LIVE FIRE ALERT
  socket.on('fire_alert_live', (incident) => {
    console.log('🚨 [LIVE ALERT RECEIVED]', incident);
    handleIncomingLiveAlert(incident);
  });

  // DISPATCH CONFIRMATION
  socket.on('incident_dispatched', (updatedIncident) => {
    updateIncidentInList(updatedIncident);
    if (currentIncident && currentIncident.id === updatedIncident.id) {
      currentIncident = updatedIncident;
      renderIncidentDetails(updatedIncident, false);
    }
  });

  // STATUS CHANGED
  socket.on('incident_status_changed', (updatedIncident) => {
    updateIncidentInList(updatedIncident);
    if (currentIncident && currentIncident.id === updatedIncident.id) {
      currentIncident = updatedIncident;
      renderIncidentDetails(updatedIncident, false);
    }
  });
}

// 3. Process Live Emergency Alert
function handleIncomingLiveAlert(incident) {
  // Add to incidents list
  allIncidents.unshift(incident);
  renderIncidentFeed();
  updateTopMetrics();

  // 1. 🚨 Trigger Emergency Siren Audio
  if (!audioMuted && window.emergencyAudio) {
    window.emergencyAudio.playSirenAlert(4);
  }

  // 2. 🚨 Trigger Top Emergency Alert Banner
  showLiveAlertBanner(incident);

  // 3. Select this incident as active
  selectIncident(incident, true);
}

// 4. Select and Display Incident on Map & HUD
function selectIncident(incident, shouldAutoZoom = true) {
  currentIncident = incident;

  // Highlight selected card in sidebar
  document.querySelectorAll('.incident-card-item').forEach(card => {
    card.classList.toggle('selected', card.dataset.id === incident.id);
  });

  const { lat, lng } = incident.coordinates;

  // 4. GOOGLE MAP AUTO-ZOOMS directly to fire ground zero
  if (shouldAutoZoom && adminMap) {
    adminMap.flyTo([lat, lng], 16, {
      animate: true,
      duration: 1.8,
      easeLinearity: 0.25
    });
  }

  // Clear previous graphics
  clearMapGraphics();

  // 5. 🔴 RENDER GLOWING ANIMATED FIRE MARKER
  renderFireMarker(incident);

  // 6. RENDER NEAREST FIRE STATION & ANIMATED ROUTE
  renderFireStationAndRoute(incident);

  // 7. RENDER NEAREST WATER BODY & HOSE RELAY
  renderWaterBodyAndRelay(incident);

  // 8. RENDER AI CONFIDENCE + SEVERITY & DISPATCH CONSOLE
  renderIncidentDetails(incident, true);
}

// 5. Render 🔴 Fire Marker with Radar Shockwave Rings
function renderFireMarker(incident) {
  const { lat, lng } = incident.coordinates;
  const severity = incident.aiAnalysis?.severityLevel || 'CRITICAL';
  const radiusM = incident.aiAnalysis?.evacuationRadiusMeters || 400;

  // Pulsing Evacuation Zone Circle
  evacuationCircleLayer = L.circle([lat, lng], {
    radius: radiusM,
    color: '#ff2a2a',
    weight: 1.5,
    fillColor: '#ff4500',
    fillOpacity: 0.12,
    dashArray: '6, 6'
  }).addTo(adminMap);

  // Custom HTML Fire Marker with 3 pulsing shockwave rings
  const fireIconHtml = `
    <div class="fire-custom-marker">
      <div class="fire-pulse-ring"></div>
      <div class="fire-pulse-ring"></div>
      <div class="fire-pulse-ring"></div>
      <div class="fire-marker-flame">🔥</div>
    </div>
  `;

  const fireIcon = L.divIcon({
    className: 'leaflet-fire-container',
    html: fireIconHtml,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });

  fireMarkerLayer = L.marker([lat, lng], { icon: fireIcon }).addTo(adminMap);

  // Interactive Popup
  const popupHtml = `
    <div style="font-family: var(--font-main); min-width: 200px; padding: 4px;">
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
        <span style="color: #ff4d4d; font-weight: 800; font-size: 0.85rem;">🚨 ${severity} FIRE</span>
        <span style="font-size: 0.7rem; color: #38bdf8; font-family: monospace;">${incident.trackingCode}</span>
      </div>
      <p style="font-size: 0.82rem; margin-bottom: 6px; font-weight: 600;">${incident.locationName}</p>
      <div style="font-size: 0.75rem; color: #cbd5e1; margin-bottom: 4px;">
        <b>AI Confidence:</b> <span style="color: #ff9f43;">${incident.aiAnalysis?.confidenceScore}%</span>
      </div>
      <div style="font-size: 0.75rem; color: #cbd5e1;">
        <b>Danger Perimeter:</b> ${radiusM} Meters
      </div>
    </div>
  `;
  fireMarkerLayer.bindPopup(popupHtml).openPopup();
}

// 6. Render Nearest Fire Station & Animated Transit Route
function renderFireStationAndRoute(incident) {
  const station = incident.nearestFireStation;
  if (!station || !station.coordinates) return;

  const stationPos = [station.coordinates.lat, station.coordinates.lng];

  // Custom Fire Station Icon
  const stationIcon = L.divIcon({
    className: 'leaflet-station-container',
    html: `<div class="station-custom-marker">🚒</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });

  stationMarkerLayer = L.marker(stationPos, { icon: stationIcon }).addTo(adminMap);

  stationMarkerLayer.bindPopup(`
    <div style="min-width: 190px;">
      <b style="color: #38bdf8;">${station.name}</b><br/>
      <span style="font-size: 0.75rem; color: #cbd5e1;"><b>Distance:</b> ${station.distanceKm} km (${station.estimatedEtaMinutes} min ETA)</span><br/>
      <span style="font-size: 0.75rem; color: #cbd5e1;"><b>Phone:</b> ${station.emergencyPhone}</span>
    </div>
  `);

  // Draw Glowing Route Polyline
  const waypoints = station.routeWaypoints || [stationPos, [incident.coordinates.lat, incident.coordinates.lng]];

  stationRouteLayer = L.polyline(waypoints, {
    color: '#ff6a00',
    weight: 4,
    opacity: 0.9,
    dashArray: '8, 8',
    className: 'animated-fire-route'
  }).addTo(adminMap);

  // Moving Fire Engine Simulation along the route
  animateTruckAlongRoute(waypoints);
}

function animateTruckAlongRoute(waypoints) {
  if (truckAnimationInterval) clearInterval(truckAnimationInterval);
  if (movingTruckMarker) adminMap.removeLayer(movingTruckMarker);

  const truckIcon = L.divIcon({
    className: 'leaflet-truck-container',
    html: `<div class="moving-truck-marker">🚒💨</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  movingTruckMarker = L.marker(waypoints[0], { icon: truckIcon }).addTo(adminMap);

  let step = 0;
  truckAnimationInterval = setInterval(() => {
    step = (step + 1) % waypoints.length;
    if (movingTruckMarker && waypoints[step]) {
      movingTruckMarker.setLatLng(waypoints[step]);
    }
  }, 1200);
}

// 7. Render Nearest Water Body & Hydrant Relay
function renderWaterBodyAndRelay(incident) {
  const water = incident.nearestWaterBody;
  if (!water || !water.coordinates) return;

  const waterPos = [water.coordinates.lat, water.coordinates.lng];

  // Custom Water Hydrant Icon
  const waterIcon = L.divIcon({
    className: 'leaflet-water-container',
    html: `<div class="water-custom-marker">💧</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

  waterMarkerLayer = L.marker(waterPos, { icon: waterIcon }).addTo(adminMap);

  waterMarkerLayer.bindPopup(`
    <div style="min-width: 190px;">
      <b style="color: #06b6d4;">${water.name}</b><br/>
      <span style="font-size: 0.75rem; color: #cbd5e1;"><b>Distance:</b> ${water.distanceMeters} meters</span><br/>
      <span style="font-size: 0.75rem; color: #cbd5e1;"><b>Supply:</b> ${water.capacityFlowRate}</span><br/>
      <span style="font-size: 0.72rem; color: #a5f3fc;"><b>Status:</b> ${water.hoseRelayFeasibility}</span>
    </div>
  `);

  // Cyan Dashed Hose Relay Line
  const waypoints = water.routeWaypoints || [waterPos, [incident.coordinates.lat, incident.coordinates.lng]];

  waterRouteLayer = L.polyline(waypoints, {
    color: '#00e5ff',
    weight: 3,
    opacity: 0.85,
    dashArray: '5, 5'
  }).addTo(adminMap);
}

// 8. Render AI Vision Telemetry, Station Intel & Dispatch Console
function renderIncidentDetails(incident, updateFormState = true) {
  const ai = incident.aiAnalysis || {};
  const station = incident.nearestFireStation || {};
  const water = incident.nearestWaterBody || {};

  // Incident Title & Code
  document.getElementById('hudIncidentId').textContent = incident.trackingCode;
  document.getElementById('hudIncidentLoc').textContent = incident.locationName;
  document.getElementById('hudIncidentStatus').textContent = incident.status;

  // AI Confidence & Severity
  const confValue = document.getElementById('aiConfidenceValue');
  if (confValue) {
    confValue.textContent = `${ai.confidenceScore || 94.5}%`;
  }

  const sevBadge = document.getElementById('aiSeverityBadge');
  if (sevBadge) {
    sevBadge.textContent = ai.severityLevel || 'HIGH';
    sevBadge.className = `ai-metric-value ${(ai.severityLevel || 'HIGH').toLowerCase()}`;
    if (ai.severityLevel === 'CRITICAL') sevBadge.style.color = '#ff3333';
    else if (ai.severityLevel === 'HIGH') sevBadge.style.color = '#ff9f43';
    else sevBadge.style.color = '#facc15';
  }

  document.getElementById('aiFlameTemp').textContent = `${ai.estimatedFlameTempCelsius || 920}°C`;
  document.getElementById('aiSmokeDensity').textContent = ai.estimatedSmokeDensity || 'Heavy Toxic Plume';
  document.getElementById('aiFlameCoverage').textContent = `${ai.flameCoveragePercent || 15}%`;
  document.getElementById('aiHazardCategory').textContent = ai.hazardCategory || incident.category || 'Structural';

  // AI Fire Image with Bounding Boxes & Hotspots
  renderAIImageWithBBoxes(incident);

  // Nearest Fire Station Card
  document.getElementById('stationNameDisplay').textContent = station.name || 'Emergency Command Station';
  document.getElementById('stationDistanceDisplay').textContent = `${station.distanceKm || 2.5} km`;
  document.getElementById('stationEtaDisplay').textContent = `${station.estimatedEtaMinutes || 4} Mins`;
  document.getElementById('stationPhoneDisplay').textContent = station.emergencyPhone || '+91-101';

  // Nearest Water Body Card
  document.getElementById('waterNameDisplay').textContent = water.name || 'Municipal Hydrant';
  document.getElementById('waterDistanceDisplay').textContent = `${water.distanceMeters || 350} m`;
  document.getElementById('waterFlowDisplay').textContent = water.capacityFlowRate || '2,400 L/min';
  document.getElementById('waterRelayStatus').textContent = water.hoseRelayFeasibility || 'Direct Hose Relay Viable';

  // Dispatch Console Updates
  const btnDispatch = document.getElementById('btnDispatchNow');
  const dispatchStatusTag = document.getElementById('dispatchStatusTag');
  if (incident.status === 'DISPATCHED' || incident.status === 'ON_SCENE' || incident.status === 'CONTAINED') {
    if (btnDispatch) {
      btnDispatch.textContent = `✅ UNITS DISPATCHED (${incident.dispatchDetails?.unitsAssigned?.length || 2} TEAMS)`;
      btnDispatch.style.background = 'linear-gradient(135deg, #16a34a, #059669)';
    }
    if (dispatchStatusTag) dispatchStatusTag.textContent = `STATUS: ${incident.status}`;
  } else {
    if (btnDispatch) {
      btnDispatch.textContent = '🚀 CONFIRM & DISPATCH UNITS';
      btnDispatch.style.background = 'linear-gradient(135deg, #ff2a2a, #ff6a00)';
    }
    if (dispatchStatusTag) dispatchStatusTag.textContent = 'STATUS: REPORTED / PENDING DISPATCH';
  }
}

// Render Fire Photo with AI Bounding Boxes Overlay
function renderAIImageWithBBoxes(incident) {
  const container = document.getElementById('aiImageContainer');
  if (!container) return;

  const imageUrl = incident.imageUrl || '/sample_images/sample_structural_fire.jpg';
  const bboxes = incident.aiAnalysis?.boundingBoxes || [];
  const hotspots = incident.aiAnalysis?.hotspots || [];

  let boxesHtml = '';
  bboxes.forEach(box => {
    const isSmoke = box.type === 'smoke_plume';
    boxesHtml += `
      <div class="ai-bbox ${isSmoke ? 'smoke-type' : ''}" style="top: ${box.topPercent}%; left: ${box.leftPercent}%; width: ${box.widthPercent}%; height: ${box.heightPercent}%;">
        <div class="ai-bbox-label">${box.label} (${Math.round(box.confidence * 100)}%)</div>
      </div>
    `;
  });

  let hotspotsHtml = '';
  hotspots.forEach(pt => {
    hotspotsHtml += `
      <div class="ai-hotspot-pin" style="top: ${pt.yPercent}%; left: ${pt.xPercent}%;" title="Hotspot: ${pt.tempC}°C"></div>
    `;
  });

  container.innerHTML = `
    <img src="${imageUrl}" alt="Fire Telemetry" onerror="this.src='/sample_images/sample_structural_fire.jpg'" />
    <div id="bboxOverlayContainer">${boxesHtml}${hotspotsHtml}</div>
  `;
}

// 9. Dispatch Emergency Units
async function dispatchIncident(incidentId) {
  if (!incidentId) return;

  const selectedUnits = [];
  document.querySelectorAll('.unit-chip.selected').forEach(chip => {
    selectedUnits.push(chip.dataset.unit);
  });

  if (selectedUnits.length === 0) {
    selectedUnits.push('Rapid Attack Engine 101', 'Heavy Water Bowser 4');
  }

  try {
    const res = await fetch(`/api/incidents/${incidentId}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commandOfficer: 'Chief Duty Marshal',
        unitsAssigned: selectedUnits,
        dispatchNotes: 'Turn-out sirens activated. Priority code RED.'
      })
    });

    const data = await res.json();
    if (data.success) {
      if (window.emergencyAudio) window.emergencyAudio.playDispatchChime();
      currentIncident = data.incident;
      renderIncidentDetails(data.incident, false);
      updateIncidentInList(data.incident);
    }
  } catch (err) {
    alert('Dispatch error: ' + err.message);
  }
}

// 10. Update Incident Status
async function updateStatus(incidentId, status) {
  if (!incidentId) return;
  try {
    const res = await fetch(`/api/incidents/${incidentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (data.success) {
      currentIncident = data.incident;
      renderIncidentDetails(data.incident, false);
      updateIncidentInList(data.incident);
    }
  } catch (err) {
    alert('Status update error: ' + err.message);
  }
}

// 11. Helper UI & Map Cleaners
function clearMapGraphics() {
  if (fireMarkerLayer && adminMap) adminMap.removeLayer(fireMarkerLayer);
  if (stationMarkerLayer && adminMap) adminMap.removeLayer(stationMarkerLayer);
  if (waterMarkerLayer && adminMap) adminMap.removeLayer(waterMarkerLayer);
  if (stationRouteLayer && adminMap) adminMap.removeLayer(stationRouteLayer);
  if (waterRouteLayer && adminMap) adminMap.removeLayer(waterRouteLayer);
  if (evacuationCircleLayer && adminMap) adminMap.removeLayer(evacuationCircleLayer);
  if (movingTruckMarker && adminMap) adminMap.removeLayer(movingTruckMarker);
  if (truckAnimationInterval) clearInterval(truckAnimationInterval);
}

function showLiveAlertBanner(incident) {
  const banner = document.getElementById('liveEmergencyBanner');
  const text = document.getElementById('liveBannerText');
  if (banner && text) {
    text.textContent = `🚨 LIVE FIRE ALERT: ${incident.locationName} | SEVERITY: ${incident.aiAnalysis?.severityLevel} (${incident.aiAnalysis?.confidenceScore}%) | DISPATCH REQUIRED`;
    banner.classList.add('active');
  }
}

function dismissLiveAlertBanner() {
  const banner = document.getElementById('liveEmergencyBanner');
  if (banner) banner.classList.remove('active');
  if (window.emergencyAudio) window.emergencyAudio.stop();
}

// 12. Render Incident List in Sidebar
function renderIncidentFeed() {
  const listEl = document.getElementById('incidentFeedList');
  if (!listEl) return;

  listEl.innerHTML = '';

  allIncidents.forEach(inc => {
    const isSelected = currentIncident && currentIncident.id === inc.id;
    const severity = inc.aiAnalysis?.severityLevel || 'HIGH';
    const isCritical = severity === 'CRITICAL';

    const card = document.createElement('div');
    card.className = `incident-card-item ${isCritical ? 'critical-alert' : 'high-alert'} ${isSelected ? 'selected' : ''}`;
    card.dataset.id = inc.id;

    card.innerHTML = `
      <div class="incident-item-top">
        <span class="incident-item-id">${inc.trackingCode}</span>
        <span class="incident-severity-pill ${severity.toLowerCase()}">${severity}</span>
      </div>
      <div class="incident-item-loc">${inc.locationName}</div>
      <div class="incident-item-meta">
        <span>⏱️ ETA: ${inc.nearestFireStation?.estimatedEtaMinutes || 4}m</span>
        <span>🔥 AI: ${inc.aiAnalysis?.confidenceScore || 95}%</span>
        <span style="font-weight: 700; color: ${inc.status === 'DISPATCHED' ? '#00e676' : '#ff9f43'};">${inc.status}</span>
      </div>
    `;

    card.addEventListener('click', () => {
      selectIncident(inc, true);
    });

    listEl.appendChild(card);
  });
}

function updateIncidentInList(updatedIncident) {
  const idx = allIncidents.findIndex(i => i.id === updatedIncident.id);
  if (idx !== -1) {
    allIncidents[idx] = updatedIncident;
  } else {
    allIncidents.unshift(updatedIncident);
  }
  renderIncidentFeed();
  updateTopMetrics();
}

function updateTopMetrics() {
  const activeCount = allIncidents.filter(i => i.status !== 'RESOLVED').length;
  const criticalCount = allIncidents.filter(i => i.aiAnalysis?.severityLevel === 'CRITICAL' && i.status !== 'RESOLVED').length;
  const dispatchedCount = allIncidents.filter(i => i.status === 'DISPATCHED' || i.status === 'ON_SCENE').length;

  const countActiveEl = document.getElementById('telemetryActiveCount');
  const countCritEl = document.getElementById('telemetryCriticalCount');
  const countDispEl = document.getElementById('telemetryDispatchedCount');

  if (countActiveEl) countActiveEl.textContent = activeCount;
  if (countCritEl) countCritEl.textContent = criticalCount;
  if (countDispEl) countDispEl.textContent = dispatchedCount;
}

// 13. UI Controls Setup
function initUIControls() {
  // Sound Mute Toggle
  const btnMute = document.getElementById('btnMuteAudio');
  if (btnMute) {
    btnMute.addEventListener('click', () => {
      audioMuted = !audioMuted;
      if (window.emergencyAudio) window.emergencyAudio.toggleMute();
      btnMute.textContent = audioMuted ? '🔇 Audio Muted' : '🔊 Audio Active';
      btnMute.classList.toggle('btn-ctrl-active', audioMuted);
    });
  }

  // Dismiss Banner
  const btnDismiss = document.getElementById('btnDismissBanner');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', dismissLiveAlertBanner);
  }

  // Trigger Simulation Alert
  const btnSimAlert = document.getElementById('btnSimulateAlert');
  if (btnSimAlert) {
    btnSimAlert.addEventListener('click', () => {
      if (socket) {
        socket.emit('trigger_test_alert', {
          locationName: 'Mayapuri Phase II Heavy Machinery Hub, New Delhi',
          coordinates: { lat: 28.6295, lng: 77.1210 }
        });
      }
    });
  }

  // Unit Chips in Dispatch Console
  document.querySelectorAll('.unit-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
    });
  });

  // Confirm Dispatch Button
  const btnDispatch = document.getElementById('btnDispatchNow');
  if (btnDispatch) {
    btnDispatch.addEventListener('click', () => {
      if (currentIncident) {
        dispatchIncident(currentIncident.id);
      }
    });
  }

  // Status Step Buttons
  document.querySelectorAll('.btn-status-step').forEach(btn => {
    btn.addEventListener('click', () => {
      const status = btn.dataset.status;
      if (currentIncident && status) {
        updateStatus(currentIncident.id, status);
      }
    });
  });

  // Tile layer switchers
  document.querySelectorAll('.btn-map-tile').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-map-tile').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tileType = btn.dataset.tile;
      if (window.mapTileLayers && adminMap) {
        Object.values(window.mapTileLayers).forEach(layer => adminMap.removeLayer(layer));
        if (window.mapTileLayers[tileType]) {
          window.mapTileLayers[tileType].addTo(adminMap);
        }
      }
    });
  });

  // Toggle Bounding Boxes Overlay
  const btnToggleBoxes = document.getElementById('btnToggleBBoxes');
  if (btnToggleBoxes) {
    btnToggleBoxes.addEventListener('click', () => {
      const overlay = document.getElementById('bboxOverlayContainer');
      if (overlay) {
        const isHidden = overlay.style.display === 'none';
        overlay.style.display = isHidden ? 'block' : 'none';
        btnToggleBoxes.textContent = isHidden ? '🔲 Hide AI Boxes' : '🔲 Show AI Boxes';
      }
    });
  }
}

// 14. Fetch Initial Incidents from Backend
async function fetchInitialData() {
  try {
    const res = await fetch('/api/incidents');
    const data = await res.json();
    if (data.success && data.incidents && data.incidents.length > 0) {
      allIncidents = data.incidents;
      renderIncidentFeed();
      updateTopMetrics();
      // Select the first incident
      selectIncident(allIncidents[0], false);
    }
  } catch (err) {
    console.warn('Initial data fetch error:', err);
  }
}
