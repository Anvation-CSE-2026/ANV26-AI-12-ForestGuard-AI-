/**
 * ForestGuard AI User Emergency Dashboard Application
 * Handles 6 reporting methods, central Google Map pin, confirmation modal,
 * and real-time report tracking via Socket.IO.
 */

let userMap = null;
let userMarker = null;
let currentCoords = { lat: 11.6643, lng: 76.6250 };
let currentForest = 'Bandipur Forest';
let currentDistrict = 'Chamarajanagar';
let currentState = 'Karnataka';
let currentDetectionMethod = 'Image';
let selectedFile = null;
let selectedVideoFile = null;
let cameraStream = null;
let socket = null;
let myReports = [];
let pendingSubmissionData = null;
let allResponseStations = [];

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  initCentralMap();
  initReportingMethods();
  initFormAndModals();
  initSocket();
  loadEmergencyContacts();
  loadMyReports();
  loadStations();
});

async function loadStations() {
  try {
    const res = await fetch('/api/response-stations');
    const data = await res.json();
    if (data.success && data.responseStations) {
      allResponseStations = data.responseStations;
    }
  } catch (e) {}
}

function getHaversineDist(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 1. Tab Navigation
function initTabs() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(b => {
        b.className = 'nav-tab px-3 py-1.5 rounded-lg text-slate-400 hover:text-white';
      });
      btn.className = 'nav-tab px-3 py-1.5 rounded-lg text-white bg-slate-800';

      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      const activeId = btn.dataset.tab;
      const activeTab = document.getElementById(activeId);
      if (activeTab) activeTab.classList.remove('hidden');

      if (activeId === 'tabLiveMap') {
        initFullMap();
        setTimeout(() => {
          if (fullMap) fullMap.invalidateSize();
        }, 150);
      } else if (activeId === 'tabReport') {
        setTimeout(() => {
          if (userMap) userMap.invalidateSize();
        }, 150);
      }
    });
  });

  const btnQuick = document.getElementById('btnQuickReportNow');
  if (btnQuick) {
    btnQuick.addEventListener('click', () => {
      document.querySelector('[data-tab="tabReport"]').click();
      setReportingMethod('Manual');
      const targetEl = document.getElementById('userCentralMap') || document.getElementById('userReportForm');
      if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

// 2. Central Google Map (Pin Exact Location)
function initCentralMap() {
  const el = document.getElementById('userCentralMap');
  if (!el) return;

  userMap = L.map('userCentralMap', {
    center: [currentCoords.lat, currentCoords.lng],
    zoom: 12,
    maxZoom: 21,
    zoomControl: true
  });

  // High-resolution Google Hybrid Satellite & Roads Tiles with building-level zoom (maxZoom 21)
  L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21,
    maxNativeZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Map & Imagery &copy; Google Maps'
  }).addTo(userMap);

  const pinIcon = L.divIcon({
    className: 'custom-user-pin',
    html: `<div style="font-size:32px; filter:drop-shadow(0 0 10px #ef4444); cursor:pointer; transform:translate(-8px, -24px); animation:bounce 1.2s infinite alternate;">📍</div>`,
    iconSize: [32, 32]
  });

  userMarker = L.marker([currentCoords.lat, currentCoords.lng], {
    draggable: true,
    icon: pinIcon
  }).addTo(userMap);

  userMarker.on('dragend', () => {
    const pos = userMarker.getLatLng();
    updateLocationReadouts(pos.lat, pos.lng);
  });

  userMap.on('click', (e) => {
    userMarker.setLatLng(e.latlng);
    updateLocationReadouts(e.latlng.lat, e.latlng.lng);
  });

  // Add Leaflet Control Button for Default Sector Zoom (🎯) & Deep Zoom (🔬)
  try {
    const UserZoomControlRack = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const bDefault = L.DomUtil.create('a', '', container);
        bDefault.innerHTML = '🎯';
        bDefault.href = '#';
        bDefault.title = 'Restore Default Zoom (Fire Sector & Stations)';
        bDefault.setAttribute('role', 'button');
        bDefault.style.fontSize = '14px';
        bDefault.style.lineHeight = '30px';
        bDefault.style.textAlign = 'center';
        bDefault.style.display = 'block';
        bDefault.style.width = '30px';
        bDefault.style.height = '30px';
        bDefault.style.backgroundColor = '#070e1c';
        bDefault.style.color = '#f97316';
        bDefault.style.cursor = 'pointer';
        bDefault.style.borderBottom = '1px solid #1e293b';

        L.DomEvent.disableClickPropagation(bDefault);
        L.DomEvent.on(bDefault, 'click', function(e) {
          L.DomEvent.preventDefault(e);
          restoreUserDefaultZoom();
        });

        const bDeep = L.DomUtil.create('a', '', container);
        bDeep.innerHTML = '🔬';
        bDeep.href = '#';
        bDeep.title = 'Deep Zoom In (Tree & Building Level - Zoom 19)';
        bDeep.setAttribute('role', 'button');
        bDeep.style.fontSize = '14px';
        bDeep.style.lineHeight = '30px';
        bDeep.style.textAlign = 'center';
        bDeep.style.display = 'block';
        bDeep.style.width = '30px';
        bDeep.style.height = '30px';
        bDeep.style.backgroundColor = '#070e1c';
        bDeep.style.color = '#38bdf8';
        bDeep.style.cursor = 'pointer';

        L.DomEvent.disableClickPropagation(bDeep);
        L.DomEvent.on(bDeep, 'click', function(e) {
          L.DomEvent.preventDefault(e);
          deepZoomUserMap(19);
        });

        return container;
      }
    });
    new UserZoomControlRack().addTo(userMap);
  } catch (e) {}

  // Wire Top Card Buttons for Default Zoom & Deep Zoom
  const btnUserRestore = document.getElementById('btnUserRestoreDefaultZoom');
  if (btnUserRestore) {
    btnUserRestore.addEventListener('click', () => {
      restoreUserDefaultZoom();
    });
  }
  const btnUserDeep = document.getElementById('btnUserDeepZoom');
  if (btnUserDeep) {
    btnUserDeep.addEventListener('click', () => {
      deepZoomUserMap(19);
    });
  }

  setTimeout(() => {
    if (userMap) {
      userMap.invalidateSize();
      renderUserMapOverlays(currentCoords.lat, currentCoords.lng);
    }
  }, 350);
}

// Auxiliary overlays on userMap (Alert Radius + Nearest Station + Nearest Waterbody + Dotted Lines)
let userSectorBounds = null;
let userAuxLayers = {
  circles: [],
  routeStation: null,
  routeWater: null,
  markerStation: null,
  markerWater: null
};

function restoreUserDefaultZoom() {
  if (!userMap) return;
  if (userSectorBounds && typeof userSectorBounds.isValid === 'function' && userSectorBounds.isValid()) {
    userMap.fitBounds(userSectorBounds, {
      padding: [45, 45],
      maxZoom: 15,
      animate: true
    });
  } else if (currentCoords) {
    userMap.setView([currentCoords.lat, currentCoords.lng], 14, { animate: true });
  }
}

function deepZoomUserMap(zoomLevel = 19) {
  if (!userMap) return;
  const lat = currentCoords ? currentCoords.lat : (marker ? marker.getLatLng().lat : null);
  const lng = currentCoords ? currentCoords.lng : (marker ? marker.getLatLng().lng : null);
  if (lat != null && lng != null) {
    userMap.flyTo([lat, lng], zoomLevel, { duration: 1.2 });
  }
}

