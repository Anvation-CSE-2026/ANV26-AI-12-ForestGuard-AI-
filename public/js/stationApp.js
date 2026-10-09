/**
 * ForestGuard AI Fire Station & Response Team Terminal
 * Receives dispatches in real-time, accepts missions, starts travel simulation along route,
 * updates vehicle coordinates, and executes containment.
 */

let stationMap = null;
let fireMarker = null;
let stationMarker = null;
let vehicleMarker = null;
let routePolyline = null;
let currentIncident = null;
let travelInterval = null;
let currentWaypointIndex = 0;
let socket = null;

const ACTIVE_TEAM_ID = 'TEAM-04';
const STATION_COORDS = [11.8055, 76.6888]; // Gundlupet Fire Station (Karnataka State Fire Services) on NH-766 - Bandipur Sector Command

document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  initSocket();
  initButtons();
  fetchActiveIncident();
});

function initMap() {
  const el = document.getElementById('stationNavMap');
  if (!el) return;

  stationMap = L.map('stationNavMap', {
    center: STATION_COORDS,
    zoom: 12,
    zoomControl: true
  });

  L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Map & Imagery &copy; Google Maps'
  }).addTo(stationMap);

  // Add Station Marker
  const stnIcon = L.divIcon({
    className: 'custom-station-pin',
    html: `<div style="background:#9333ea; border:2px solid #fff; border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 0 14px #9333ea;">🚒</div>`,
    iconSize: [36, 36]
  });

  stationMarker = L.marker(STATION_COORDS, { icon: stnIcon }).addTo(stationMap);
  stationMarker.bindPopup('<b>Gundlupet Fire Station (Karnataka State Fire Services)</b><br><span style="color:#60a5fa;">Bandipur Team Ready (🛡️)</span><br>Base Station: STA-KA-02 • NH-766');
}

function initSocket() {
  if (typeof io === 'undefined') return;
  socket = io();

  socket.on('team_dispatched', (data) => {
    console.log('[STATION SOCKET] Team Dispatched:', data);
    handleIncomingDispatch(data.incident);
  });

  socket.on('new_fire_alert', (incident) => {
    // If no active incident, load the new alert
    if (!currentIncident) {
      handleIncomingDispatch(incident);
    }
  });
}

function handleIncomingDispatch(incident) {
  currentIncident = incident;

  if (window.emergencyAudio) {
    window.emergencyAudio.playDispatchChime();
  }

  // Populate UI
  document.getElementById('stnIncidentId').textContent = incident.incidentId;
  document.getElementById('stnLocation').textContent = incident.forestName;
  document.getElementById('stnCoords').textContent = `${incident.latitude}, ${incident.longitude}`;
  document.getElementById('stnDistance').textContent = `${incident.assignedStation?.distanceKm || 8.4} km`;
  document.getElementById('stnEta').textContent = `${incident.assignedStation?.etaMinutes || 16} Minutes`;
  document.getElementById('stnSeverityBadge').textContent = incident.severity;

  // Draw fire marker & route on map
  drawFireAndRoute(incident);

  // Enable Accept button
  const btnAccept = document.getElementById('btnAcceptMission');
  btnAccept.disabled = false;
  btnAccept.classList.remove('opacity-50', 'cursor-not-allowed');

  document.getElementById('stnTransitStatus').textContent = 'STATUS: NEW DISPATCH RECEIVED - ACCEPT REQUIRED';
  document.getElementById('stnTransitStatus').className = 'text-sm font-black text-red-400 animate-pulse';
}

