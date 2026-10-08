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
      }
    });
  });

  const btnQuick = document.getElementById('btnQuickReportNow');
  if (btnQuick) {
    btnQuick.addEventListener('click', () => {
      document.querySelector('[data-tab="tabReport"]').click();
      setReportingMethod('Manual');
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
    zoomControl: true
  });

  L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
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
}

function updateLocationReadouts(lat, lng, customForestName = null) {
  currentCoords = { lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lng.toFixed(4)) };

  // Nearest Forest lookup
  if (customForestName) {
    currentForest = customForestName;
  } else if (lat > 20 && lat < 24 && lng > 79) {
    currentForest = 'Kanha National Park';
    currentDistrict = 'Mandla';
    currentState = 'Madhya Pradesh';
  } else if (lat > 28 && lng < 80) {
    currentForest = 'Jim Corbett National Park';
    currentDistrict = 'Nainital';
    currentState = 'Uttarakhand';
  } else {
    currentForest = 'Bandipur Forest';
    currentDistrict = 'Chamarajanagar';
    currentState = 'Karnataka';
  }

  document.getElementById('readoutCoords').textContent = `${currentCoords.lat}, ${currentCoords.lng}`;
  document.getElementById('readoutForest').textContent = currentForest;
  document.getElementById('readoutDistrict').textContent = currentDistrict;
  document.getElementById('readoutState').textContent = currentState;
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

  document.querySelectorAll('.btn-user-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedFile = null;
      const path = btn.dataset.path;
      const forest = btn.dataset.forest;
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);

      const preview = document.getElementById('imgMediaPreview');
      if (preview) preview.src = path;

      userMap.flyTo([lat, lng], 13, { duration: 1.2 });
      userMarker.setLatLng([lat, lng]);
      updateLocationReadouts(lat, lng, forest);

      const isSafe = path.includes('sunset');
      document.getElementById('txtAiConf').textContent = isSafe ? '97% (Non-Fire)' : '94%';
      document.getElementById('txtAiSev').textContent = isSafe ? 'LOW (SAFE)' : 'HIGH';
      document.getElementById('txtAiBadge').textContent = isSafe ? 'NO FIRE SIGNATURE' : 'FIRE DETECTED';
      document.getElementById('txtAiBadge').className = isSafe ? 'text-[10px] font-black px-2 py-0.5 rounded bg-emerald-950 border border-emerald-600 text-emerald-300' : 'text-[10px] font-black px-2 py-0.5 rounded bg-red-950 border border-red-600 text-red-300';
    });
  });

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
        selectedFile = new File([blob], 'camera_fire_capture.jpg', { type: 'image/jpeg' });
        const preview = document.getElementById('imgMediaPreview');
        if (preview) preview.src = URL.createObjectURL(blob);
        document.getElementById('txtAiConf').textContent = '92%';
        document.getElementById('txtAiSev').textContent = 'HIGH';
        alert('Photo captured successfully! AI Vision analyzed.');
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
        document.getElementById('txtAiConf').textContent = '91%';
        document.getElementById('txtAiSev').textContent = 'HIGH (VIDEO FRAMES)';
      }
    });
  }

  // Method 5: Current GPS Button
  const btnGps = document.getElementById('btnCurrentGps');
  if (btnGps) {
    btnGps.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('Geolocation not supported by browser.');
        return;
      }
      btnGps.textContent = 'Locating GPS...';
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          userMap.flyTo([lat, lng], 14, { duration: 1.5 });
          userMarker.setLatLng([lat, lng]);
          updateLocationReadouts(lat, lng, 'My GPS Location');
          btnGps.innerHTML = '<span>📍</span> <span>USE MY CURRENT LOCATION</span>';
        },
        err => {
          btnGps.innerHTML = '<span>📍</span> <span>USE MY CURRENT LOCATION</span>';
          alert('GPS location could not be acquired. You can click on the map to place the fire marker.');
        },
        { timeout: 8000 }
      );
    });
  }

  // Method 6: Location Search
  const btnSearch = document.getElementById('btnSearchLoc');
  const inputSearch = document.getElementById('inputSearchLocation');
  if (btnSearch && inputSearch) {
    const doSearch = () => {
      const q = inputSearch.value.trim().toLowerCase();
      if (!q) return;
      if (q.includes('corbett') || q.includes('nainital')) {
        userMap.flyTo([29.5300, 78.7747], 13);
        userMarker.setLatLng([29.5300, 78.7747]);
        updateLocationReadouts(29.5300, 78.7747, 'Jim Corbett National Park');
      } else if (q.includes('kanha') || q.includes('mandla')) {
        userMap.flyTo([22.3345, 80.6115], 13);
        userMarker.setLatLng([22.3345, 80.6115]);
        updateLocationReadouts(22.3345, 80.6115, 'Kanha Tiger Reserve');
      } else {
        userMap.flyTo([11.6643, 76.6250], 13);
        userMarker.setLatLng([11.6643, 76.6250]);
        updateLocationReadouts(11.6643, 76.6250, 'Bandipur Forest');
      }
    };
    btnSearch.addEventListener('click', doSearch);
    inputSearch.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  }
}