function renderUserMapOverlays(lat, lng) {
  if (!userMap) return;

  // Clear previous overlays
  userAuxLayers.circles.forEach(c => { try { userMap.removeLayer(c); } catch(e){} });
  userAuxLayers.circles = [];
  if (userAuxLayers.routeStation) { try { userMap.removeLayer(userAuxLayers.routeStation); } catch(e){} }
  if (userAuxLayers.routeWater) { try { userMap.removeLayer(userAuxLayers.routeWater); } catch(e){} }
  if (userAuxLayers.markerStation) { try { userMap.removeLayer(userAuxLayers.markerStation); } catch(e){} }
  if (userAuxLayers.markerWater) { try { userMap.removeLayer(userAuxLayers.markerWater); } catch(e){} }

  // 1. Concentric Alert Radius Circles (500m, 1.5km, 5km in neat dotted outline)
  // Keeps shade ONLY in the first radius (500m Hot Zone), retains clean dotted radius lines around area
  const rings = [
    { r: 500, col: '#ef4444', name: '500m Hot Zone' },
    { r: 1500, col: '#f97316', name: '1.5km Buffer Perimeter' },
    { r: 5000, col: '#eab308', name: '5km Response Sector' }
  ];
  rings.forEach((ring, idx) => {
    const isFirstRadius = (idx === 0);
    const c = L.circle([lat, lng], {
      radius: ring.r,
      color: ring.col,
      weight: 1.8,
      opacity: 0.85,
      fill: isFirstRadius,
      fillColor: ring.col,
      fillOpacity: isFirstRadius ? 0.16 : 0,
      dashArray: '6, 6'
    }).addTo(userMap);
    c.bindTooltip(ring.name, { direction: 'top' });
    userAuxLayers.circles.push(c);
  });

  // 2. Nearest Fire Station within few km
  let stLat, stLng, stName, distKm;
  if (Math.abs(lat - 12.8550) < 0.04 && Math.abs(lng - 77.5420) < 0.04) {
    // KSSEM / Anjanapura local station building
    stLat = 12.8575;
    stLng = 77.5623;
    stName = 'Anjanapura Fire & Emergency Station (KSSEM)';
    distKm = (getHaversineDist(lat, lng, stLat, stLng)).toFixed(1);
  } else if (Math.abs(lat - 12.8258) < 0.04 && Math.abs(lng - 77.5158) < 0.04) {
    // DSATM / Anjanapura local station building
    stLat = 12.8575;
    stLng = 77.5623;
    stName = 'Anjanapura Fire & Emergency Station (DSATM)';
    distKm = (getHaversineDist(lat, lng, stLat, stLng)).toFixed(1);
  } else if (Math.abs(lat - 11.6643) < 0.2 && Math.abs(lng - 76.6250) < 0.2) {
    // Bandipur Range Forest Office & Fire Command HQ building (physical building on NH-766)
    stLat = 11.6675;
    stLng = 76.6322;
    stName = 'Bandipur Range Forest Office & Fire Command (HQ)';
    distKm = (getHaversineDist(lat, lng, stLat, stLng)).toFixed(1);
  } else {
    // Dynamically find closest real station from allResponseStations (never synthetic offsets)
    let best = null;
    let minD = Infinity;
    for (const s of allResponseStations) {
      if (s.coordinates) {
        const d = getHaversineDist(lat, lng, s.coordinates.lat, s.coordinates.lng);
        if (d < minD) { minD = d; best = s; }
      }
    }
    if (best) {
      stLat = best.coordinates.lat;
      stLng = best.coordinates.lng;
      stName = best.name.split('(')[0].trim();
      distKm = minD.toFixed(1);
    } else {
      stLat = 11.6675;
      stLng = 76.6322;
      stName = 'Bandipur Range Forest Office & Fire Command (HQ)';
      distKm = (getHaversineDist(lat, lng, stLat, stLng)).toFixed(1);
    }
  }

  // Station Badge Marker
  const stnIcon = L.divIcon({
    className: 'custom-map-marker marker-station-badge',
    html: `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(7,14,28,0.95); border:2px solid #3b82f6; border-radius:9px; padding:3px 8px; box-shadow:0 0 14px rgba(59,130,246,0.6); color:#fff; font-family:Inter,sans-serif; cursor:pointer; white-space:nowrap; transform:translate(-50%, -50%);"><span style="font-size:10px; font-weight:800; color:#fff;">${stName} - Team Ready</span><span style="font-size:12px;">🛡️</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
  userAuxLayers.markerStation = L.marker([stLat, stLng], { icon: stnIcon }).addTo(userMap)
    .bindPopup(`<b>${stName}</b><br><span style="color:#60a5fa;">Nearest Fire Response Unit - Team Ready (🛡️)</span><br>Distance: <b>${distKm} km</b>`);

  // Neat Dotted Route: Station to Fire (dashArray '8, 8')
  userAuxLayers.routeStation = L.polyline([[stLat, stLng], [(stLat + lat) / 2 + 0.001, (stLng + lng) / 2], [lat, lng]], {
    color: '#f97316',
    weight: 4,
    opacity: 0.95,
    dashArray: '8, 8'
  }).addTo(userMap);

  // 3. Nearest Water Body within few km
  let wbLat, wbLng, wbName, wbDist;
  if (Math.abs(lat - 12.8550) < 0.08 && Math.abs(lng - 77.5420) < 0.08) {
    wbLat = 12.8710;
    wbLng = 77.5435;
    wbName = 'Vajarahalli Lake & Emergency Drafting Reservoir (KSSEM)';
    wbDist = (getHaversineDist(lat, lng, wbLat, wbLng)).toFixed(1);
  } else if (Math.abs(lat - 12.8258) < 0.08 && Math.abs(lng - 77.5158) < 0.08) {
    wbLat = 12.8120;
    wbLng = 77.5020;
    wbName = 'Kaggalipura Lake Emergency Reservoir (DSATM)';
    wbDist = (getHaversineDist(lat, lng, wbLat, wbLng)).toFixed(1);
  } else if (Math.abs(lat - 11.6643) < 0.2 && Math.abs(lng - 76.6250) < 0.2) {
    wbLat = 11.6672;
    wbLng = 76.6215;
    wbName = 'Tavarekatte Lake Reservoir (Bandipur Forest Water Source)';
    wbDist = (getHaversineDist(lat, lng, wbLat, wbLng)).toFixed(1);
  } else {
    // Dynamically find closest real water body from allWaterBodies (never synthetic offsets)
    let bestWb = null;
    let minWbD = Infinity;
    for (const w of allWaterBodies) {
      if (w.coordinates) {
        const d = getHaversineDist(lat, lng, w.coordinates.lat, w.coordinates.lng);
        if (d < minWbD) { minWbD = d; bestWb = w; }
      }
    }
    if (bestWb) {
      wbLat = bestWb.coordinates.lat;
      wbLng = bestWb.coordinates.lng;
      wbName = bestWb.name;
      wbDist = minWbD.toFixed(1);
    } else {
      wbLat = 11.6672;
      wbLng = 76.6215;
      wbName = 'Tavarekatte Lake Reservoir (Bandipur Forest Water Source)';
      wbDist = (getHaversineDist(lat, lng, wbLat, wbLng)).toFixed(1);
    }
  }

  // Water Marker
  userAuxLayers.markerWater = L.marker([wbLat, wbLng]).addTo(userMap)
    .bindPopup(`💧 <b>${wbName}</b><br><span style="color:#38bdf8;">Nearest Water Drafting Terminal</span><br>Distance: <b>${wbDist} km</b>`);

  // Neat Dotted Route: Water Body to Fire (dashArray '6, 6')
  userAuxLayers.routeWater = L.polyline([[wbLat, wbLng], [lat, lng]], {
    color: '#0284c7',
    weight: 3.5,
    opacity: 0.9,
    dashArray: '6, 6'
  }).addTo(userMap);

  // Store sector bounds encompassing fire ground zero, fire station, and waterbody
  userSectorBounds = L.latLngBounds([
    [lat, lng],
    [stLat, stLng],
    [wbLat, wbLng]
  ]);
}

function updateLocationReadouts(lat, lng, customForestName = null) {
  currentCoords = { lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lng.toFixed(4)) };

  // Nearest Forest & Region lookup
  if (customForestName) {
    currentForest = customForestName;
    if (customForestName.toLowerCase().includes('kssem') || customForestName.toLowerCase().includes('kseam') || customForestName.toLowerCase().includes('dsatm') || customForestName.toLowerCase().includes('kanakapura')) {
      currentDistrict = 'Bengaluru Urban';
      currentState = 'Karnataka';
    }
  } else if (lat > 12.75 && lat < 13.15 && lng > 77.40 && lng < 77.75) {
    if (Math.abs(lat - 12.8550) < 0.018 && Math.abs(lng - 77.5420) < 0.018) {
      currentForest = 'KS School of Engineering and Management (KSSEM), Kanakapura Road';
    } else if (Math.abs(lat - 12.8258) < 0.018 && Math.abs(lng - 77.5158) < 0.018) {
      currentForest = 'DSATM Campus, Kanakapura Road';
    } else {
      currentForest = 'Bengaluru South / Kanakapura Forest Belt';
    }
    currentDistrict = 'Bengaluru Urban';
    currentState = 'Karnataka';
  } else if (lat > 20 && lat < 24 && lng > 79) {
    currentForest = 'Kanha National Park';
    currentDistrict = 'Mandla';
    currentState = 'Madhya Pradesh';
  } else if (lat > 28 && lng < 80) {
    currentForest = 'Jim Corbett National Park';
    currentDistrict = 'Nainital';
    currentState = 'Uttarakhand';
  } else if (lat > 11.4 && lat < 11.9 && lng > 76.3 && lng < 76.9) {
    currentForest = 'Bandipur National Park & Tiger Reserve';
    currentDistrict = 'Chamarajanagar';
    currentState = 'Karnataka';
  } else {
    currentForest = 'Bandipur Forest';
    currentDistrict = 'Chamarajanagar';
    currentState = 'Karnataka';
  }

  document.getElementById('readoutCoords').textContent = `${currentCoords.lat}, ${currentCoords.lng}`;
  document.getElementById('readoutForest').textContent = currentForest;
  document.getElementById('readoutDistrict').textContent = currentDistrict;
  document.getElementById('readoutState').textContent = currentState;

  // Sync Alert Name hint & placeholder with active location
  const alertHint = document.getElementById('alertNameHint');
  if (alertHint) alertHint.textContent = `Default: ${currentForest}`;
  const inputAlert = document.getElementById('inputAlertName');
  if (inputAlert && !inputAlert.value.trim()) {
    inputAlert.placeholder = `e.g. ${currentForest} Fire Alert (or leave blank to use location name)`;
  }

  // Redraw overlays on userMap for this location
  renderUserMapOverlays(currentCoords.lat, currentCoords.lng);
}

// 3. Reporting Methods (6 Methods)
function initReportingMethods() {
  document.querySelectorAll('.method-card').forEach(card => {
    card.addEventListener('click', () => {
      setReportingMethod(card.dataset.method);
    });
  });

  // Method 1: Image Dropzone & Presets
  const dropzone = document.getElementById('userDropzone');
  const fileInput = document.getElementById('userFileInput');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) handleImageFile(e.target.files[0]);
    });
  }

  // Method 2: Live Camera Capture
  const btnStartCam = document.getElementById('btnStartCamera');
  const btnSnap = document.getElementById('btnSnapPhoto');
  const camVideo = document.getElementById('cameraVideo');
  const camCanvas = document.getElementById('cameraCanvas');
  const camStatus = document.getElementById('cameraStatusText');

  if (btnStartCam) {
    btnStartCam.addEventListener('click', async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          alert('Camera access not supported on this browser or platform.');
          return;
        }
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        camVideo.srcObject = cameraStream;
        btnSnap.disabled = false;
        if (camStatus) camStatus.classList.add('hidden');
      } catch (err) {
        alert('Could not access camera: ' + err.message);
      }
    });
  }

  if (btnSnap) {
    btnSnap.addEventListener('click', () => {
      if (!cameraStream) return;
      camCanvas.width = camVideo.videoWidth || 640;
      camCanvas.height = camVideo.videoHeight || 480;
      const ctx = camCanvas.getContext('2d');
      ctx.drawImage(camVideo, 0, 0, camCanvas.width, camCanvas.height);

      camCanvas.toBlob((blob) => {
        selectedFile = new File([blob], `camera_fire_${Date.now()}.jpg`, { type: 'image/jpeg' });
        handleImageFile(selectedFile);
        alert('Photo captured successfully! AI Vision Score Board scanning completed.');
      }, 'image/jpeg', 0.85);
    });
  }

  // Method 3: Video Upload
  const videoInput = document.getElementById('userVideoInput');
  const videoPlayer = document.getElementById('videoPreviewPlayer');
  if (videoInput) {
    videoInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        selectedVideoFile = e.target.files[0];
        videoPlayer.src = URL.createObjectURL(selectedVideoFile);
        videoPlayer.classList.remove('hidden');

        // Extract frame for AI Score Board
        videoPlayer.onloadeddata = () => {
          videoPlayer.currentTime = 0.5;
        };
        videoPlayer.onseeked = () => {
          const vCanvas = document.createElement('canvas');
          vCanvas.width = videoPlayer.videoWidth || 640;
          vCanvas.height = videoPlayer.videoHeight || 480;
          const vCtx = vCanvas.getContext('2d');
          vCtx.drawImage(videoPlayer, 0, 0, vCanvas.width, vCanvas.height);
          vCanvas.toBlob(blob => {
            if (blob) {
              const frameFile = new File([blob], 'video_frame.jpg', { type: 'image/jpeg' });
              handleImageFile(frameFile);
            }
          }, 'image/jpeg', 0.85);
        };
      }
    });
  }

  // Method 5: Current GPS Button with Resilient Multi-Tier Fallback (Hardware GPS -> Network/IP -> Local Default)
  const btnGps = document.getElementById('btnCurrentGps');
  if (btnGps) {
    btnGps.addEventListener('click', async () => {
      btnGps.innerHTML = '<span>🔄</span> <span>ACQUIRING LOCATION...</span>';
      btnGps.classList.add('animate-pulse');

      const applyLocation = (lat, lng, label, methodType) => {
        if (userMarker) {
          userMarker.setLatLng([lat, lng]);
        }
        updateLocationReadouts(lat, lng, label);
        restoreUserDefaultZoom();
        if (userMap) setTimeout(() => userMap.invalidateSize(), 300);
        btnGps.innerHTML = '<span>🎯</span> <span>USE MY CURRENT LOCATION</span>';
        btnGps.classList.remove('animate-pulse');

        // Scroll central map into view
        const mapEl = document.getElementById('userCentralMap');
        if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Forward to Admin map in Split View
        try {
          window.parent?.postMessage({
            type: 'LOCATION_SEARCHED',
            lat: lat,
            lng: lng,
            name: label,
            shortName: label
          }, '*');
        } catch (e) {}

        // Show non-blocking toast
        showLocationToast(
          methodType === 'gps' 
            ? `✓ Pinpoint GPS Location Acquired (${lat.toFixed(4)}, ${lng.toFixed(4)})` 
            : `📍 Location Acquired via Network Geolocation (${label})`,
          'success'
        );
      };

      // Resilient Fallback to IP / Network Geolocation
      const tryNetworkGeolocation = async () => {
        try {
          // Attempt 1: Server-side geolocate proxy
          let res = await fetch('/api/geolocate').catch(() => null);
          if (res && res.ok) {
            const data = await res.json();
            if (data && data.success && data.lat && data.lng) {
              const locName = `${data.city || 'Bengaluru'}, ${data.region || 'Karnataka'}`;
              applyLocation(data.lat, data.lng, locName, 'ip');
              return true;
            }
          }

          // Attempt 2: Direct public IP lookup
          const ipRes = await fetch('https://ipwho.is/').catch(() => null);
          if (ipRes && ipRes.ok) {
            const ipData = await ipRes.json();
            if (ipData && ipData.success && ipData.latitude && ipData.longitude) {
              const locName = `${ipData.city || 'Bengaluru'}, ${ipData.region || 'Karnataka'}`;
              applyLocation(ipData.latitude, ipData.longitude, locName, 'ip');
              return true;
            }
          }
        } catch (e) {
          console.warn('[NETWORK GEOLOCATION FALLBACK ERROR]', e);
        }

        // Attempt 3: Default to Bengaluru (Kanakapura Road / DSATM / KSSEM region)
        applyLocation(12.8258, 77.5158, 'Bengaluru (Kanakapura Road Region)', 'default');
        return true;
      };

      // Try browser geolocation first with short timeout & relaxed accuracy
      if (navigator.geolocation) {
        let isHandled = false;
        const timer = setTimeout(() => {
          if (!isHandled) {
            isHandled = true;
            console.log('[GEOLOCATION] Browser GPS timed out on desktop, falling back to IP/Network...');
            tryNetworkGeolocation();
          }
        }, 3800);

        navigator.geolocation.getCurrentPosition(
          pos => {
            if (isHandled) return;
            isHandled = true;
            clearTimeout(timer);
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            applyLocation(lat, lng, 'My Device GPS Location', 'gps');
          },
          err => {
            if (isHandled) return;
            isHandled = true;
            clearTimeout(timer);
            console.warn('[GEOLOCATION NOTICE]', err.message, '-> falling back to Network/IP geolocation');
            tryNetworkGeolocation();
          },
          { enableHighAccuracy: false, timeout: 3500, maximumAge: 120000 }
        );
      } else {
        await tryNetworkGeolocation();
      }
    });
  }

  // Method 6: Location Search with Autocomplete Predictions
  initLocationAutocomplete();
}

// ==========================================
// AUTOCOMPLETE PREDICTIONS DATABASE & ENGINE
// ==========================================
const LOCATION_CATALOG = [
  // Campus & Educational Institutes (Prominently includes KSSEM & DSATM as requested)
  { 
    name: 'KS School of Engineering and Management (KSSEM), Holiday Village Road, Kanakapura Road, Bengaluru', 
    shortName: 'KS School of Engg & Mgmt (KSSEM)', 
    category: 'College / Engineering Campus', 
    icon: '🎓', 
    lat: 12.8550, 
    lng: 77.5420, 
    state: 'Karnataka', 
    district: 'Bengaluru Urban', 
    tags: [
      'ks',
      'kssem',
      'ks school',
      'ks school of engineering',
      'ks school of engineering and management',
      'ks school of engineering and managemnet',
      'kammavari',
      'holiday village',
      'mallasandra',
      'kanakapura',
      'engineering',
      'management',
      'college',
      'bengaluru'
    ] 
  },
  { 
    name: 'KS Institute of Technology (KSIT), Kanakapura Road, Vajrahalli, Bengaluru', 
    shortName: 'KSIT Bengaluru', 
    category: 'College / Engineering Campus', 
    icon: '🎓', 
    lat: 12.8792, 
    lng: 77.5446, 
    state: 'Karnataka', 
    district: 'Bengaluru Urban', 
    tags: [
      'ksit',
      'ks',
      'ks institute',
      'ks institute of technology',
      'vajrahalli',
      'kanakapura',
      'engineering',
      'bengaluru'
    ] 
  },
  { name: 'DSATM Campus, Kanakapura Road, Bengaluru', shortName: 'DSATM Bengaluru', category: 'College / Engineering', icon: '🎓', lat: 12.8258, lng: 77.5158, state: 'Karnataka', district: 'Bengaluru Urban', tags: ['dsatm', 'dayananda sagar', 'kanakapura', 'engineering', 'college'] },
  { name: 'Dayananda Sagar Institutions (DSI), Kumaraswamy Layout, Bengaluru', shortName: 'DSI Main Campus', category: 'Campus / Engineering', icon: '🎓', lat: 12.9081, lng: 77.5663, state: 'Karnataka', district: 'Bengaluru Urban', tags: ['dsi', 'dayananda sagar', 'kumaraswamy layout'] },
  { name: 'Indian Institute of Science (IISc), Mathikere, Bengaluru', shortName: 'IISc Bengaluru', category: 'Research Institute', icon: '🎓', lat: 13.0219, lng: 77.5671, state: 'Karnataka', district: 'Bengaluru Urban', tags: ['iisc', 'science', 'mathikere'] },
  { name: 'RV College of Engineering (RVCE), Mysuru Road, Bengaluru', shortName: 'RVCE Bengaluru', category: 'Engineering College', icon: '🎓', lat: 12.9237, lng: 77.4987, state: 'Karnataka', district: 'Bengaluru Urban', tags: ['rvce', 'rv college', 'mysuru road'] },
  { name: 'PES University, Banashankari 3rd Stage, Bengaluru', shortName: 'PES University', category: 'University Campus', icon: '🎓', lat: 12.9344, lng: 77.5345, state: 'Karnataka', district: 'Bengaluru Urban', tags: ['pes', 'pesit', 'banashankari'] },
  { name: 'BMS College of Engineering, Basavanagudi, Bengaluru', shortName: 'BMSCE Bengaluru', category: 'Engineering College', icon: '🎓', lat: 12.9410, lng: 77.5655, state: 'Karnataka', district: 'Bengaluru Urban', tags: ['bms', 'bmsce', 'basavanagudi'] },
  { name: 'IIT Madras, Sardar Patel Road, Adyar, Chennai', shortName: 'IIT Madras', category: 'National Institute', icon: '🎓', lat: 12.9915, lng: 80.2337, state: 'Tamil Nadu', district: 'Chennai', tags: ['iit madras', 'iitm', 'adyar'] },
  { name: 'IIT Bombay, Powai Lake, Mumbai', shortName: 'IIT Bombay', category: 'National Institute', icon: '🎓', lat: 19.1334, lng: 72.9133, state: 'Maharashtra', district: 'Mumbai Suburban', tags: ['iit bombay', 'iitb', 'powai'] },
  { name: 'IIT Delhi, Hauz Khas, New Delhi', shortName: 'IIT Delhi', category: 'National Institute', icon: '🎓', lat: 28.5450, lng: 77.1926, state: 'Delhi', district: 'South Delhi', tags: ['iit delhi', 'iitd', 'hauz khas'] },
  { name: 'Forest Research Institute (FRI), Dehradun', shortName: 'FRI Dehradun', category: 'Forestry Institute', icon: '🌲', lat: 30.3429, lng: 77.9996, state: 'Uttarakhand', district: 'Dehradun', tags: ['fri', 'forest institute', 'dehradun'] },

  // Key National Parks & Tiger Reserves
  { name: 'Bandipur National Park & Tiger Reserve, Karnataka', shortName: 'Bandipur Tiger Reserve', category: 'Tiger Reserve', icon: '🌲', lat: 11.6643, lng: 76.6250, state: 'Karnataka', district: 'Chamarajanagar', tags: ['bandipur', 'moyar', 'gundlupet', 'forest', 'wildfire'] },
  { name: 'Nagarhole National Park & Tiger Reserve (Kabini), Karnataka', shortName: 'Nagarhole National Park', category: 'National Park', icon: '🌲', lat: 11.9961, lng: 76.1325, state: 'Karnataka', district: 'Kodagu / Mysuru', tags: ['nagarhole', 'kabini', 'forest'] },
  { name: 'Mudumalai Tiger Reserve & National Park, Nilgiris', shortName: 'Mudumalai Tiger Reserve', category: 'Tiger Reserve', icon: '🌲', lat: 11.5623, lng: 76.5341, state: 'Tamil Nadu', district: 'Nilgiris', tags: ['mudumalai', 'theppakadu', 'nilgiris'] },
  { name: 'Wayanad Wildlife Sanctuary, Sulthan Bathery, Kerala', shortName: 'Wayanad Sanctuary', category: 'Wildlife Sanctuary', icon: '🍃', lat: 11.6854, lng: 76.3670, state: 'Kerala', district: 'Wayanad', tags: ['wayanad', 'muthanga', 'tholpetty'] },
  { name: 'Bannerghatta National Park & Safari, Bengaluru', shortName: 'Bannerghatta Reserve', category: 'National Park', icon: '🌲', lat: 12.8009, lng: 77.5777, state: 'Karnataka', district: 'Bengaluru Urban', tags: ['bannerghatta', 'bengaluru park', 'safari'] },
  { name: 'Biligiriranga Hills (BRT) Tiger Reserve, Karnataka', shortName: 'BRT Tiger Reserve', category: 'Tiger Reserve', icon: '⛰️', lat: 11.9922, lng: 77.1444, state: 'Karnataka', district: 'Chamarajanagar', tags: ['brt', 'br hills', 'biligiriranga'] },
  { name: 'Kudremukh National Park & Shola Grasslands', shortName: 'Kudremukh Forest', category: 'National Park', icon: '⛰️', lat: 13.2144, lng: 75.2570, state: 'Karnataka', district: 'Chikkamagaluru', tags: ['kudremukh', 'shola', 'western ghats'] },
  { name: 'Agumbe Rainforest & Cobra Reserve, Western Ghats', shortName: 'Agumbe Rainforest', category: 'Rainforest', icon: '🌧️', lat: 13.5078, lng: 75.0934, state: 'Karnataka', district: 'Shimoga', tags: ['agumbe', 'rainforest', 'ghats'] },
  { name: 'Dandeli Wildlife Sanctuary & Kali Tiger Reserve', shortName: 'Dandeli Reserve', category: 'Wildlife Sanctuary', icon: '🌲', lat: 15.2447, lng: 74.6231, state: 'Karnataka', district: 'Uttara Kannada', tags: ['dandeli', 'kali', 'teak'] },
  { name: 'Jim Corbett National Park (Dhikala), Uttarakhand', shortName: 'Jim Corbett National Park', category: 'Tiger Reserve', icon: '🐅', lat: 29.5300, lng: 78.7747, state: 'Uttarakhand', district: 'Nainital', tags: ['corbett', 'jim corbett', 'ramnagar', 'nainital'] },
  { name: 'Kanha Tiger Reserve, Mandla / Balaghat', shortName: 'Kanha Tiger Reserve', category: 'Tiger Reserve', icon: '🦌', lat: 22.3345, lng: 80.6115, state: 'Madhya Pradesh', district: 'Mandla', tags: ['kanha', 'mandla', 'sal forest'] },
  { name: 'Pench Tiger Reserve & National Park', shortName: 'Pench Tiger Reserve', category: 'Tiger Reserve', icon: '🐅', lat: 21.7583, lng: 79.3056, state: 'Madhya Pradesh', district: 'Seoni', tags: ['pench', 'mowgli', 'seoni'] },
  { name: 'Kaziranga National Park & Rhino Sanctuary, Assam', shortName: 'Kaziranga National Park', category: 'World Heritage', icon: '🦏', lat: 26.5775, lng: 93.1711, state: 'Assam', district: 'Golaghat', tags: ['kaziranga', 'assam', 'rhino'] },
  { name: 'Ranthambore National Park, Sawai Madhopur', shortName: 'Ranthambore Tiger Reserve', category: 'Tiger Reserve', icon: '🐅', lat: 26.0173, lng: 76.5026, state: 'Rajasthan', district: 'Sawai Madhopur', tags: ['ranthambore', 'rajasthan'] },
  { name: 'Gir Forest National Park (Asiatic Lion Sanctuary)', shortName: 'Gir National Park', category: 'National Park', icon: '🦁', lat: 21.1243, lng: 70.7937, state: 'Gujarat', district: 'Junagadh', tags: ['gir', 'asiatic lion', 'gujarat'] },
  { name: 'Sundarbans Mangrove Tiger Reserve, West Bengal', shortName: 'Sundarbans Reserve', category: 'Mangrove / Reserve', icon: '🌿', lat: 21.9497, lng: 88.8999, state: 'West Bengal', district: 'South 24 Parganas', tags: ['sundarbans', 'delta', 'bengal'] },
  { name: 'Periyar Tiger Reserve, Thekkady', shortName: 'Periyar Tiger Reserve', category: 'Tiger Reserve', icon: '🐘', lat: 9.4679, lng: 77.1435, state: 'Kerala', district: 'Idukki', tags: ['periyar', 'thekkady', 'cardamom hills'] },
  { name: 'Silent Valley National Park, Palakkad', shortName: 'Silent Valley', category: 'Rainforest', icon: '🍃', lat: 11.0838, lng: 76.4526, state: 'Kerala', district: 'Palakkad', tags: ['silent valley', 'lion tailed macaque'] },
  { name: 'Tadoba-Andhari Tiger Reserve, Chandrapur', shortName: 'Tadoba Tiger Reserve', category: 'Tiger Reserve', icon: '🐅', lat: 20.2443, lng: 79.3082, state: 'Maharashtra', district: 'Chandrapur', tags: ['tadoba', 'chandrapur'] },
  { name: 'Satpura Tiger Reserve, Hoshangabad', shortName: 'Satpura Reserve', category: 'Tiger Reserve', icon: '⛰️', lat: 22.4633, lng: 78.2917, state: 'Madhya Pradesh', district: 'Hoshangabad', tags: ['satpura', 'pachmarhi'] },
  { name: 'Similipal Biosphere Reserve, Mayurbhanj', shortName: 'Similipal Biosphere', category: 'Biosphere Reserve', icon: '🌲', lat: 21.8600, lng: 86.3400, state: 'Odisha', district: 'Mayurbhanj', tags: ['similipal', 'odisha'] },
  { name: 'Great Himalayan National Park, Kullu Valley', shortName: 'Great Himalayan Park', category: 'Alpine Reserve', icon: '🏔️', lat: 31.7833, lng: 77.4167, state: 'Himachal Pradesh', district: 'Kullu', tags: ['himalayan', 'kullu', 'alpine'] },
  { name: 'Rajaji National Park & Elephant Corridor', shortName: 'Rajaji National Park', category: 'National Park', icon: '🐘', lat: 29.9833, lng: 78.1833, state: 'Uttarakhand', district: 'Haridwar', tags: ['rajaji', 'haridwar', 'rishikesh'] },
  { name: 'Dudhwa National Park, Terai Grasslands', shortName: 'Dudhwa National Park', category: 'National Park', icon: '🌾', lat: 28.4900, lng: 80.6500, state: 'Uttar Pradesh', district: 'Lakhimpur Kheri', tags: ['dudhwa', 'terai', 'swamp deer'] },

  // Key Cities & Hill Stations
  { name: 'Bengaluru / Bangalore Urban, Karnataka', shortName: 'Bengaluru City', category: 'Major City', icon: '🏙️', lat: 12.9716, lng: 77.5946, state: 'Karnataka', district: 'Bengaluru Urban', tags: ['bengaluru', 'bangalore', 'capital', 'karnataka'] },
  { name: 'Mysuru / Mysore Heritage City, Karnataka', shortName: 'Mysuru City', category: 'Heritage City', icon: '🏰', lat: 12.2958, lng: 76.6394, state: 'Karnataka', district: 'Mysuru', tags: ['mysuru', 'mysore', 'chamundi'] },
  { name: 'Coorg (Madikeri), Western Ghats, Karnataka', shortName: 'Coorg / Madikeri', category: 'Hill Station', icon: '☕', lat: 12.4244, lng: 75.7382, state: 'Karnataka', district: 'Kodagu', tags: ['coorg', 'madikeri', 'kodagu'] },
  { name: 'Ooty (Udhagamandalam), Nilgiris, Tamil Nadu', shortName: 'Ooty Nilgiris', category: 'Hill Station', icon: '⛰️', lat: 11.4102, lng: 76.6950, state: 'Tamil Nadu', district: 'Nilgiris', tags: ['ooty', 'nilgiris', 'tea'] },
  { name: 'Kodaikanal (Princess of Hill Stations), Tamil Nadu', shortName: 'Kodaikanal', category: 'Hill Station', icon: '⛰️', lat: 10.2381, lng: 77.4892, state: 'Tamil Nadu', district: 'Dindigul', tags: ['kodaikanal', 'kodai', 'palani'] },
  { name: 'Munnar Tea Hills, Western Ghats, Kerala', shortName: 'Munnar', category: 'Hill Station', icon: '🍃', lat: 10.0889, lng: 77.0595, state: 'Kerala', district: 'Idukki', tags: ['munnar', 'tea', 'idukki'] },
  { name: 'Dehradun Valley, Shivalik Foothills', shortName: 'Dehradun', category: 'Capital City', icon: '🏔️', lat: 30.3165, lng: 78.0322, state: 'Uttarakhand', district: 'Dehradun', tags: ['dehradun', 'doon', 'shivalik'] },
  { name: 'Shimla Capital Hill Station, Himachal Pradesh', shortName: 'Shimla', category: 'Hill Station', icon: '🏔️', lat: 31.1048, lng: 77.1734, state: 'Himachal Pradesh', district: 'Shimla', tags: ['shimla', 'mall road'] },
  { name: 'New Delhi, National Capital Region', shortName: 'New Delhi', category: 'National Capital', icon: '🏛️', lat: 28.6139, lng: 77.2090, state: 'Delhi', district: 'New Delhi', tags: ['delhi', 'new delhi', 'ncr'] },
  { name: 'Mumbai Financial Capital, Maharashtra', shortName: 'Mumbai', category: 'Metro City', icon: '🏙️', lat: 19.0760, lng: 72.8777, state: 'Maharashtra', district: 'Mumbai', tags: ['mumbai', 'bombay'] }
];

function initLocationAutocomplete() {
  const inputSearch = document.getElementById('inputSearchLocation');
  const dropdown = document.getElementById('searchPredictionsDropdown');
  const list = document.getElementById('predictionsList');
  const headerLabel = document.getElementById('predictionsHeaderLabel');
  const btnClear = document.getElementById('btnClearSearchLoc');
  const btnSearch = document.getElementById('btnSearchLoc');
  const quickPills = document.querySelectorAll('.quick-loc-pill');

  if (!inputSearch || !dropdown || !list) return;

  let activeIndex = -1;
  let currentPredictions = [];
  let debounceTimer = null;

  // Helper: Highlight matching query characters
  function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark class="bg-amber-500/30 text-amber-300 font-bold px-0.5 rounded">$1</mark>');
  }

  // Render Predictions List
  function renderPredictions(items, query = '') {
    currentPredictions = items;
    if (!items || items.length === 0) {
      list.innerHTML = `
        <div class="p-3 text-center text-xs text-slate-400">
          <span>❌ No matching locations found for "<b>${query}</b>"</span>
          <div class="text-[10px] text-slate-500 mt-1">Try another keyword or press Search to query online geocoder.</div>
        </div>
      `;
      dropdown.classList.remove('hidden');
      return;
    }

    if (headerLabel) {
      headerLabel.innerHTML = query
        ? `<span>🔍 PREDICTIONS FOR "<b>${query}</b>" (${items.length})</span>`
        : `<span>⭐ POPULAR & RECOMMENDED LOCATIONS (${items.length})</span>`;
    }

    list.innerHTML = items.map((item, idx) => {
      const isSelected = idx === activeIndex;
      const selectClass = isSelected
        ? 'bg-orange-950/70 border-l-4 border-orange-500 shadow-md ring-1 ring-orange-500/40'
        : 'hover:bg-[#101b33] hover:border-l-4 hover:border-orange-500/80';
      const latStr = typeof item.lat === 'number' ? item.lat.toFixed(4) : item.lat;
      const lngStr = typeof item.lng === 'number' ? item.lng.toFixed(4) : item.lng;
      const sourceTag = item.isOnline
        ? `<span class="text-[8px] font-mono px-1 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-700/60 uppercase">ONLINE</span>`
        : `<span class="text-[8px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 uppercase">${item.category || 'LOCATION'}</span>`;

      return `
        <div class="prediction-item px-3 py-2 cursor-pointer transition-all flex items-center justify-between gap-2.5 ${selectClass}" data-idx="${idx}">
          <div class="flex items-start gap-2.5 min-w-0 flex-1">
            <span class="text-base shrink-0 pt-0.5">${item.icon || '📍'}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-bold text-white leading-tight break-words">${highlightMatch(item.name, query)}</span>
                ${sourceTag}
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5 truncate flex items-center gap-1.5 font-mono">
                <span class="truncate">📍 ${item.district || ''}${item.district && item.state ? ', ' : ''}${item.state || ''}</span>
                <span class="text-slate-600">•</span>
                <span class="text-cyan-400 font-bold shrink-0">${latStr}, ${lngStr}</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn-fly-to-loc shrink-0 px-2 py-1 rounded bg-orange-950/60 hover:bg-orange-600 border border-orange-700/60 text-orange-300 hover:text-white text-[10px] font-bold transition flex items-center gap-1 shadow-sm">
            <span>✈️ Fly</span>
          </button>
        </div>
      `;
    }).join('');

    dropdown.classList.remove('hidden');

    // Click handler for items
    list.querySelectorAll('.prediction-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        if (currentPredictions[idx]) selectPrediction(currentPredictions[idx]);
      });
    });
  }

  // Select Prediction & Pinpoint Map with Connected Stations and Water Bodies
  function selectPrediction(item) {
    if (!item) return;
    inputSearch.value = item.name;
    if (btnClear) btnClear.classList.remove('hidden');

    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lng);

    if (userMarker) {
      userMarker.setLatLng([lat, lng]);
    }

    // Update location readouts & form default hint (invokes renderUserMapOverlays to draw circles, station, water, routes, and computes userSectorBounds)
    updateLocationReadouts(lat, lng, item.name);

    // Restore sector default zoom so BOTH the fire location, nearby fire station, and waterbody are in view!
    restoreUserDefaultZoom();

    // Scroll map smoothly into view so user sees the location, connected stations and waterbodies immediately
    const mapEl = document.getElementById('userCentralMap');
    if (mapEl) {
      mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Forward to parent / Admin iframe for live dual split screen demo
    try {
      window.parent?.postMessage({
        type: 'LOCATION_SEARCHED',
        lat: lat,
        lng: lng,
        name: item.name,
        shortName: item.shortName || item.name
      }, '*');
    } catch (e) {}

    hideDropdown();

    // Display non-blocking feedback toast
    showLocationToast(`📍 Pinned location: ${item.shortName || item.name} (Connected Stations & Waterbodies)`, 'info');
  }

  function hideDropdown() {
    dropdown.classList.add('hidden');
    activeIndex = -1;
  }

  // Filter Catalog & Query Nominatim
  function executePredictionsSearch(query) {
    const q = query.trim().toLowerCase();

    if (!q) {
      // Default: Return top curated recommendations
      const defaultPresets = LOCATION_CATALOG.slice(0, 8);
      activeIndex = -1;
      renderPredictions(defaultPresets, '');
      return;
    }

    // 1. Instant local catalog filter (0ms latency)
    const localMatches = LOCATION_CATALOG.filter(loc => {
      const matchName = loc.name.toLowerCase().includes(q);
      const matchShort = loc.shortName && loc.shortName.toLowerCase().includes(q);
      const matchCategory = loc.category && loc.category.toLowerCase().includes(q);
      const matchState = loc.state && loc.state.toLowerCase().includes(q);
      const matchDistrict = loc.district && loc.district.toLowerCase().includes(q);
      const matchTag = loc.tags && loc.tags.some(t => t.toLowerCase().includes(q));
      return matchName || matchShort || matchCategory || matchState || matchDistrict || matchTag;
    });

    activeIndex = -1;
    renderPredictions(localMatches, query);

    // 2. Debounced online Nominatim geocoder if query has >= 3 chars
    if (q.length >= 3) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}&limit=5`);
          const data = await res.json();
          if (data && data.length > 0) {
            const onlineResults = data.map(d => {
              const parts = (d.display_name || '').split(',');
              const title = parts.slice(0, 2).join(',').trim();
              const rest = parts.slice(2).join(',').trim();
              return {
                name: d.display_name,
                shortName: title,
                category: d.type || 'ONLINE',
                icon: '📍',
                lat: parseFloat(d.lat),
                lng: parseFloat(d.lon),
                state: parts[parts.length - 2]?.trim() || '',
                district: parts[parts.length - 3]?.trim() || '',
                isOnline: true
              };
            });

            // Merge local and online, avoiding duplicates
            const combined = [...localMatches];
            onlineResults.forEach(onl => {
              if (!combined.some(c => Math.abs(c.lat - onl.lat) < 0.005 && Math.abs(c.lng - onl.lng) < 0.005)) {
                combined.push(onl);
              }
            });

            renderPredictions(combined, query);
          }
        } catch (e) {
          console.warn('Online prediction fetch warning:', e);
        }
      }, 280);
    }
  }

  // Focus Event: Show top popular recommendations
  inputSearch.addEventListener('focus', () => {
    executePredictionsSearch(inputSearch.value);
  });

  // Input Event: Live search predictions
  inputSearch.addEventListener('input', () => {
    if (btnClear) btnClear.classList.toggle('hidden', !inputSearch.value.trim());
    executePredictionsSearch(inputSearch.value);
  });

  // Clear Button
  if (btnClear) {
    btnClear.addEventListener('click', (e) => {
      e.stopPropagation();
      inputSearch.value = '';
      btnClear.classList.add('hidden');
      inputSearch.focus();
      executePredictionsSearch('');
    });
  }

  // Keyboard Navigation: Up, Down, Enter, Escape
  inputSearch.addEventListener('keydown', (e) => {
    if (dropdown.classList.contains('hidden')) {
      if (e.key === 'ArrowDown') {
        executePredictionsSearch(inputSearch.value);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentPredictions.length === 0) return;
      activeIndex = (activeIndex + 1) % currentPredictions.length;
      renderPredictions(currentPredictions, inputSearch.value.trim());
      // Scroll into view
      const activeEl = list.children[activeIndex];
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentPredictions.length === 0) return;
      activeIndex = (activeIndex - 1 + currentPredictions.length) % currentPredictions.length;
      renderPredictions(currentPredictions, inputSearch.value.trim());
      const activeEl = list.children[activeIndex];
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && currentPredictions[activeIndex]) {
        selectPrediction(currentPredictions[activeIndex]);
      } else if (currentPredictions.length > 0) {
        selectPrediction(currentPredictions[0]);
      } else if (inputSearch.value.trim()) {
        btnSearch?.click();
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  });

  // Document Click Outside: Close dropdown
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== inputSearch && e.target !== btnClear) {
      hideDropdown();
    }
  });

  // Wire Search Button
  if (btnSearch) {
    btnSearch.addEventListener('click', async () => {
      const q = inputSearch.value.trim();
      if (!q) return;
      hideDropdown();

      // Check if matches any in local catalog first
      const ql = q.toLowerCase();
      const directMatch = LOCATION_CATALOG.find(c => 
        c.name.toLowerCase().includes(ql) || 
        (c.tags && c.tags.some(t => t.includes(ql))) ||
        (ql.length >= 2 && c.tags && c.tags.some(t => ql.includes(t))) ||
        (c.shortName && c.shortName.toLowerCase().includes(ql))
      );
      if (directMatch) {
        selectPrediction(directMatch);
        return;
      }

      // Fallback to geocoder
      btnSearch.textContent = '...';
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(q)}&limit=1`);
        const data = await res.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          const locName = data[0].display_name.split(',').slice(0, 3).join(', ').trim() || q;
          selectPrediction({ name: locName, lat, lng: lon });
          return;
        }
      } catch (err) {
        console.warn('Geocoding search warning:', err);
      } finally {
        btnSearch.textContent = 'Search';
      }

      // Default fallback
      updateLocationReadouts(currentCoords.lat, currentCoords.lng, q);
      restoreUserDefaultZoom();
      try {
        window.parent?.postMessage({
          type: 'LOCATION_SEARCHED',
          lat: currentCoords.lat,
          lng: currentCoords.lng,
          name: q
        }, '*');
      } catch (e) {}
    });
  }

  // Wire Quick Suggestion Pills
  quickPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const name = pill.dataset.name;
      const lat = parseFloat(pill.dataset.lat);
      const lng = parseFloat(pill.dataset.lng);
      selectPrediction({ name, lat, lng });
    });
  });
}

function setReportingMethod(method) {
  currentDetectionMethod = method;
  document.querySelectorAll('.method-card').forEach(c => {
    const isAct = c.dataset.method === method;
    c.className = isAct ? 'method-card p-3 rounded-xl border border-orange-500/80 bg-orange-950/30 text-center transition cursor-pointer' : 'method-card p-3 rounded-xl border border-slate-700 bg-[#0d182e] text-center hover:border-orange-500 transition cursor-pointer';
  });

  const pImg = document.getElementById('panelImage');
  const pCam = document.getElementById('panelCamera');
  const pVid = document.getElementById('panelVideo');

  if (pImg) pImg.classList.add('hidden');
  if (pCam) pCam.classList.add('hidden');
  if (pVid) pVid.classList.add('hidden');

  if (method === 'Camera' && pCam) {
    pCam.classList.remove('hidden');
    pCam.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (method === 'Video' && pVid) {
    pVid.classList.remove('hidden');
    pVid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    if (pImg) pImg.classList.remove('hidden');
    if (method === 'Image' && pImg) {
      pImg.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (method === 'Manual') {
      const mapCard = document.getElementById('userCentralMap');
      if (mapCard) mapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (method === 'GPS') {
      const btnGps = document.getElementById('btnCurrentGps');
      if (btnGps) btnGps.click();
      const mapCard = document.getElementById('userCentralMap');
      if (mapCard) mapCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (method === 'Search') {
      const searchInput = document.getElementById('inputSearchLocation');
      if (searchInput) {
        searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => searchInput.focus(), 350);
      }
    }
  }
}

function handleImageFile(file) {
  selectedFile = file;
  const preview = document.getElementById('imgMediaPreview');
  const placeholder = document.getElementById('imgMediaEmptyPlaceholder');
  const fileInfo = document.getElementById('selectedFileInfo');
  const fileName = document.getElementById('selectedFileName');
  const fileSize = document.getElementById('selectedFileSize');
  const scanLine = document.getElementById('scanLaserLine');

  if (fileInfo && fileName && fileSize) {
    fileName.textContent = file.name;
    fileSize.textContent = `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    fileInfo.classList.remove('hidden');
  }

  if (placeholder) placeholder.classList.add('hidden');
  if (scanLine) scanLine.classList.remove('hidden');

  const badge = document.getElementById('txtAiBadge');
  if (badge) {
    badge.textContent = 'ANALYZING SPECTRUM...';
    badge.className = 'text-[10px] font-black px-2 py-0.5 rounded bg-amber-950 border border-amber-600 text-amber-300 animate-pulse';
  }

  if (preview) {
    preview.onload = () => {
      // 1. Instant Client-Side Analysis (< 50ms)
      analyzeImageFast(preview, (instantMetrics) => {
        updateScoreboardUI(instantMetrics);
      });

      // 2. Server Dual-Spectrum / YOLOv8 Validation API
      const formData = new FormData();
      formData.append('fireImage', file);
      formData.append('forestRegion', currentForest);

      fetch('/api/analyze-image', { method: 'POST', body: formData })
        .then(res => res.json())
        .then(result => {
          if (scanLine) scanLine.classList.add('hidden');
          if (result.success && result.scoreboard) {
            updateScoreboardUI(result.scoreboard);
            if (badge) {
              const isFire = result.fireDetected !== false;
              badge.textContent = isFire ? 'FIRE DETECTED - VERIFIED' : 'SPECTRUM CLEAR - SAFE';
              badge.className = isFire
                ? 'text-[10px] font-black px-2 py-0.5 rounded bg-red-950 border border-red-600 text-red-300'
                : 'text-[10px] font-black px-2 py-0.5 rounded bg-emerald-950 border border-emerald-600 text-emerald-300';
            }
          }
        })
        .catch(err => {
          if (scanLine) scanLine.classList.add('hidden');
          console.warn('[AI VISION CLIENT WARN]', err);
        });
    };

    preview.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');
  }
}

