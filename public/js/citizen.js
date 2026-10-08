/**
 * ForestGuard-AI Citizen Reporting Engine
 * Handles image selection, Google/Leaflet interactive map, geocoding, and alert submission
 */

let citizenMap = null;
let citizenMarker = null;
let selectedFile = null;
let selectedPresetPath = null;
let currentCoords = { lat: 28.6329, lng: 77.2195 }; // Default Connaught Place, New Delhi
let socket = null;
let currentTrackingIncidentId = null;

document.addEventListener('DOMContentLoaded', () => {
  initCitizenMap();
  initUploadHandlers();
  initPresetScenarios();
  initFormSubmission();
  initSocketListener();
});

// 1. Initialize Map
function initCitizenMap() {
  const mapElement = document.getElementById('citizenMap');
  if (!mapElement) return;

  // Create Leaflet map centered at currentCoords
  citizenMap = L.map('citizenMap', {
    center: [currentCoords.lat, currentCoords.lng],
    zoom: 14,
    zoomControl: true
  });

  // High-res Google Hybrid / Satellite tiles
  const googleHybridTiles = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: 'Map & Imagery &copy; Google Maps'
  });

  const darkTacticalTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; CartoDB & OSM'
  });

  // Default to Google Hybrid
  googleHybridTiles.addTo(citizenMap);

  // Add draggable fire marker
  const firePinIcon = L.divIcon({
    className: 'custom-fire-pin',
    html: `<div style="font-size: 32px; filter: drop-shadow(0 0 10px #ff2a2a); cursor: pointer; animation: bounce 1s infinite alternate;">📍</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36]
  });

  citizenMarker = L.marker([currentCoords.lat, currentCoords.lng], {
    draggable: true,
    icon: firePinIcon
  }).addTo(citizenMap);

  citizenMarker.on('dragend', function (e) {
    const pos = citizenMarker.getLatLng();
    updateIncidentCoordinates(pos.lat, pos.lng);
  });

  // Click anywhere on map to reposition marker
  citizenMap.on('click', function (e) {
    citizenMarker.setLatLng(e.latlng);
    updateIncidentCoordinates(e.latlng.lat, e.latlng.lng);
  });

  // Locate Me button
  const btnLocate = document.getElementById('btnLocate');
  if (btnLocate) {
    btnLocate.addEventListener('click', locateUserDevice);
  }

  // Location search input
  const searchInput = document.getElementById('locationSearchInput');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        geocodeAddress(searchInput.value);
      }
    });
  }

  // Initial reverse geocode
  updateIncidentCoordinates(currentCoords.lat, currentCoords.lng);
}

function updateIncidentCoordinates(lat, lng) {
  currentCoords = { lat: parseFloat(lat.toFixed(5)), lng: parseFloat(lng.toFixed(5)) };
  
  const coordsDisplay = document.getElementById('coordsDisplay');
  if (coordsDisplay) {
    coordsDisplay.textContent = `${currentCoords.lat}, ${currentCoords.lng}`;
  }

  // Reverse geocode via OpenStreetMap Nominatim
  fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${currentCoords.lat}&lon=${currentCoords.lng}`)
    .then(res => res.json())
    .then(data => {
      const locName = data.display_name || `Coordinates (${currentCoords.lat}, ${currentCoords.lng})`;
      const locDisplay = document.getElementById('locationNameDisplay');
      const locInput = document.getElementById('inputLocationName');
      if (locDisplay) locDisplay.textContent = locName.split(',').slice(0, 3).join(',');
      if (locInput) locInput.value = locName.split(',').slice(0, 4).join(',');
    })
    .catch(() => {
      const fallback = `Zone Sector Coordinates (${currentCoords.lat}, ${currentCoords.lng})`;
      const locDisplay = document.getElementById('locationNameDisplay');
      const locInput = document.getElementById('inputLocationName');
      if (locDisplay) locDisplay.textContent = fallback;
      if (locInput) locInput.value = fallback;
    });
}