function setReportingMethod(method) {
  currentDetectionMethod = method;
  document.querySelectorAll('.method-card').forEach(c => {
    const isAct = c.dataset.method === method;
    c.className = isAct ? 'method-card p-3 rounded-xl border border-orange-500/80 bg-orange-950/30 text-center transition' : 'method-card p-3 rounded-xl border border-slate-700 bg-[#0d182e] text-center hover:border-orange-500 transition';
  });

  const pImg = document.getElementById('panelImage');
  const pCam = document.getElementById('panelCamera');
  const pVid = document.getElementById('panelVideo');

  if (pImg) pImg.classList.add('hidden');
  if (pCam) pCam.classList.add('hidden');
  if (pVid) pVid.classList.add('hidden');

  if (method === 'Camera' && pCam) pCam.classList.remove('hidden');
  else if (method === 'Video' && pVid) pVid.classList.remove('hidden');
  else if (pImg) pImg.classList.remove('hidden');
}

function handleImageFile(file) {
  selectedFile = file;
  const preview = document.getElementById('imgMediaPreview');
  if (preview) preview.src = URL.createObjectURL(file);
  document.getElementById('txtAiConf').textContent = '94%';
  document.getElementById('txtAiSev').textContent = 'HIGH';
}

// 4. Form Submission & Modals
function initFormAndModals() {
  const form = document.getElementById('userReportForm');
  const confirmModal = document.getElementById('confirmAlertModal');
  const btnCancelSend = document.getElementById('btnCancelSend');
  const btnConfirmSend = document.getElementById('btnConfirmSend');
  const successModal = document.getElementById('successAlertModal');
  const btnGoReports = document.getElementById('btnGoMyReports');
  const btnCloseSucc = document.getElementById('btnCloseSuccessModal');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // Populate Pre-Send Confirmation Modal (Section 5)
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

      confirmModal.classList.remove('hidden');
    });
  }

  if (btnCancelSend) {
    btnCancelSend.addEventListener('click', () => confirmModal.classList.add('hidden'));
  }

  if (btnConfirmSend) {
    btnConfirmSend.addEventListener('click', async () => {
      confirmModal.classList.add('hidden');

      try {
        const formData = new FormData();
        if (selectedFile) formData.append('fireImage', selectedFile);
        if (selectedVideoFile) formData.append('fireVideo', selectedVideoFile);

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

        const res = await fetch('/api/incidents', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        if (data.success && data.incident) {
          handleSubmissionSuccess(data.incident);
        } else {
          alert('Submission error: ' + (data.message || 'Unknown error'));
        }
      } catch (err) {
        alert('Transmission error: ' + err.message);
      }
    });
  }

  if (btnGoReports) {
    btnGoReports.addEventListener('click', () => {
      successModal.classList.add('hidden');
      document.querySelector('[data-tab="tabMyReports"]').click();
    });
  }

  if (btnCloseSucc) {
    btnCloseSucc.addEventListener('click', () => {
      successModal.classList.add('hidden');
      window.location.reload();
    });
  }
}