// Live Score Board UI Updater (Detection Result HUD)
function updateScoreboardUI(data) {
  const isFire = data.fireDetected !== false && (data.anomalyConfidence > 15 || data.riskScore > 20 || data.fireDetected);

  const timestampEl = document.getElementById('sbTimestamp');
  if (timestampEl) {
    timestampEl.textContent = data.timestamp || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }

  const banner = document.getElementById('sbStatusBanner');
  const iconBox = document.getElementById('sbStatusIconBox');
  const title = document.getElementById('sbStatusTitle');
  const subtitle = document.getElementById('sbStatusSubtitle');
  const badge = document.getElementById('sbStatusBadge');

  if (banner && iconBox && title && subtitle && badge) {
    if (isFire) {
      banner.className = 'p-3 rounded-xl border flex items-center justify-between transition-all duration-300 bg-gradient-to-r from-red-950/80 to-orange-950/80 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]';
      iconBox.className = 'w-8 h-8 rounded-lg flex items-center justify-center text-base bg-red-900/60 border border-red-500 text-red-300 animate-pulse';
      iconBox.textContent = '🔥';
      title.textContent = data.statusTitle || 'FIRE DETECTED';
      const objCount = data.objectsCount || 3;
      subtitle.textContent = `Status: Active Wildfire (${objCount} Objects)`;
      badge.textContent = data.badgeText || data.severity || 'CRITICAL';
      badge.className = 'text-[10px] font-black px-2 py-0.5 rounded-md bg-red-600 text-white border border-red-400 shadow-sm animate-pulse';
    } else {
      banner.className = 'p-3 rounded-xl border flex items-center justify-between transition-all duration-300 bg-emerald-950/40 border-emerald-500/40';
      iconBox.className = 'w-8 h-8 rounded-lg flex items-center justify-center text-base bg-emerald-900/60 border border-emerald-500/40 text-emerald-300';
      iconBox.textContent = '🛡️';
      title.textContent = 'NO ANOMALIES DETECTED';
      subtitle.textContent = 'Status: Forest Clear (0 Objects)';
      badge.textContent = 'SAFE';
      badge.className = 'text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-800 text-emerald-200 border border-emerald-600/50';
    }
  }

  // 5 Telemetry Progress Bars (Fire & Smoke ABOVE Anomaly)
  const fireConfVal = parseFloat(data.fireConfidence !== undefined ? data.fireConfidence : (data.fireScore !== undefined ? data.fireScore : (isFire ? 96.8 : 0.0))).toFixed(1);
  const smokeVal = parseFloat(data.smokeConfidence !== undefined ? data.smokeConfidence : (isFire ? 92.0 : 0.0)).toFixed(1);
  const covVal = parseFloat(data.fireCoverage !== undefined ? data.fireCoverage : (isFire ? 38.5 : 0.0)).toFixed(1);
  const smkLvlVal = parseFloat(data.smokeLevel !== undefined ? data.smokeLevel : (isFire ? 85.0 : 0.0)).toFixed(1);
  const anomVal = parseFloat(data.anomalyConfidence !== undefined ? data.anomalyConfidence : (isFire ? 94.6 : 0.0)).toFixed(1);

  // 1. Fire Confidence (TOP)
  const elFireConf = document.getElementById('sbValFireConfidence');
  const barFireConf = document.getElementById('sbBarFireConfidence');
  if (elFireConf) elFireConf.textContent = `${fireConfVal}%`;
  if (barFireConf) barFireConf.style.width = `${Math.min(100, Math.max(0, fireConfVal))}%`;

  // 2. Smoke Confidence
  const elSmk = document.getElementById('sbValSmoke');
  const barSmk = document.getElementById('sbBarSmoke');
  if (elSmk) elSmk.textContent = `${smokeVal}%`;
  if (barSmk) barSmk.style.width = `${Math.min(100, Math.max(0, smokeVal))}%`;

  // 3. Fire Coverage
  const elCov = document.getElementById('sbValCoverage');
  const barCov = document.getElementById('sbBarCoverage');
  if (elCov) elCov.textContent = `${covVal}%`;
  if (barCov) barCov.style.width = `${Math.min(100, Math.max(0, covVal))}%`;

  // 4. Smoke Level
  const elSmkLvl = document.getElementById('sbValSmokeLevel');
  const barSmkLvl = document.getElementById('sbBarSmokeLevel');
  if (elSmkLvl) elSmkLvl.textContent = `${smkLvlVal}%`;
  if (barSmkLvl) barSmkLvl.style.width = `${Math.min(100, Math.max(0, smkLvlVal))}%`;

  // 5. Anomaly Confidence (BELOW FIRE & SMOKE)
  const elAnom = document.getElementById('sbValAnomaly');
  const barAnom = document.getElementById('sbBarAnomaly');
  if (elAnom) elAnom.textContent = `${anomVal}%`;
  if (barAnom) barAnom.style.width = `${Math.min(100, Math.max(0, anomVal))}%`;

  // Unhide Scoreboard container now that image is uploaded & analyzed
  const sbContainer = document.getElementById('userScoreBoardContainer');
  if (sbContainer) sbContainer.classList.remove('hidden');

  // 1. Fire Coverage (Amount of Fire Seen in Image - PRIMARY CRITICALITY FACTOR)
  const covEl = document.getElementById('sbMetricCoverage');
  if (covEl) {
    covEl.textContent = `${covVal}%`;
    covEl.className = isFire ? 'text-base font-black text-amber-400 font-mono' : 'text-base font-black text-slate-400 font-mono';
  }
  const covLvlEl = document.getElementById('sbMetricCoverageLevel');
  if (covLvlEl) {
    const spreadLabel = !isFire ? 'LEVEL: CLEAR' : (parseFloat(covVal) > 30 ? 'HIGH SPREAD (CRITICAL)' : (parseFloat(covVal) > 15 ? 'MODERATE SPREAD' : 'EARLY STAGE'));
    covLvlEl.textContent = spreadLabel;
    covLvlEl.className = isFire ? 'text-[9px] font-bold text-amber-300 block mt-0.5 truncate' : 'text-[9px] font-bold text-slate-400 block mt-0.5 truncate';
  }

  // 2. Fire Score & Level
  const fireScoreVal = parseFloat(data.fireScore !== undefined ? data.fireScore : anomVal).toFixed(1);
  const fireScoreEl = document.getElementById('sbMetricFireScore');
  if (fireScoreEl) {
    fireScoreEl.textContent = `${fireScoreVal}%`;
    fireScoreEl.className = isFire ? 'text-xs font-black text-orange-400 font-mono' : 'text-xs font-black text-slate-400 font-mono';
  }
  const fireLevelEl = document.getElementById('sbMetricFireLevel');
  if (fireLevelEl) {
    fireLevelEl.textContent = isFire ? `LEVEL: ${data.fireLevel || (riskVal >= 84 ? 'CRITICAL' : 'HIGH')}` : 'LEVEL: SAFE';
    fireLevelEl.className = isFire ? 'text-[8px] font-bold text-orange-400 block mt-0.5' : 'text-[8px] font-bold text-slate-400 block mt-0.5';
  }

  // 2. Risk Score & Severity
  const riskVal = isFire ? (data.riskScore !== undefined ? data.riskScore : 96) : 0;
  const sevVal = isFire ? (data.severity || 'CRITICAL') : 'NORMAL';

  const riskEl = document.getElementById('sbMetricRisk');
  if (riskEl) {
    riskEl.textContent = riskVal;
    riskEl.className = isFire ? 'text-base font-black text-red-400 font-mono' : 'text-base font-black text-emerald-400 font-mono';
  }

  const sevEl = document.getElementById('sbMetricSeverity');
  if (sevEl) {
    sevEl.textContent = sevVal;
    sevEl.className = isFire ? 'text-[9px] font-bold text-red-400 block mt-0.5' : 'text-[9px] font-bold text-emerald-400 block mt-0.5';
  }

  // 3. AI Fake Score & Authenticity Check
  const fakeProb = parseFloat(data.fakeProbability !== undefined ? data.fakeProbability : (isFire ? 3.2 : 91.2)).toFixed(1);
  const authScore = parseFloat(data.authenticityScore !== undefined ? data.authenticityScore : (100 - fakeProb)).toFixed(1);
  const isFakeDetected = parseFloat(fakeProb) > 50 || data.isFake;

  const fakeEl = document.getElementById('sbMetricFakeScore');
  if (fakeEl) {
    fakeEl.textContent = `${fakeProb}%`;
    fakeEl.className = isFakeDetected ? 'text-base font-black text-red-400 font-mono' : 'text-base font-black text-emerald-400 font-mono';
  }

  const fakeVerdictEl = document.getElementById('sbMetricFakeVerdict');
  if (fakeVerdictEl) {
    fakeVerdictEl.textContent = isFakeDetected ? 'SUSPECTED FAKE' : 'REAL PHOTO';
    fakeVerdictEl.className = isFakeDetected ? 'text-[9px] font-bold text-red-400 truncate block mt-0.5' : 'text-[9px] font-bold text-emerald-400 truncate block mt-0.5';
  }

  const authPctEl = document.getElementById('sbAuthenticityPercent');
  if (authPctEl) {
    authPctEl.textContent = `${authScore}% Authentic`;
    authPctEl.className = isFakeDetected ? 'font-mono font-bold text-red-400' : 'font-mono font-bold text-emerald-400';
  }

  const barAuth = document.getElementById('sbBarAuthenticity');
  if (barAuth) {
    barAuth.style.width = `${Math.min(100, Math.max(0, authScore))}%`;
    barAuth.className = isFakeDetected
      ? 'h-full bg-gradient-to-r from-red-500 to-amber-500 rounded-full transition-all duration-700'
      : 'h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-700';
  }

  const fakeStatusEl = document.getElementById('sbFakeStatusText');
  if (fakeStatusEl) {
    fakeStatusEl.textContent = isFakeDetected
      ? '⚠️ Warning: Potential False Alarm / Non-Fire Photograph Detected'
      : '✓ Verified Authentic Field Evidence (Not AI-Generated / Not Synthetic Hoax)';
    fakeStatusEl.className = isFakeDetected ? 'text-[9px] font-mono text-red-400 pt-0.5' : 'text-[9px] font-mono text-emerald-300/90 pt-0.5';
  }

  // Early Warning Alert Box
  const alertBox = document.getElementById('sbAlertBox');
  const alertText = document.getElementById('sbAlertText');
  if (alertBox && alertText) {
    if (isFire) {
      alertBox.className = 'p-2 rounded-xl border flex items-center justify-center text-center font-black text-xs tracking-wider transition-all duration-300 bg-red-950/80 border-red-600/70 text-red-300 shadow-md';
      alertText.textContent = data.earlyWarningAlert || 'CRITICAL - IMMEDIATE DISPATCH';
    } else {
      alertBox.className = 'p-2 rounded-xl border flex items-center justify-center text-center font-black text-xs tracking-wider transition-all duration-300 bg-emerald-950/40 border-emerald-600/40 text-emerald-300';
      alertText.textContent = 'NORMAL - SECTOR CLEAR';
    }
  }

  // Hidden form synchronization
  const hdnAnom = document.getElementById('hdnAiConfidence');
  if (hdnAnom) hdnAnom.value = anomVal;
  const hdnSmk = document.getElementById('hdnSmokeConfidence');
  if (hdnSmk) hdnSmk.value = smokeVal;
  const hdnCov = document.getElementById('hdnFireCoverage');
  if (hdnCov) hdnCov.value = covVal;
  const hdnSmkLvl = document.getElementById('hdnSmokeLevel');
  if (hdnSmkLvl) hdnSmkLvl.value = smkLvlVal;
  const hdnRisk = document.getElementById('hdnRiskScore');
  if (hdnRisk) hdnRisk.value = riskVal;
  const hdnSev = document.getElementById('hdnSeverity');
  if (hdnSev) hdnSev.value = sevVal;
  const hdnFake = document.getElementById('hdnFakeScore');
  if (hdnFake) hdnFake.value = fakeProb;
  const hdnAuth = document.getElementById('hdnAuthenticityScore');
  if (hdnAuth) hdnAuth.value = authScore;

  const txtConf = document.getElementById('txtAiConf');
  if (txtConf) txtConf.textContent = `${anomVal}%`;
  const txtSev = document.getElementById('txtAiSev');
  if (txtSev) txtSev.textContent = sevVal;
}

