/**
 * ForestGuard AI Citizen Report Page Application
 */

let reportMap = null;
let reportMarker = null;
let selectedFile = null;
let selectedPresetPath = null;
let currentCoords = { lat: 11.6643, lng: 76.6250 };
let currentForestName = 'Bandipur Tiger Reserve & National Park';
let socket = null;
let trackingIncidentId = null;

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initUpload();
  initPresets();
  initForm();
  initSocket();
});

function initMap() {
  const mapEl = document.getElementById('reportMap');
  if (!mapEl) return;

  reportMap = L.map('reportMap', {
    center: [currentCoords.lat, currentCoords.lng],
    zoom: 12,
    zoomControl: true
  });

  // High-res Google Hybrid satellite tiles
  L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Map & Imagery &copy; Google Maps'
  }).addTo(reportMap);

  const pinIcon = L.divIcon({
    className: 'custom-report-pin',
    html: `<div style="font-size:32px; filter:drop-shadow(0 0 10px #ef4444); cursor:pointer; transform:translate(-8px, -24px);">📍</div>`,
    iconSize: [32, 32]
  });

  reportMarker = L.marker([currentCoords.lat, currentCoords.lng], {
    draggable: true,
    icon: pinIcon
  }).addTo(reportMap);

  reportMarker.on('dragend', (e) => {
    const pos = reportMarker.getLatLng();
    setCoordinates(pos.lat, pos.lng);
  });

  reportMap.on('click', (e) => {
    reportMarker.setLatLng(e.latlng);
    setCoordinates(e.latlng.lat, e.latlng.lng);
  });

  // Quick forest selector
  const selectQuick = document.getElementById('forestSelectQuick');
  if (selectQuick) {
    selectQuick.addEventListener('change', () => {
      const parts = selectQuick.value.split(',');
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      const name = parts[2] || 'Selected Forest';
      currentForestName = name;
      reportMap.flyTo([lat, lng], 13, { duration: 1.5 });
      reportMarker.setLatLng([lat, lng]);
      setCoordinates(lat, lng, name);
    });
  }

  // Use GPS button
  const btnGps = document.getElementById('btnUseGps');
  if (btnGps) {
    btnGps.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('Geolocation not supported by your browser.');
        return;
      }
      btnGps.textContent = 'Locating...';
      navigator.geolocation.getCurrentPosition(
        pos => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          reportMap.flyTo([lat, lng], 14, { duration: 1.5 });
          reportMarker.setLatLng([lat, lng]);
          setCoordinates(lat, lng, 'My GPS Location');
          btnGps.innerHTML = '<span>📍</span> <span>Use GPS Location</span>';
        },
        err => {
          btnGps.innerHTML = '<span>📍</span> <span>Use GPS Location</span>';
          alert('GPS location could not be acquired. You can click on the map to place the fire marker.');
        },
        { timeout: 8000 }
      );
    });
  }
}

function setCoordinates(lat, lng, forestName = null) {
  currentCoords = { lat: parseFloat(lat.toFixed(4)), lng: parseFloat(lng.toFixed(4)) };
  const txtCoords = document.getElementById('txtCoords');
  const txtLoc = document.getElementById('txtLocationName');

  if (txtCoords) txtCoords.textContent = `${currentCoords.lat}, ${currentCoords.lng}`;
  if (forestName) {
    currentForestName = forestName;
    if (txtLoc) txtLoc.textContent = forestName;
  }
}

function initUpload() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const previewWrapper = document.getElementById('previewWrapper');
  const previewImage = document.getElementById('previewImage');
  const previewFileName = document.getElementById('previewFileName');
  const btnRemove = document.getElementById('btnRemoveImage');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('border-orange-500', 'bg-orange-950/20');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-orange-500', 'bg-orange-950/20');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('border-orange-500', 'bg-orange-950/20');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImage(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImage(e.target.files[0]);
    }
  });

  if (btnRemove) {
    btnRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFile = null;
      selectedPresetPath = null;
      fileInput.value = '';
      if (previewWrapper) previewWrapper.classList.add('hidden');
      if (dropzone) dropzone.classList.remove('hidden');
    });
  }
}