function geocodeAddress(query) {
  if (!query || !query.trim()) return;
  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`)
    .then(res => res.json())
    .then(results => {
      if (results && results.length > 0) {
        const item = results[0];
        const newLat = parseFloat(item.lat);
        const newLng = parseFloat(item.lon);
        citizenMap.flyTo([newLat, newLng], 15, { duration: 1.5 });
        citizenMarker.setLatLng([newLat, newLng]);
        updateIncidentCoordinates(newLat, newLng);
      } else {
        alert('Location address not found. Please click directly on the map to pinpoint.');
      }
    })
    .catch(() => {
      alert('Unable to lookup address. Please click on the map directly.');
    });
}

function locateUserDevice() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  const btn = document.getElementById('btnLocate');
  if (btn) btn.textContent = '📡 Locating...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      citizenMap.flyTo([lat, lng], 16, { duration: 1.5 });
      citizenMarker.setLatLng([lat, lng]);
      updateIncidentCoordinates(lat, lng);
      if (btn) btn.innerHTML = '📍 Locate Me';
    },
    (err) => {
      console.warn('Geolocation error:', err.message);
      if (btn) btn.innerHTML = '📍 Locate Me';
      alert('Could not acquire GPS coordinates. You can click directly on the map to drop the fire marker.');
    },
    { timeout: 8000 }
  );
}

// 2. Fire Image Upload Handlers
function initUploadHandlers() {
  const dropzone = document.getElementById('fireDropzone');
  const fileInput = document.getElementById('fireFileInput');
  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('previewImg');
  const btnRemoveImg = document.getElementById('btnRemoveImg');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImageSelected(e.target.files[0]);
    }
  });

  if (btnRemoveImg) {
    btnRemoveImg.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFile = null;
      selectedPresetPath = null;
      fileInput.value = '';
      if (previewContainer) previewContainer.style.display = 'none';
      if (dropzone) dropzone.style.display = 'block';
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
    });
  }
}

function handleImageSelected(file) {
  selectedFile = file;
  selectedPresetPath = null;

  const dropzone = document.getElementById('fireDropzone');
  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('previewImg');
  const previewName = document.getElementById('previewFileName');

  const reader = new FileReader();
  reader.onload = (e) => {
    if (previewImg) previewImg.src = e.target.result;
    if (previewName) previewName.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    if (dropzone) dropzone.style.display = 'none';
    if (previewContainer) previewContainer.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// 3. Preset Test Scenarios
function initPresetScenarios() {
  const presets = [
    {
      btnId: 'presetStructural',
      path: '/sample_images/sample_structural_fire.jpg',
      category: 'Structural / Commercial',
      desc: 'Heavy flames emerging from multi-story retail complex facade with dark smoke column.',
      lat: 28.6329,
      lng: 77.2195,
      locName: 'Connaught Place Inner Circle, New Delhi'
    },
    {
      btnId: 'presetWildfire',
      path: '/sample_images/sample_wildfire.jpg',
      category: 'Wildfire / Forest',
      desc: 'Rapidly spreading brush fire along ridge line with heavy gray smoke front.',
      lat: 28.5910,
      lng: 77.1680,
      locName: 'Delhi Ridge Reserve Forest Area'
    },
    {
      btnId: 'presetChemical',
      path: '/sample_images/sample_chemical_fire.jpg',
      category: 'Industrial / Chemical',
      desc: 'High-temperature industrial solvent ignition in processing warehouse.',
      lat: 28.6295,
      lng: 77.1210,
      locName: 'Mayapuri Phase II Industrial Area, New Delhi'
    },
    {
      btnId: 'presetSunset',
      path: '/sample_images/sample_sunset_safe.jpg',
      category: 'auto',
      desc: 'Sunset anomaly check (False alarm discrimination verification test).',
      lat: 28.6140,
      lng: 77.2090,
      locName: 'Central Vista Promenade, New Delhi'
    }
  ];

  presets.forEach(preset => {
    const btn = document.getElementById(preset.btnId);
    if (!btn) return;

    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      selectedFile = null;
      selectedPresetPath = preset.path;

      // Update Preview
      const dropzone = document.getElementById('fireDropzone');
      const previewContainer = document.getElementById('imagePreviewContainer');
      const previewImg = document.getElementById('previewImg');
      const previewName = document.getElementById('previewFileName');

      if (previewImg) previewImg.src = preset.path;
      if (previewName) previewName.textContent = `Preset: ${preset.category}`;
      if (dropzone) dropzone.style.display = 'none';
      if (previewContainer) previewContainer.style.display = 'block';

      // Update Category & Description
      const categorySelect = document.getElementById('categorySelect');
      const descInput = document.getElementById('descriptionInput');
      if (categorySelect) categorySelect.value = preset.category;
      if (descInput) descInput.value = preset.desc;

      // Update Map Position
      citizenMap.flyTo([preset.lat, preset.lng], 15, { duration: 1.2 });
      citizenMarker.setLatLng([preset.lat, preset.lng]);
      updateIncidentCoordinates(preset.lat, preset.lng);
    });
  });
}

// 4. Form Submission
function initFormSubmission() {
  const form = document.getElementById('fireReportForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!selectedFile && !selectedPresetPath) {
      alert('⚠️ Please upload a fire image or select one of the test scenarios.');
      return;
    }

    const modal = document.getElementById('submitModal');
    const modalStep = document.getElementById('modalStepText');
    if (modal) modal.style.display = 'flex';
    if (modalStep) modalStep.textContent = 'Transmitting imagery & telemetry...';

    try {
      const formData = new FormData();
      if (selectedFile) {
        formData.append('fireImage', selectedFile);
      } else if (selectedPresetPath) {
        formData.append('presetImage', selectedPresetPath);
      }

      formData.append('lat', currentCoords.lat);
      formData.append('lng', currentCoords.lng);
      formData.append('locationName', document.getElementById('inputLocationName')?.value || 'Unspecified Location');
      formData.append('category', document.getElementById('categorySelect')?.value || 'auto');
      formData.append('description', document.getElementById('descriptionInput')?.value || '');
      formData.append('reporterName', document.getElementById('reporterNameInput')?.value || 'Citizen Reporter');
      formData.append('reporterPhone', document.getElementById('reporterPhoneInput')?.value || '');

      if (modalStep) modalStep.textContent = 'Executing ForestGuard-AI Vision Pipeline...';

      const response = await fetch('/api/reports', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (modalStep) modalStep.textContent = 'Broadcasting to Emergency Dispatch via Socket.io...';

      setTimeout(() => {
        if (modal) modal.style.display = 'none';

        if (data.success && data.incident) {
          handleSubmissionSuccess(data.incident);
        } else {
          alert('Submission failed: ' + (data.message || 'Unknown server error'));
        }
      }, 700);

    } catch (err) {
      if (modal) modal.style.display = 'none';
      alert('Error submitting report: ' + err.message);
    }
  });
}

function handleSubmissionSuccess(incident) {
  currentTrackingIncidentId = incident.id;

  // Sound chime
  if (window.emergencyAudio) {
    window.emergencyAudio.playDispatchChime();
  }

  const formSection = document.getElementById('reportFormSection');
  const submittedCard = document.getElementById('submittedCard');
  if (formSection) formSection.style.display = 'none';
  if (submittedCard) submittedCard.style.display = 'block';

  // Fill in confirmation values
  document.getElementById('confTrackingCode').textContent = incident.trackingCode;
  document.getElementById('confStatusBadge').textContent = incident.status;
  document.getElementById('confSeverityBadge').textContent = incident.aiAnalysis.severityLevel;
  document.getElementById('confConfidenceScore').textContent = `${incident.aiAnalysis.confidenceScore}%`;
  document.getElementById('confNearestStation').textContent = `${incident.nearestFireStation.name} (${incident.nearestFireStation.distanceKm} km)`;
  document.getElementById('confEta').textContent = `${incident.nearestFireStation.estimatedEtaMinutes} Minutes`;
  document.getElementById('confNearestWater').textContent = `${incident.nearestWaterBody.name} (${incident.nearestWaterBody.distanceMeters}m)`;

  // Scroll to confirmation
  submittedCard.scrollIntoView({ behavior: 'smooth' });
}

// 5. Socket.io Live Status Updates for Citizen
function initSocketListener() {
  if (typeof io !== 'undefined') {
    socket = io();

    socket.on('incident_dispatched', (updatedIncident) => {
      if (updatedIncident.id === currentTrackingIncidentId) {
        const badge = document.getElementById('confStatusBadge');
        if (badge) {
          badge.textContent = 'DISPATCHED - UNITS EN ROUTE';
          badge.style.background = '#ff9f43';
          badge.style.color = '#000';
        }
        if (window.emergencyAudio) window.emergencyAudio.playDispatchChime();
      }
    });

    socket.on('incident_status_changed', (updatedIncident) => {
      if (updatedIncident.id === currentTrackingIncidentId) {
        const badge = document.getElementById('confStatusBadge');
        if (badge) {
          badge.textContent = updatedIncident.status;
          if (updatedIncident.status === 'RESOLVED') {
            badge.style.background = '#00e676';
            badge.style.color = '#000';
          }
        }
      }
    });
  }
}