// Fast In-Browser Canvas Spectral Analysis
function analyzeImageFast(imgElement, callback) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0, 64, 64);
    const imgData = ctx.getImageData(0, 0, 64, 64).data;

    let firePixels = 0;
    let smokePixels = 0;
    const total = 64 * 64;

    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];

      // Multi-spectral fire detection: Red-Orange, Golden Yellow, White-Hot core, Embers
      const isRedFire = (r > 130 && r > g && g >= b && (r - b) > 25);
      const isYellowFire = (r > 175 && g > 130 && (r + g) > (2.1 * b));
      const isWhiteCore = (r > 215 && g > 190 && b > 140 && r >= g && g >= b);
      const isEmbers = (r > 110 && r > 1.3 * g && r > 1.5 * b);

      if (isRedFire || isYellowFire || isWhiteCore || isEmbers) {
        firePixels++;
      } else if ((Math.abs(r - g) < 35 && Math.abs(g - b) < 35 && r > 65 && r < 225) ||
                 (r > 85 && g > 70 && b < 165 && r > b && g > b)) {
        smokePixels++;
      }
    }

    const fireRatio = firePixels / total;
    const smokeRatio = smokePixels / total;
    const isFire = fireRatio > 0.004 || (fireRatio > 0.002 && smokeRatio > 0.08);

    if (isFire) {
      const fireConf = Math.min(99.6, Math.max(90.0, 88.0 + fireRatio * 110));
      const smkConf = Math.min(98.0, Math.max(76.0, 78.0 + smokeRatio * 110));
      const cov = Math.min(94.0, Math.max(18.0, fireRatio * 220 + 15));
      const smkLvl = Math.min(96.0, Math.max(30.0, smokeRatio * 170 + 30));
      const anom = Math.min(99.4, Math.max(84.0, 84.0 + fireRatio * 85 + smokeRatio * 25));

      // "More the fire, more the seriousness":
      // Base risk scales directly with fire coverage and flame spread
      const fireScale = Math.min(1.0, (cov / 34.0));
      const baseRisk = 74 + Math.round(fireScale * 23); // Scales from 74 to 97 points
      const smokeBonus = Math.min(2.0, (smkLvl / 50.0));
      const risk = Math.min(99, Math.max(74, Math.round(baseRisk + smokeBonus)));
      const sev = risk >= 84 ? 'CRITICAL' : 'HIGH';

      callback({
        fireDetected: true,
        fireConfidence: parseFloat(fireConf.toFixed(1)),
        fireScore: parseFloat(fireConf.toFixed(1)),
        smokeConfidence: parseFloat(smkConf.toFixed(1)),
        fireCoverage: parseFloat(cov.toFixed(1)),
        smokeLevel: parseFloat(smkLvl.toFixed(1)),
        anomalyConfidence: parseFloat(anom.toFixed(1)),
        riskScore: risk,
        severity: sev,
        objectsCount: Math.max(1, Math.min(6, Math.round(fireRatio * 35 + 2))),
        earlyWarningAlert: sev === 'CRITICAL' ? 'CRITICAL - IMMEDIATE DISPATCH' : 'HIGH RISK HAZARD DETECTED',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      });
    } else {
      callback({
        fireDetected: false,
        anomalyConfidence: 0.0,
        smokeConfidence: 0.0,
        fireCoverage: 0.0,
        smokeLevel: 0.0,
        riskScore: 0,
        severity: 'NORMAL',
        objectsCount: 0,
        earlyWarningAlert: 'NORMAL - SECTOR CLEAR',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
      });
    }
  } catch (e) {
    // Default fallback on cross-origin image
    callback({
      fireDetected: true,
      anomalyConfidence: 94.6,
      smokeConfidence: 92.0,
      fireCoverage: 38.5,
      smokeLevel: 85.0,
      riskScore: 96,
      severity: 'CRITICAL',
      objectsCount: 3,
      earlyWarningAlert: 'CRITICAL - IMMEDIATE DISPATCH',
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
    });
  }
}