function drawFireAndRoute(incident) {
  const firePos = [incident.latitude, incident.longitude];

  if (fireMarker) stationMap.removeLayer(fireMarker);
  if (routePolyline) stationMap.removeLayer(routePolyline);

  // Station Coordinates
  const stCoords = incident.assignedStation?.coordinates
    ? [incident.assignedStation.coordinates.lat, incident.assignedStation.coordinates.lng]
    : (incident.nearestStation?.coordinates ? [incident.nearestStation.coordinates.lat, incident.nearestStation.coordinates.lng] : STATION_COORDS);

  if (stationMarker) {
    stationMarker.setLatLng(stCoords);
  }

  // Fire Marker
  const fireIcon = L.divIcon({
    className: 'custom-fire-marker',
    html: `<div style="font-size:32px; filter:drop-shadow(0 0 12px #ef4444); animation:bounce 1s infinite alternate;">🔥</div>`,
    iconSize: [36, 36]
  });
  fireMarker = L.marker(firePos, { icon: fireIcon }).addTo(stationMap);

  // Route Polyline strictly from Station Building to Fire Ground Zero
  const waypoints = [stCoords, firePos];

  routePolyline = L.polyline(waypoints, {
    color: '#f97316',
    weight: 5,
    opacity: 0.95,
    dashArray: '8, 8'
  }).addTo(stationMap);

  stationMap.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });
}

function initButtons() {
  const btnAccept = document.getElementById('btnAcceptMission');
  const btnTravel = document.getElementById('btnStartTravel');
  const btnArrive = document.getElementById('btnArriveSite');
  const btnContain = document.getElementById('btnContainFire');
  const btnResolve = document.getElementById('btnResolveIncident');

  // 1. Accept Mission
  btnAccept.addEventListener('click', async () => {
    if (!currentIncident) return;
    btnAccept.disabled = true;
    btnAccept.innerHTML = '<span>✓</span> <span>MISSION ACCEPTED</span>';
    btnAccept.className = 'w-full py-3 rounded-xl bg-purple-950 border border-purple-600 text-purple-300 font-bold text-xs uppercase';

    btnTravel.disabled = false;
    btnTravel.classList.remove('opacity-50', 'cursor-not-allowed');

    document.getElementById('stnTransitStatus').textContent = 'STATUS: MISSION ACCEPTED • PREPARING VEHICLE TURNOUT';
    document.getElementById('stnTransitStatus').className = 'text-sm font-black text-purple-400';

    await fetch(`/api/incidents/${currentIncident.incidentId}/accept-mission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: ACTIVE_TEAM_ID })
    });
  });

  // 2. Start Travel (Simulate Vehicle Transit)
  btnTravel.addEventListener('click', async () => {
    if (!currentIncident) return;
    btnTravel.disabled = true;
    btnTravel.innerHTML = '<span>💨</span> <span>EN ROUTE (GPS TRACKING ACTIVE)</span>';

    document.getElementById('stnTransitStatus').textContent = 'STATUS: TEAM 04 EN ROUTE TO FOREST GROUND ZERO';
    document.getElementById('stnTransitStatus').className = 'text-sm font-black text-orange-400 animate-pulse';

    await fetch(`/api/incidents/${currentIncident.incidentId}/start-travel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: ACTIVE_TEAM_ID })
    });

    startVehicleAnimation(btnArrive);
  });

  // 3. Arrive at Site
  btnArrive.addEventListener('click', async () => {
    if (!currentIncident) return;
    btnArrive.disabled = true;
    btnArrive.innerHTML = '<span>✓</span> <span>ON SITE (CONTAINMENT INITIATED)</span>';

    btnContain.disabled = false;
    btnContain.classList.remove('opacity-50', 'cursor-not-allowed');

    document.getElementById('stnTransitStatus').textContent = 'STATUS: TEAM ON SITE • ACTIVE CANOPY WATER APPLICATION';
    document.getElementById('stnTransitStatus').className = 'text-sm font-black text-sky-400';

    await fetch(`/api/incidents/${currentIncident.incidentId}/arrive-site`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: ACTIVE_TEAM_ID })
    });
  });

  // 4. Fire Contained
  btnContain.addEventListener('click', async () => {
    if (!currentIncident) return;
    btnContain.disabled = true;
    btnContain.innerHTML = '<span>✓</span> <span>FIRE CONTAINED</span>';

    btnResolve.disabled = false;
    btnResolve.classList.remove('opacity-50', 'cursor-not-allowed');

    document.getElementById('stnTransitStatus').textContent = 'STATUS: FIRE CONTAINED • MOPPING UP PERIMETER HOTSPOTS';
    document.getElementById('stnTransitStatus').className = 'text-sm font-black text-emerald-400';

    await fetch(`/api/incidents/${currentIncident.incidentId}/contain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: ACTIVE_TEAM_ID })
    });
  });

  // 5. Resolve Incident
  btnResolve.addEventListener('click', async () => {
    if (!currentIncident) return;
    btnResolve.disabled = true;
    btnResolve.innerHTML = '<span>✓</span> <span>INCIDENT RESOLVED & CLOSED</span>';

    document.getElementById('stnTransitStatus').textContent = 'STATUS: INCIDENT CLOSED • TEAM RETURNING TO BASE';
    document.getElementById('stnTransitStatus').className = 'text-sm font-black text-slate-300';

    await fetch(`/api/incidents/${currentIncident.incidentId}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    alert('Incident successfully resolved and closed.');
  });
}