function handleImage(file) {
  selectedFile = file;
  selectedPresetPath = null;

  const dropzone = document.getElementById('dropzone');
  const previewWrapper = document.getElementById('previewWrapper');
  const previewImage = document.getElementById('previewImage');
  const previewFileName = document.getElementById('previewFileName');

  const reader = new FileReader();
  reader.onload = (e) => {
    if (previewImage) previewImage.src = e.target.result;
    if (previewFileName) previewFileName.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    if (dropzone) dropzone.classList.add('hidden');
    if (previewWrapper) previewWrapper.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function initPresets() {
  document.querySelectorAll('.btn-preset-img').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedFile = null;
      selectedPresetPath = btn.dataset.path;

      const dropzone = document.getElementById('dropzone');
      const previewWrapper = document.getElementById('previewWrapper');
      const previewImage = document.getElementById('previewImage');
      const previewFileName = document.getElementById('previewFileName');

      if (previewImage) previewImage.src = btn.dataset.path;
      if (previewFileName) previewFileName.textContent = `Preset: ${btn.dataset.forest}`;
      if (dropzone) dropzone.classList.add('hidden');
      if (previewWrapper) previewWrapper.classList.remove('hidden');

      // Update Map Position
      const lat = parseFloat(btn.dataset.lat);
      const lng = parseFloat(btn.dataset.lng);
      const forest = btn.dataset.forest;

      reportMap.flyTo([lat, lng], 13, { duration: 1.2 });
      reportMarker.setLatLng([lat, lng]);
      setCoordinates(lat, lng, forest);
    });
  });
}

function initForm() {
  const form = document.getElementById('fireSubmitForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedFile && !selectedPresetPath) {
      alert('⚠️ Please upload a fire photograph or select one of the test scenarios.');
      return;
    }

    const modal = document.getElementById('loadingModal');
    const statusText = document.getElementById('loadingStatusText');
    if (modal) modal.classList.remove('hidden');

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('fireImage', selectedFile);
      } else if (selectedPresetPath) {
        formData.append('presetImage', selectedPresetPath);
      }

      formData.append('latitude', currentCoords.lat);
      formData.append('longitude', currentCoords.lng);
      formData.append('forestName', currentForestName);
      formData.append('description', document.getElementById('inputDescription')?.value || '');
      formData.append('reporterName', document.getElementById('inputReporterName')?.value || 'Citizen Reporter');
      formData.append('reporterPhone', document.getElementById('inputReporterPhone')?.value || 'Undisclosed');
      formData.append('source', 'Citizen Photo');

      if (statusText) statusText.textContent = 'Executing ForestGuard AI Vision Segmentation...';

      let res;
      try {
        res = await fetch('/api/incidents', {
          method: 'POST',
          body: formData
        });
      } catch (fetchErr) {
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal) {
          const targetPort = window.location.port === '8119' ? '3000' : '8119';
          res = await fetch(`http://localhost:${targetPort}/api/incidents`, {
            method: 'POST',
            body: formData
          });
        } else {
          throw fetchErr;
        }
      }

      const data = await res.json();

      if (statusText) statusText.textContent = 'Broadcasting to Live Admin Command Center via Socket.IO...';

      setTimeout(() => {
        if (modal) modal.classList.add('hidden');
        if (data.success && data.incident) {
          showConfirmation(data.incident);
        } else {
          alert('Submission error: ' + (data.message || 'Unknown error'));
        }
      }, 700);

    } catch (err) {
      if (modal) modal.classList.add('hidden');
      alert('Error submitting report: ' + err.message);
    }
  });
}

function showConfirmation(incident) {
  trackingIncidentId = incident.incidentId;

  if (window.emergencyAudio) {
    window.emergencyAudio.playDispatchChime();
  }

  const formSection = document.getElementById('reportFormContainer');
  const confSection = document.getElementById('confirmationCard');

  if (formSection) formSection.classList.add('hidden');
  if (confSection) {
    confSection.classList.remove('hidden');

    document.getElementById('confIncidentId').textContent = incident.incidentId;
    document.getElementById('confStatus').textContent = incident.status;
    document.getElementById('confAiConfidence').textContent = `${incident.aiConfidence}%`;
    document.getElementById('confLocation').textContent = `${incident.latitude}, ${incident.longitude} (${incident.forestName})`;
  }
}

function initSocket() {
  if (typeof io !== 'undefined') {
    socket = io();

    socket.on('incident_updated', (updated) => {
      if (trackingIncidentId && updated.incidentId === trackingIncidentId) {
        const confStatus = document.getElementById('confStatus');
        if (confStatus) {
          confStatus.textContent = updated.status;
          if (updated.status === 'RESPONSE_DISPATCHED') {
            confStatus.className = 'text-sm font-black text-emerald-400 px-2 py-0.5 rounded bg-emerald-950 border border-emerald-600/50';
          }
        }
      }
    });
  }
}