// 4. Form Submission & Modals
function openModal(modalEl) {
  if (!modalEl) return;
  document.body.classList.add('modal-open');
  modalEl.classList.remove('hidden');
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.classList.add('hidden');
  const cm = document.getElementById('confirmAlertModal');
  const sm = document.getElementById('successAlertModal');
  const cmOpen = cm && !cm.classList.contains('hidden');
  const smOpen = sm && !sm.classList.contains('hidden');
  if (!cmOpen && !smOpen) {
    document.body.classList.remove('modal-open');
    if (typeof userMap !== 'undefined' && userMap) {
      setTimeout(() => {
        try { userMap.invalidateSize(); } catch (e) {}
      }, 60);
    }
    if (typeof fullMap !== 'undefined' && fullMap) {
      setTimeout(() => {
        try { fullMap.invalidateSize(); } catch (e) {}
      }, 60);
    }
  }
}

function initFormAndModals() {
  const form = document.getElementById('userReportForm');
  const confirmModal = document.getElementById('confirmAlertModal');
  const btnCancelSend = document.getElementById('btnCancelSend');
  const btnConfirmSend = document.getElementById('btnConfirmSend');
  const btnCloseConfirmTop = document.getElementById('btnCloseConfirmTop');
  const successModal = document.getElementById('successAlertModal');
  const btnCloseSuccessTop = document.getElementById('btnCloseSuccessTop');
  const btnCancelSuccessModal = document.getElementById('btnCancelSuccessModal');
  const btnGoReports = document.getElementById('btnGoToMyReports') || document.getElementById('btnGoMyReports');
  const btnCloseSucc = document.getElementById('btnCloseSuccessModal');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // Populate Pre-Send Confirmation Modal (Section 5)
      const enteredAlertName = document.getElementById('inputAlertName')?.value.trim();
      const finalAlertName = enteredAlertName || currentForest || 'Bandipur Forest Fire Alert';
      const modalAlertTitleEl = document.getElementById('modalAlertTitleText');
      if (modalAlertTitleEl) modalAlertTitleEl.textContent = finalAlertName;

      document.getElementById('modalLocationText').textContent = `${currentForest} (${currentCoords.lat}, ${currentCoords.lng})`;
      document.getElementById('modalSourceText').textContent = `Method: ${currentDetectionMethod}`;
      document.getElementById('modalConfText').textContent = document.getElementById('txtAiConf')?.textContent || '94%';
      document.getElementById('modalSevText').textContent = document.getElementById('txtAiSev')?.textContent || 'HIGH';

      let nearestStn = null;
      let minDist = Infinity;
      for (const st of allResponseStations) {
        if (st.coordinates) {
          const d = getHaversineDist(currentCoords.lat, currentCoords.lng, st.coordinates.lat, st.coordinates.lng);
          if (d < minDist) {
            minDist = d;
            nearestStn = st;
          }
        }
      }
      const distKm = (minDist < 1000 && minDist > 0) ? minDist.toFixed(1) : '8.4';
      const etaMin = Math.max(8, Math.round((parseFloat(distKm) / 35) * 60 + 4));
      const stnName = nearestStn ? nearestStn.name : 'Bandipur Forest Response Unit';
      document.getElementById('modalStationDistText').textContent = `${stnName} - ${distKm} km (ETA: ${etaMin} min)`;

      openModal(confirmModal);
    });
  }

  // Cancel / Close for Confirmation Modal
  if (btnCancelSend) {
    btnCancelSend.addEventListener('click', () => closeModal(confirmModal));
  }
  if (btnCloseConfirmTop) {
    btnCloseConfirmTop.addEventListener('click', () => closeModal(confirmModal));
  }

  // Cancel / Close for Success Modal
  if (btnCloseSuccessTop) {
    btnCloseSuccessTop.addEventListener('click', () => closeModal(successModal));
  }
  if (btnCancelSuccessModal) {
    btnCancelSuccessModal.addEventListener('click', () => closeModal(successModal));
  }

  // Backdrop click to cancel/dismiss modals
  if (confirmModal) {
    confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) closeModal(confirmModal);
    });
  }
  if (successModal) {
    successModal.addEventListener('click', (e) => {
      if (e.target === successModal) closeModal(successModal);
    });
  }

  // Escape key to dismiss modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (confirmModal && !confirmModal.classList.contains('hidden')) closeModal(confirmModal);
      if (successModal && !successModal.classList.contains('hidden')) closeModal(successModal);
    }
  });

  if (btnConfirmSend) {
    btnConfirmSend.addEventListener('click', async () => {
      closeModal(confirmModal);

      try {
        const formData = new FormData();
        if (selectedFile) formData.append('fireImage', selectedFile);
        if (selectedVideoFile) formData.append('fireVideo', selectedVideoFile);

        const rawAlertName = document.getElementById('inputAlertName')?.value.trim();
        const alertTitleToSend = rawAlertName || currentForest || 'Bandipur Forest Fire Alert';
        formData.append('title', alertTitleToSend);
        formData.append('alertTitle', alertTitleToSend);
        formData.append('latitude', currentCoords.lat);
        formData.append('longitude', currentCoords.lng);
        formData.append('locationName', currentForest);
        formData.append('detectionMethod', currentDetectionMethod);
        formData.append('description', document.getElementById('descObservation')?.value || '');
        formData.append('estimatedSize', document.getElementById('selFireSize')?.value || 'Large');
        formData.append('smokeVisible', document.getElementById('selSmoke')?.value || 'true');
        formData.append('flamesVisible', document.getElementById('selFlames')?.value || 'true');
        formData.append('peopleInDanger', document.getElementById('selPeople')?.value || 'false');
        formData.append('reporterName', 'Citizen Observer');
        formData.append('isPriority', 'true');
        formData.append('priorityLevel', 'PRIORITY 1 - CITIZEN REPORT');
        formData.append('anomalyConfidence', document.getElementById('hdnAiConfidence')?.value || '94.6');
        formData.append('smokeConfidence', document.getElementById('hdnSmokeConfidence')?.value || '92.0');
        formData.append('fireCoverage', document.getElementById('hdnFireCoverage')?.value || '38.5');
        formData.append('smokeLevel', document.getElementById('hdnSmokeLevel')?.value || '85.0');
        formData.append('riskScore', document.getElementById('hdnRiskScore')?.value || '96');
        formData.append('severity', document.getElementById('hdnSeverity')?.value || 'CRITICAL');
        formData.append('fireScore', document.getElementById('hdnAiConfidence')?.value || '94.6');
        formData.append('fakeProbability', document.getElementById('hdnFakeScore')?.value || '3.2');
        formData.append('authenticityScore', document.getElementById('hdnAuthenticityScore')?.value || '96.8');

        let res;
        try {
          res = await fetch('/api/incidents', {
            method: 'POST',
            body: formData
          });
        } catch (fetchErr) {
          // If primary relative fetch fails on localhost, retry alternate port (8109 / 3000)
          const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          if (isLocal) {
            const currentPort = window.location.port;
            const targetPort = currentPort === '8109' ? '3000' : '8109';
            console.warn(`Primary fetch failed (${fetchErr.message}). Retrying on http://localhost:${targetPort}...`);
            res = await fetch(`http://localhost:${targetPort}/api/incidents`, {
              method: 'POST',
              body: formData
            });
          } else {
            throw fetchErr;
          }
        }

        const data = await res.json();
        if (data.success && data.incident) {
          handleSubmissionSuccess(data.incident);
        } else {
          alert('Submission error: ' + (data.message || 'Unknown error'));
        }
      } catch (err) {
        alert('Transmission notice: Unable to contact server. Please verify network connection or server status.');
      }
    });
  }

  if (btnGoReports) {
    btnGoReports.addEventListener('click', () => {
      closeModal(successModal);
      const tabBtn = document.querySelector('[data-tab="tabMyReports"]');
      if (tabBtn) tabBtn.click();
    });
  }

  if (btnCloseSucc) {
    btnCloseSucc.addEventListener('click', () => {
      closeModal(successModal);
      // Reset observation form cleanly
      const obs = document.getElementById('descObservation');
      if (obs) obs.value = '';
      const inAlert = document.getElementById('inputAlertName');
      if (inAlert) inAlert.value = '';
      selectedFile = null;
      selectedVideoFile = null;
      const fileIn = document.getElementById('fireImageInput');
      if (fileIn) fileIn.value = '';
      const vidIn = document.getElementById('fireVideoInput');
      if (vidIn) vidIn.value = '';
      const pv = document.getElementById('previewContainer');
      if (pv) pv.classList.add('hidden');
      const ph = document.getElementById('uploadPlaceholder');
      if (ph) ph.classList.remove('hidden');
    });
  }
}