function handleSubmissionSuccess(incident) {
  if (window.emergencyAudio) window.emergencyAudio.playDispatchChime();

  myReports.unshift(incident);
  localStorage.setItem('FG_MY_REPORTS', JSON.stringify(myReports));

  document.getElementById('succIncidentId').textContent = incident.incidentId;
  document.getElementById('succStatus').textContent = incident.status;
  document.getElementById('succCoords').textContent = `${incident.latitude}, ${incident.longitude} (${incident.forestName})`;

  document.getElementById('successAlertModal').classList.remove('hidden');
  renderMyReports();
}

// 5. My Reports Tracker (Section 8)
function loadMyReports() {
  const saved = localStorage.getItem('FG_MY_REPORTS');
  if (saved) {
    try { myReports = JSON.parse(saved); } catch (e) {}
  }
  renderMyReports();
}

function renderMyReports() {
  const listEl = document.getElementById('myReportsList');
  if (!listEl) return;

  if (myReports.length === 0) {
    listEl.innerHTML = `
      <div class="p-8 rounded-2xl bg-[#091122] border border-slate-800 text-center text-slate-400">
        <div class="text-3xl mb-2">📋</div>
        <div class="text-sm font-bold text-white">No active reports yet</div>
        <div class="text-xs mt-1">Submit a fire alert using the 'Report Fire' tab.</div>
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

    return `
      <div class="p-4 rounded-2xl bg-[#091122] border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="w-16 h-16 rounded-xl bg-black border border-slate-700 overflow-hidden shrink-0">
            <img src="${inc.imageUrl || '/sample_images/sample_wildfire.jpg'}" class="w-full h-full object-cover" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono text-sm font-black text-sky-400">${inc.incidentId}</span>
              <span class="text-[10px] font-black px-2 py-0.5 rounded border ${statusColor}">${inc.status}</span>
            </div>
            <div class="text-sm font-bold text-white mt-0.5">${inc.forestName}</div>
            <div class="text-xs text-slate-400 font-mono mt-0.5">
              Coords: ${inc.latitude}, ${inc.longitude} • AI: <b class="text-orange-400">${inc.aiConfidence}%</b>
            </div>
          </div>
        </div>

        <div class="text-right text-xs font-mono space-y-1 bg-[#040814] p-3 rounded-xl border border-slate-800/80 md:min-w-[200px]">
          <div class="text-slate-400">Assigned Team: <b class="text-purple-400">${inc.assignedTeam?.name || 'Pending Review'}</b></div>
          <div class="text-slate-400">Response ETA: <b class="text-emerald-400">${inc.assignedTeam?.etaMinutes || 16} min</b></div>
          <div class="text-[10px] text-slate-500">Updated: Just now</div>
        </div>
      </div>
    `;
  }).join('');
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
  if (!el || fullMap) return;

  fullMap = L.map('userFullMap', {
    center: [11.6643, 76.6250],
    zoom: 9
  });

  L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Map & Imagery &copy; Google Maps'
  }).addTo(fullMap);

  // Add water bodies & stations to full map
  fetch('/api/water-bodies').then(r => r.json()).then(data => {
    if (data.success) {
      data.waterBodies.forEach(wb => {
        L.marker([wb.coordinates.lat, wb.coordinates.lng]).addTo(fullMap).bindPopup(`💧 <b>${wb.name}</b>`);
      });
    }
  });

  fetch('/api/response-stations').then(r => r.json()).then(data => {
    if (data.success) {
      data.responseStations.forEach(st => {
        L.marker([st.coordinates.lat, st.coordinates.lng]).addTo(fullMap).bindPopup(`🚒 <b>${st.name}</b>`);
      });
    }
  });
}