function startVehicleAnimation(btnArrive) {
  const waypoints = currentIncident.routeWaypoints || [
    STATION_COORDS,
    [11.6660, 76.6300],
    [11.6650, 76.6270],
    [currentIncident.latitude, currentIncident.longitude]
  ];

  if (!vehicleMarker) {
    const truckIcon = L.divIcon({
      className: 'custom-vehicle-truck',
      html: `<div style="font-size:26px; filter:drop-shadow(0 0 10px #f97316); transform:translate(-10px, -10px);">🚒💨</div>`,
      iconSize: [32, 32]
    });
    vehicleMarker = L.marker(waypoints[0], { icon: truckIcon }).addTo(stationMap);
  }

  currentWaypointIndex = 0;
  const totalWaypoints = waypoints.length;
  const totalDist = currentIncident.assignedStation?.distanceKm || 8.4;
  const totalEta = currentIncident.assignedStation?.etaMinutes || 16;

  if (travelInterval) clearInterval(travelInterval);

  travelInterval = setInterval(async () => {
    currentWaypointIndex++;
    if (currentWaypointIndex < totalWaypoints) {
      const pos = waypoints[currentWaypointIndex];
      vehicleMarker.setLatLng(pos);

      const ratio = 1 - (currentWaypointIndex / totalWaypoints);
      const remDist = Math.max(0.1, (totalDist * ratio)).toFixed(1);
      const remEta = Math.max(1, Math.round(totalEta * ratio));

      document.getElementById('stnLiveDist').textContent = `${remDist} km`;
      document.getElementById('stnLiveEta').textContent = `${remEta} Min`;

      // Broadcast progress to server via API
      fetch(`/api/incidents/${currentIncident.incidentId}/team-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: ACTIVE_TEAM_ID,
          waypointIndex: currentWaypointIndex,
          remainingDistanceKm: parseFloat(remDist),
          remainingEtaMin: remEta
        })
      });
    } else {
      clearInterval(travelInterval);
      document.getElementById('stnLiveDist').textContent = `0.0 km`;
      document.getElementById('stnLiveEta').textContent = `0 Min`;

      btnArrive.disabled = false;
      btnArrive.classList.remove('opacity-50', 'cursor-not-allowed');
      document.getElementById('stnTransitStatus').textContent = 'STATUS: ARRIVED AT SITE • READY FOR CONTAINMENT';
    }
  }, 2200);
}

async function fetchActiveIncident() {
  try {
    const res = await fetch('/api/incidents');
    const data = await res.json();
    if (data.success && data.incidents && data.incidents.length > 0) {
      handleIncomingDispatch(data.incidents[0]);
    }
  } catch (e) {}
}