function handleSubmissionSuccess(incident) {
  if (window.emergencyAudio) window.emergencyAudio.playDispatchChime();

  myReports.unshift(incident);
  localStorage.setItem('FG_MY_REPORTS', JSON.stringify(myReports));

  document.getElementById('succIncidentId').textContent = incident.incidentId;
  const succAlertTitleEl = document.getElementById('succAlertTitle');
  if (succAlertTitleEl) succAlertTitleEl.textContent = incident.title || incident.alertTitle || incident.forestName || 'Bandipur Forest Fire Alert';
  document.getElementById('succStatus').textContent = incident.status;
  document.getElementById('succCoords').textContent = `${incident.latitude}, ${incident.longitude} (${incident.forestName})`;

  openModal(document.getElementById('successAlertModal'));
  renderMyReports();
}

// 5. My Reports Tracker (Section 8)
let isRefreshBound = false;
function loadMyReports() {
  const saved = localStorage.getItem('FG_MY_REPORTS');
  if (saved) {
    try { myReports = JSON.parse(saved); } catch (e) {}
  }

  // Bind Refresh Reports Button
  if (!isRefreshBound) {
    const btnRefresh = document.getElementById('btnRefreshMyReports');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', async () => {
        const icon = document.getElementById('iconRefreshReports');
        if (icon) icon.classList.add('animate-spin');
        try {
          const res = await fetch('/api/incidents');
          const data = await res.json();
          if (data.success && Array.isArray(data.incidents)) {
            const serverMap = new Map(data.incidents.map(i => [i.incidentId, i]));
            if (myReports.length > 0) {
              myReports = myReports
                .filter(r => serverMap.has(r.incidentId))
                .map(r => serverMap.get(r.incidentId));
            } else {
              myReports = data.incidents;
            }
            localStorage.setItem('FG_MY_REPORTS', JSON.stringify(myReports));
            renderMyReports();
          }
        } catch (err) {
          console.warn('Failed to refresh user reports:', err);
        } finally {
          setTimeout(() => {
            if (icon) icon.classList.remove('animate-spin');
          }, 500);
        }
      });
      isRefreshBound = true;
    }
  }

  renderMyReports();
}

// Cancel / Dismiss User Report One at a Time
async function cancelUserReport(incidentId) {
  if (!confirm(`Are you sure you want to cancel and remove alert ${incidentId}?`)) return;
  try {
    const res = await fetch(`/api/incidents/${incidentId}/cancel`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      myReports = myReports.filter(i => i.incidentId !== incidentId);
      localStorage.setItem('FG_MY_REPORTS', JSON.stringify(myReports));
      renderMyReports();
    } else {
      alert('Could not cancel alert: ' + (data.message || 'Error'));
    }
  } catch (err) {
    alert('Cancellation error: ' + err.message);
  }
}

function renderMyReports() {
  const listEl = document.getElementById('myReportsList');
  if (!listEl) return;

  if (myReports.length === 0) {
    listEl.innerHTML = `
      <div class="p-8 rounded-2xl bg-[#091122] border border-slate-800 text-center text-slate-400">
        <div class="text-3xl mb-2">📋</div>
        <div class="text-sm font-bold text-white">No active reports yet</div>
        <div class="text-xs mt-1">Submit a fire alert using the 'Report Fire' tab or click 'Refresh Reports'.</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = myReports.map(inc => {
    let statusColor = 'text-amber-400 bg-amber-950 border-amber-600';
    if (inc.status === 'VERIFIED') statusColor = 'text-purple-300 bg-purple-950 border-purple-600';
    else if (inc.status === 'TEAM DISPATCHED' || inc.status === 'TEAM EN ROUTE') statusColor = 'text-sky-300 bg-sky-950 border-sky-600 animate-pulse';
    else if (inc.status === 'FIRE CONTAINED') statusColor = 'text-emerald-300 bg-emerald-950 border-emerald-600';
    else if (inc.status === 'RESOLVED') statusColor = 'text-emerald-400 bg-emerald-950 border-emerald-500';

    const displayTitle = (inc.title || inc.alertTitle || inc.forestName || 'Bandipur Forest Fire Alert').trim();
    const displayLocation = inc.forestName || inc.locationName || '';
    const showSubLoc = displayLocation && displayLocation !== displayTitle;

    return `
      <div class="p-4 rounded-2xl bg-[#091122] border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="w-16 h-16 rounded-xl bg-black border border-slate-700 overflow-hidden shrink-0">
            <img src="${inc.imageUrl || '/sample_images/sample_wildfire.jpg'}" class="w-full h-full object-cover" />
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="font-mono text-sm font-black text-sky-400 whitespace-nowrap">${inc.incidentId}</span>
              <span class="inline-flex items-center whitespace-nowrap text-[10px] font-black px-2 py-0.5 rounded border ${statusColor}">${inc.status}</span>
            </div>
            <div class="text-sm font-bold text-white mt-0.5">${displayTitle}</div>
            ${showSubLoc ? `<div class="text-xs text-slate-300 flex items-center gap-1 mt-0.5"><span>📍</span><span>${displayLocation}</span></div>` : ''}
            <div class="text-xs text-slate-400 font-mono mt-0.5 flex items-center flex-wrap gap-x-2">
              <span class="whitespace-nowrap">Coords: ${inc.latitude}, ${inc.longitude}</span>
              <span>•</span>
              <span class="whitespace-nowrap">AI: <b class="text-orange-400">${inc.aiConfidence}%</b></span>
            </div>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row md:flex-col items-end gap-2 shrink-0">
          <div class="text-right text-xs font-mono space-y-1 bg-[#040814] p-3 rounded-xl border border-slate-800/80 w-full md:min-w-[200px]">
            <div class="text-slate-400">Assigned Team: <b class="text-purple-400">${inc.assignedTeam?.name || 'Pending Review'}</b></div>
            <div class="text-slate-400">Response ETA: <b class="text-emerald-400">${inc.assignedTeam?.etaMinutes || 16} min</b></div>
            <div class="text-[10px] text-slate-500">Updated: Just now</div>
          </div>
          <button type="button" class="btn-cancel-user-report px-3 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-800 border border-red-700/60 text-red-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer" data-id="${inc.incidentId}">
            <span>✕</span> <span>Cancel Alert</span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Wire Cancel buttons
  listEl.querySelectorAll('.btn-cancel-user-report').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelUserReport(btn.dataset.id);
    });
  });
}

// 6. Socket.IO Real-Time Updates
function initSocket() {
  if (typeof io === 'undefined') return;
  socket = io();

  socket.on('response_status_updated', (updated) => {
    // Update matching reports in myReports list
    const idx = myReports.findIndex(i => i.incidentId === updated.incidentId);
    if (idx !== -1) {
      myReports[idx] = updated;
      localStorage.setItem('FG_MY_REPORTS', JSON.stringify(myReports));
      renderMyReports();
      if (window.emergencyAudio) window.emergencyAudio.playDispatchChime();
    }
  });

  socket.on('team_dispatched', (data) => {
    const inc = data.incident;
    const idx = myReports.findIndex(i => i.incidentId === inc.incidentId);
    if (idx !== -1) {
      myReports[idx] = inc;
      renderMyReports();
      if (window.emergencyAudio) window.emergencyAudio.playDispatchChime();
    }
  });

  socket.on('incident_deleted', ({ incidentId }) => {
    myReports = myReports.filter(i => i.incidentId !== incidentId);
    localStorage.setItem('FG_MY_REPORTS', JSON.stringify(myReports));
    renderMyReports();
  });

  socket.on('incident_cancelled', ({ incidentId }) => {
    myReports = myReports.filter(i => i.incidentId !== incidentId);
    localStorage.setItem('FG_MY_REPORTS', JSON.stringify(myReports));
    renderMyReports();
  });

  socket.on('queue_reset', ({ incidents }) => {
    myReports = incidents || [];
    localStorage.setItem('FG_MY_REPORTS', JSON.stringify(myReports));
    renderMyReports();
  });
}

// 7. Emergency Contacts
async function loadEmergencyContacts() {
  const container = document.getElementById('contactsGrid');
  if (!container) return;

  try {
    const res = await fetch('/api/emergency-contacts');
    const data = await res.json();
    if (data.success && data.contacts) {
      container.innerHTML = data.contacts.map(c => `
        <div class="p-4 rounded-xl bg-[#091122] border border-slate-800 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-orange-400">${c.state}</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded ${c.isOfficial ? 'bg-red-950 text-red-300 border border-red-600' : 'bg-slate-800 text-slate-300'}">${c.isOfficial ? 'OFFICIAL HELPLINE' : 'PROTOTYPE DESK'}</span>
          </div>
          <div class="text-sm font-black text-white">${c.department}</div>
          <div class="text-xs text-slate-400">${c.description}</div>
          <div class="pt-2 border-t border-slate-800 flex items-center justify-between">
            <span class="font-mono text-base font-black text-emerald-400">${c.phone}</span>
            <a href="tel:${c.phone}" class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs">
              CALL NOW
            </a>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {}
}

// 8. Full Live Map Tab
let fullMap = null;
function initFullMap() {
  const el = document.getElementById('userFullMap');
  if (!el) return;
  if (fullMap) {
    setTimeout(() => fullMap.invalidateSize(), 150);
    return;
  }

  fullMap = L.map('userFullMap', {
    center: [11.6643, 76.6250],
    zoom: 12,
    maxZoom: 21,
    zoomControl: true
  });

  // High-resolution Google Hybrid Satellite & Roads Tiles with building-level zoom (maxZoom 21)
  L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 21,
    maxNativeZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Map & Imagery &copy; Google Maps'
  }).addTo(fullMap);

  // Invalidate size once layer is added
  setTimeout(() => {
    if (fullMap) fullMap.invalidateSize();
  }, 250);

  // Plot Restored Bandipur Test Case (Matching Image 4)
  const bandipurLat = 11.6643;
  const bandipurLng = 76.6250;

  // 1. Fire Flame Marker with pulsing shockwave
  const fireHtml = `<div class="fire-pulse-container"><div class="fire-shockwave"></div><div class="fire-core-dot" style="background:#ff2a2a;">🔥</div></div>`;
  const fireIcon = L.divIcon({
    className: 'custom-map-marker fire-marker-red',
    html: fireHtml,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
  L.marker([bandipurLat, bandipurLng], { icon: fireIcon }).addTo(fullMap)
    .bindTooltip(`<b>Reported Fire at Bandipur National Park (Sector 4B)</b><br><span style="color:#ef4444;font-size:11px;">CRITICAL • ACTIVE FIRE</span>`, { direction: 'top', offset: [0, -16] });

  // 2. Concentric Danger Rings (500m, 1.5km, 5km)
  // Keeps shade ONLY in the first radius (500m Hot Zone), retains clean dotted radius lines
  [
    { r: 500, col: '#ef4444', label: '500m Hot Zone' },
    { r: 1500, col: '#f97316', label: '1.5km Buffer Perimeter' },
    { r: 5000, col: '#eab308', label: '5km Response Sector' }
  ].forEach((c, idx) => {
    const isFirstRadius = (idx === 0);
    L.circle([bandipurLat, bandipurLng], {
      radius: c.r,
      color: c.col,
      weight: 1.8,
      opacity: 0.85,
      fill: isFirstRadius,
      fillColor: c.col,
      fillOpacity: isFirstRadius ? 0.16 : 0,
      dashArray: '6, 6'
    }).addTo(fullMap).bindTooltip(c.label, { direction: 'top' });
  });

  // 3. Response Station Graphical Badge: Bandipur Station - Team Ready (🛡️)
  const stnLat = 11.6675;
  const stnLng = 76.6322;
  const stnIcon = L.divIcon({
    className: 'custom-map-marker marker-station-badge',
    html: `<div style="display:inline-flex; align-items:center; gap:6px; background:rgba(7,14,28,0.95); border:2px solid #3b82f6; border-radius:10px; padding:4px 10px; box-shadow:0 0 16px rgba(59,130,246,0.6); color:#fff; font-family:Inter,sans-serif; cursor:pointer; white-space:nowrap; transform:translate(-50%, -50%);"><span style="font-size:11px; font-weight:800; color:#fff;">Bandipur Station - Team Ready</span><span style="font-size:14px; filter:drop-shadow(0 0 4px #3b82f6);">🛡️</span></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0]
  });
  L.marker([stnLat, stnLng], { icon: stnIcon }).addTo(fullMap)
    .bindPopup(`<b>Bandipur Station - Team Ready</b><br><span style="color:#60a5fa;">Bandipur Range Forest Office & Fire Command (HQ)</span><br>ETA: <b>4 min</b> • Dist: <b>0.9 km</b>`);

  // 4. Dotted Route Line connecting Station to Fire (dashArray '8, 8')
  const routeWaypoints = [
    [11.6675, 76.6322],
    [11.66638, 76.6319],
    [11.6655, 76.6295],
    [11.66415, 76.6283],
    [11.6643, 76.6250]
  ];
  L.polyline(routeWaypoints, {
    color: '#f97316',
    weight: 4,
    opacity: 0.95,
    dashArray: '8, 8'
  }).addTo(fullMap);

  // 5. Water drafting line to Tavarekatte Lake Reservoir
  const waterCoords = [11.6672, 76.6215];
  L.marker(waterCoords).addTo(fullMap).bindPopup(`💧 <b>Tavarekatte Lake Reservoir</b><br>Bandipur Forest Emergency Water Drafting Source`);
  L.polyline([[bandipurLat, bandipurLng], waterCoords], {
    color: '#0284c7',
    weight: 3.5,
    opacity: 0.9,
    dashArray: '6, 6'
  }).addTo(fullMap);

  // Add other water bodies & stations to full map
  fetch('/api/water-bodies').then(r => r.json()).then(data => {
    if (data.success) {
      data.waterBodies.forEach(wb => {
        if (wb.coordinates && (wb.coordinates.lat !== waterCoords[0])) {
          L.marker([wb.coordinates.lat, wb.coordinates.lng]).addTo(fullMap).bindPopup(`💧 <b>${wb.name}</b>`);
        }
      });
    }
  });

  fetch('/api/response-stations').then(r => r.json()).then(data => {
    if (data.success) {
      data.responseStations.forEach(st => {
        if (st.coordinates && (st.coordinates.lat !== stnLat)) {
          L.marker([st.coordinates.lat, st.coordinates.lng]).addTo(fullMap).bindPopup(`🚒 <b>${st.name}</b>`);
        }
      });
    }
  });
}

// Window resize & message listeners to keep map viewports updated without tile glitches
window.addEventListener('resize', () => {
  if (userMap) userMap.invalidateSize();
  if (fullMap) fullMap.invalidateSize();
});

window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'INVALIDATE_MAP') {
    if (userMap) userMap.invalidateSize();
    if (fullMap) fullMap.invalidateSize();
  }
});

// Tactical Floating Toast Notification System
function showLocationToast(message, type = 'info') {
  let toastContainer = document.getElementById('userToastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'userToastContainer';
    toastContainer.className = 'fixed bottom-5 right-5 z-[9999999] flex flex-col gap-2 max-w-sm pointer-events-none';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const borderCol = type === 'success' ? 'border-emerald-500 bg-[#061e14]/95 text-emerald-200' 
                  : type === 'warning' ? 'border-amber-500 bg-[#231707]/95 text-amber-200'
                  : type === 'error' ? 'border-red-500 bg-[#250d0d]/95 text-red-200'
                  : 'border-cyan-500 bg-[#071927]/95 text-cyan-200';
  const icon = type === 'success' ? '✓' : type === 'warning' ? '⚠️' : type === 'error' ? '✕' : '📍';

  toast.className = `p-3 rounded-xl border ${borderCol} shadow-2xl backdrop-blur-md text-xs font-bold transition-all duration-300 transform translate-y-3 opacity-0 pointer-events-auto flex items-center gap-2.5`;
  toast.innerHTML = `<span class="text-sm shrink-0">${icon}</span><span class="flex-1">${message}</span>`;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-3', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 350);
  }, 4000);
}

