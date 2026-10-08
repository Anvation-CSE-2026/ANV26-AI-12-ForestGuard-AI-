/**
 * ForestGuard AI Map Engine
 * Primary Google Maps JavaScript API Implementation with High-Res Satellite/Hybrid Fallback.
 * Adheres strictly to the marker color specification:
 * RED: Critical active fire (PULSING)
 * ORANGE: High-risk fire
 * YELLOW: Possible fire / verification required
 * GREEN: Safe / resolved incident
 * BLUE: Water body
 * PURPLE: Fire / forest response station
 * CYAN: IoT sensor
 */

class ForestGuardMapEngine {
  constructor() {
    this.map = null;
    this.mode = 'hybrid-fallback'; // 'google-api' or 'hybrid-fallback'
    this.markers = {
      fires: [],
      stations: [],
      teams: [],
      water: [],
      sensors: [],
      satellites: []
    };
    this.routes = [];
    this.circles = [];
    this.perimeterLayers = [];
    this.spreadLayers = [];
    this.vulnerableLayers = [];
    this.populationExposureLayers = [];
    this.layerVisibility = {
      activeFires: true,
      firePerimeter: true,
      fireRiskZone: true,
      spreadSimulation: true,
      stations: true,
      teams: true,
      water: true,
      vulnerableLocations: true,
      populationExposure: true
    };
    this.googleApiKey = '';
    this.pulseInterval = null;
  }

  async init(elementId, initialCoords = { lat: 11.6643, lng: 76.6250 }, initialZoom = 8) {
    // Check for saved API key
    this.googleApiKey = localStorage.getItem('FG_GOOGLE_MAPS_KEY') || '';

    if (!this.googleApiKey) {
      try {
        const res = await fetch('/api/config');
        const data = await res.json();
        if (data.googleMapsApiKey) {
          this.googleApiKey = data.googleMapsApiKey;
        }
      } catch (e) {}
    }

    if (this.googleApiKey && typeof google === 'undefined') {
      try {
        await this.loadGoogleMapsScript(this.googleApiKey);
      } catch (err) {
        console.warn('Google Maps Script load failed, falling back to Google Satellite engine.', err);
      }
    }

    if (typeof google !== 'undefined' && google.maps) {
      this.mode = 'google-api';
      this.initGoogleMap(elementId, initialCoords, initialZoom);
    } else {
      this.mode = 'hybrid-fallback';
      this.initFallbackMap(elementId, initialCoords, initialZoom);
    }

    console.log(`[MAP ENGINE] Initialized in mode: ${this.mode}`);
    return this;
  }

  loadGoogleMapsScript(apiKey) {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.maps) return resolve();
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // --- Google Maps API Mode ---
  initGoogleMap(elementId, coords, zoom) {
    const el = document.getElementById(elementId);
    if (!el) return;

    this.map = new google.maps.Map(el, {
      center: { lat: coords.lat, lng: coords.lng },
      zoom: zoom,
      mapTypeId: 'hybrid',
      mapTypeControl: true,
      fullscreenControl: true,
      streetViewControl: false,
      zoomControl: true,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#1d2c4d' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#8ec3b9' }] },
        { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#4b6878' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] }
      ]
    });
  }

  // --- Google Satellite/Hybrid Fallback Engine (Leaflet powered, zero keys needed) ---
  initFallbackMap(elementId, coords, zoom) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (this.map) {
      try {
        this.map.remove();
      } catch (e) {}
      this.map = null;
    }
    if (el._leaflet_id) {
      el._leaflet_id = null;
    }

    try {
      this.map = L.map(elementId, {
        center: [coords.lat, coords.lng],
        zoom: zoom,
        maxZoom: 21,
        zoomControl: true
      });
    } catch (err) {
      console.warn('[MAP ENGINE] Retrying Leaflet container reset:', err);
      el._leaflet_id = null;
      this.map = L.map(elementId, {
        center: [coords.lat, coords.lng],
        zoom: zoom,
        maxZoom: 21,
        zoomControl: true
      });
    }

    // High-resolution Google Hybrid Satellite & Roads Tiles with building-level zoom (maxZoom 21)
    this.googleHybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 21,
      maxNativeZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: 'Map & Imagery &copy; Google Maps'
    }).addTo(this.map);

    this.darkTacticalLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; CartoDB & OSM'
    });

    // Small Buttons on Leaflet tool rack for Default Sector Zoom (🎯) & Deep Zoom (🔬)
    try {
      const zoomControlRack = L.control({ position: 'topleft' });
      zoomControlRack.onAdd = () => {
        const div = L.DomUtil.create('div', 'leaflet-bar');
        div.innerHTML = `
          <a href="javascript:void(0)" title="🎯 Sector Default Zoom (Fire + Stations + Waterbodies)" style="display:flex;align-items:center;justify-content:center;font-size:14px;background:#070e1c;color:#f97316;text-decoration:none;width:30px;height:30px;cursor:pointer;border-bottom:1px solid #1e293b;" onmouseover="this.style.background='#ea580c';this.style.color='#fff'" onmouseout="this.style.background='#070e1c';this.style.color='#f97316'">🎯</a>
          <a href="javascript:void(0)" title="🔬 Deep Zoom In (Tree & Building Level - Zoom 19)" style="display:flex;align-items:center;justify-content:center;font-size:14px;background:#070e1c;color:#38bdf8;text-decoration:none;width:30px;height:30px;cursor:pointer;" onmouseover="this.style.background='#0284c7';this.style.color='#fff'" onmouseout="this.style.background='#070e1c';this.style.color='#38bdf8'">🔬</a>
        `;
        const links = div.querySelectorAll('a');
        links[0].onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.restoreSectorDefaultZoom();
        };
        links[1].onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.deepZoomOnIncident(19);
        };
        return div;
      };
      zoomControlRack.addTo(this.map);
    } catch(e) {}

    // Invalidate map size after DOM layout settles to prevent tile overlap / grey corners
    setTimeout(() => {
      this.invalidateSize();
    }, 250);
  }

  setTileLayer(type) {
    if (this.mode === 'google-api') {
      if (this.map.setMapTypeId) {
        if (type === 'satellite') this.map.setMapTypeId('satellite');
        else if (type === 'terrain') this.map.setMapTypeId('terrain');
        else if (type === 'roadmap') this.map.setMapTypeId('roadmap');
        else this.map.setMapTypeId('hybrid');
      }
    } else {
      if (type === 'dark') {
        this.map.removeLayer(this.googleHybridLayer);
        this.darkTacticalLayer.addTo(this.map);
      } else {
        this.map.removeLayer(this.darkTacticalLayer);
        this.googleHybridLayer.addTo(this.map);
      }
    }
  }

  centerOn(lat, lng, zoom = 15) {
    if (!this.map) return;
    if (this.mode === 'google-api') {
      this.map.panTo({ lat, lng });
      if (zoom) this.map.setZoom(zoom);
    } else {
      this.map.flyTo([lat, lng], zoom, { duration: 1.6 });
    }
  }

  // --- Ensure BOTH the fire area AND the nearby station (and water body) are simultaneously visible in narrow zoom ---
  fitToIncidentAndEntities(fireCoords, stationCoords = null, waterCoords = null) {
    if (!this.map || !fireCoords) return;
    const fLat = fireCoords.lat !== undefined ? fireCoords.lat : fireCoords[0];
    const fLng = fireCoords.lng !== undefined ? fireCoords.lng : fireCoords[1];
    if (fLat === undefined || fLng === undefined) return;

    const points = [[fLat, fLng]];

    if (stationCoords) {
      const sLat = stationCoords.lat !== undefined ? stationCoords.lat : stationCoords[0];
      const sLng = stationCoords.lng !== undefined ? stationCoords.lng : stationCoords[1];
      if (sLat !== undefined && sLng !== undefined) {
        const dStation = Math.hypot((fLat - sLat) * 111, (fLng - sLng) * 111 * Math.cos(fLat * Math.PI / 180));
        // Keep strictly local within 25 km so we don't zoom out across whole state
        if (dStation <= 25) {
          points.push([sLat, sLng]);
        }
      }
    }

    if (waterCoords) {
      const wLat = waterCoords.lat !== undefined ? waterCoords.lat : waterCoords[0];
      const wLng = waterCoords.lng !== undefined ? waterCoords.lng : waterCoords[1];
      if (wLat !== undefined && wLng !== undefined) {
        const dWater = Math.hypot((fLat - wLat) * 111, (fLng - wLng) * 111 * Math.cos(fLat * Math.PI / 180));
        if (dWater <= 20) {
          points.push([wLat, wLng]);
        }
      }
    }

    // Save points for 1-click restore default zoom button
    this.currentSectorBounds = points;

    if (points.length === 1) {
      this.centerOn(fLat, fLng, 15);
      return;
    }

    if (this.mode === 'google-api') {
      const bounds = new google.maps.LatLngBounds();
      points.forEach(p => bounds.extend(new google.maps.LatLng(p[0], p[1])));
      this.map.fitBounds(bounds);
    } else {
      // Leaflet fitBounds ensuring BOTH the forest fire ground zero AND the connected fire stations/water bodies are simultaneously visible
      this.map.fitBounds(points, {
        padding: [65, 65],
        maxZoom: 15,
        animate: true,
        duration: 1.2
      });
    }
  }

  // --- 1-Click Restore Default Zoom (Fire + Connected Stations & Water Bodies) ---
  restoreSectorDefaultZoom() {
    if (!this.map) return;
    if (this.currentSectorBounds && this.currentSectorBounds.length > 0) {
      if (this.mode === 'google-api') {
        const bounds = new google.maps.LatLngBounds();
        this.currentSectorBounds.forEach(p => bounds.extend(new google.maps.LatLng(p[0], p[1])));
        this.map.fitBounds(bounds);
      } else {
        this.map.fitBounds(this.currentSectorBounds, {
          padding: [65, 65],
          maxZoom: 15,
          animate: true,
          duration: 1.2
        });
      }
    } else if (this.markers.fires && this.markers.fires.length > 0) {
      const firstFire = this.markers.fires[0];
      if (firstFire && firstFire.getLatLng) {
        const ll = firstFire.getLatLng();
        this.centerOn(ll.lat, ll.lng, 15);
      }
    }
  }

  // --- 1-Click Deep Zoom directly into Ground Zero (Tree & Building Level - Zoom 19) ---
  deepZoomOnIncident(zoomLevel = 19) {
    if (!this.map) return;
    let target = null;
    if (this.currentSectorBounds && this.currentSectorBounds.length > 0) {
      target = this.currentSectorBounds[0]; // Ground Zero fire point is always points[0]
    } else if (this.markers.fires && this.markers.fires.length > 0) {
      const firstFire = this.markers.fires[0];
      if (firstFire && firstFire.getLatLng) {
        const ll = firstFire.getLatLng();
        target = [ll.lat, ll.lng];
      }
    }
    if (target) {
      this.centerOn(target[0], target[1], zoomLevel);
    }
  }

  // --- Add Fire Incident Marker (RED Pulsing / ORANGE / YELLOW / GREEN) ---
  addFireMarker(incident, onClickCallback) {
    if (!this.map) return null;
    const lat = incident.latitude || incident.coordinates?.lat;
    const lng = incident.longitude || incident.coordinates?.lng;
    const severity = incident.severity || 'CRITICAL';
    const isResolved = incident.status === 'RESOLVED';
    const isCritical = severity === 'CRITICAL' && !isResolved;

    let markerColor = '#ff2a2a'; // RED default
    let badgeClass = 'fire-marker-red';

    if (isResolved) {
      markerColor = '#00e676'; // GREEN Safe
      badgeClass = 'fire-marker-green';
    } else if (severity === 'HIGH') {
      markerColor = '#ff6a00'; // ORANGE
      badgeClass = 'fire-marker-orange';
    } else if (severity === 'MODERATE' || incident.status === 'UNDER_VERIFICATION') {
      markerColor = '#ffb703'; // YELLOW Verification
      badgeClass = 'fire-marker-yellow';
    }

    if (this.mode === 'google-api') {
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: this.map,
        title: `${incident.incidentId} - ${incident.forestName}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isCritical ? 14 : 10,
          fillColor: markerColor,
          fillOpacity: 0.95,
          strokeColor: '#ffffff',
          strokeWeight: 2.5
        }
      });

      marker.addListener('click', () => {
        if (onClickCallback) onClickCallback(incident);
      });
      this.markers.fires.push(marker);
      return marker;
    } else {
      // Leaflet with CSS pulsing shockwave rings for RED critical fires
      const pulseHtml = isCritical
        ? `<div class="fire-pulse-container"><div class="fire-shockwave"></div><div class="fire-shockwave delay-1"></div><div class="fire-core-dot" style="background:${markerColor};">🔥</div></div>`
        : `<div class="fire-badge-dot" style="background:${markerColor}; box-shadow:0 0 12px ${markerColor};">🔥</div>`;

      const icon = L.divIcon({
        className: `custom-map-marker ${badgeClass}`,
        html: pulseHtml,
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      });

      const marker = L.marker([lat, lng], { icon }).addTo(this.map);
      const tipTitle = incident.title || incident.forestName || 'Fire Incident';
      marker.bindTooltip(`<b>${tipTitle}</b><br><span style="font-size:11px;color:#94a3b8;">${incident.incidentId} • ${incident.severity || 'CRITICAL'}</span>`, { direction: 'top', offset: [0, -16] });
      marker.on('click', () => {
        if (onClickCallback) onClickCallback(incident);
      });
      this.markers.fires.push(marker);
      return marker;
    }
  }

  // --- Add Response Station Marker (PURPLE) ---
  addStationMarker(station, onClickCallback) {
    if (!this.map) return null;
    const lat = station.coordinates.lat;
    const lng = station.coordinates.lng;

    if (this.mode === 'google-api') {
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: this.map,
        title: station.name,
        icon: {
          path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
          scale: 7,
          fillColor: '#9333ea', // PURPLE
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });
      marker.addListener('click', () => onClickCallback && onClickCallback(station));
      this.markers.stations.push(marker);
      return marker;
    } else {
      const rawName = station.name || 'Bandipur Station';
      const shortName = rawName.split('(')[0].replace(/Rapid Response Unit|Fire Response Unit|Forest Response Unit/gi, 'Station').trim();
      const icon = L.divIcon({
        className: 'custom-map-marker marker-station-badge',
        html: `<div style="display:inline-flex; align-items:center; gap:6px; background:rgba(7,14,28,0.95); border:2px solid #3b82f6; border-radius:10px; padding:4px 10px; box-shadow:0 0 16px rgba(59,130,246,0.6); color:#fff; font-family:Inter,sans-serif; cursor:pointer; white-space:nowrap; transform:translate(-50%, -50%);"><span style="font-size:11px; font-weight:800; color:#fff;">${shortName} - Team Ready</span><span style="font-size:14px; filter:drop-shadow(0 0 4px #3b82f6);">🛡️</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      const marker = L.marker([lat, lng], { icon }).addTo(this.map);
      marker.bindPopup(`<b>${station.name}</b><br><span style="color:#60a5fa;">Emergency Forestry Station - Team Ready (🛡️)</span><br>ETA: <b>${station.etaMinutes || 14} min</b>`);
      marker.on('click', () => onClickCallback && onClickCallback(station));
      this.markers.stations.push(marker);
      return marker;
    }
  }

  // --- Add Water Body Marker (BLUE) ---
  addWaterMarker(water, onClickCallback) {
    if (!this.map) return null;
    const lat = water.coordinates.lat;
    const lng = water.coordinates.lng;

    if (this.mode === 'google-api') {
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: this.map,
        title: water.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#0284c7', // BLUE
          fillOpacity: 1,
          strokeColor: '#38bdf8',
          strokeWeight: 2
        }
      });
      marker.addListener('click', () => onClickCallback && onClickCallback(water));
      this.markers.water.push(marker);
      return marker;
    } else {
      const wName = water.name ? water.name.split('(')[0].trim() : 'Water Source';
      const icon = L.divIcon({
        className: 'custom-map-marker marker-water-badge',
        html: `<div style="display:inline-flex; align-items:center; gap:5px; background:rgba(7,20,40,0.95); border:2px solid #0284c7; border-radius:9px; padding:3px 8px; box-shadow:0 0 14px rgba(2,132,199,0.6); color:#fff; font-family:Inter,sans-serif; cursor:pointer; white-space:nowrap; transform:translate(-50%, -50%);"><span style="font-size:12px;">💧</span><span style="font-size:10px; font-weight:800; color:#38bdf8;">${wName}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });
      const marker = L.marker([lat, lng], { icon }).addTo(this.map);
      marker.bindPopup(`<b>${water.name}</b><br><span style="color:#38bdf8;">Water Body / Drafting Source (BLUE)</span><br>${water.capacity || ''}<br>Coordinates: <b>${lat.toFixed(4)}, ${lng.toFixed(4)}</b>`);
      marker.on('click', () => onClickCallback && onClickCallback(water));
      this.markers.water.push(marker);
      return marker;
    }
  }

  // --- Add IoT Sensor Marker (CYAN) ---
  addSensorMarker(sensor, onClickCallback) {
    if (!this.map) return null;
    const lat = sensor.coordinates.lat;
    const lng = sensor.coordinates.lng;
    const isCritical = sensor.status === 'CRITICAL';

    if (this.mode === 'google-api') {
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: this.map,
        title: `${sensor.id} (${sensor.forestName})`,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          scale: 6,
          fillColor: '#00e5ff', // CYAN
          fillOpacity: 1,
          strokeColor: '#006064',
          strokeWeight: 1.5
        }
      });
      marker.addListener('click', () => onClickCallback && onClickCallback(sensor));
      this.markers.sensors.push(marker);
      return marker;
    } else {
      const icon = L.divIcon({
        className: 'custom-map-marker marker-cyan',
        html: `<div class="sensor-badge-marker ${isCritical ? 'sensor-crit' : ''}" style="background:#00e5ff; border:2px solid #002b36; box-shadow:0 0 12px #00e5ff; color:#000; font-weight:800; font-size:12px; display:flex; align-items:center; justify-content:center; border-radius:50%; width:28px; height:28px;">📡</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const marker = L.marker([lat, lng], { icon }).addTo(this.map);
      marker.bindPopup(`<b>IoT Sensor: ${sensor.id}</b><br><span style="color:#00e5ff;">Temp: ${sensor.temperature}°C | Smoke: ${sensor.smokeIndex}%</span><br>Status: <b>${sensor.status}</b>`);
      marker.on('click', () => onClickCallback && onClickCallback(sensor));
      this.markers.sensors.push(marker);
      return marker;
    }
  }

  // --- Add Satellite Hotspot Marker ---
  addSatelliteMarker(hotspot, onClickCallback) {
    if (!this.map) return null;
    const lat = hotspot.coordinates.lat;
    const lng = hotspot.coordinates.lng;

    if (this.mode === 'google-api') {
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: this.map,
        title: `${hotspot.id} - ${hotspot.satellite}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 7,
          fillColor: '#f59e0b',
          fillOpacity: 0.9,
          strokeColor: '#ffffff',
          strokeWeight: 1.5
        }
      });
      marker.addListener('click', () => onClickCallback && onClickCallback(hotspot));
      this.markers.satellites.push(marker);
      return marker;
    } else {
      const icon = L.divIcon({
        className: 'custom-map-marker marker-sat',
        html: `<div style="background:#f59e0b; border:2px solid #fff; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:12px; box-shadow:0 0 10px #f59e0b;">🛰️</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });
      const marker = L.marker([lat, lng], { icon }).addTo(this.map);
      marker.bindPopup(`<b>Satellite Thermal Hotspot</b><br>${hotspot.satellite} (${hotspot.confidence}%)<br>FRP: ${hotspot.frpMegawatts} MW`);
      marker.on('click', () => onClickCallback && onClickCallback(hotspot));
      this.markers.satellites.push(marker);
      return marker;
    }
  }

  // --- Draw Routes (Station to Fire & Water to Fire) ---
  // In Image 4, the connection from station to fire ground zero is a dotted line!
  drawRoute(waypoints, color = '#f97316', isDashed = true) {
    if (!this.map || !waypoints || waypoints.length === 0) return null;
    if (this.mode === 'google-api') {
      const gWaypoints = waypoints.map(w => ({ lat: w[0], lng: w[1] }));
      const polyline = new google.maps.Polyline({
        path: gWaypoints,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 4,
        map: this.map
      });
      this.routes.push(polyline);
      return polyline;
    } else {
      const polyline = L.polyline(waypoints, {
        color: color,
        weight: 4,
        opacity: 0.95,
        dashArray: isDashed !== false ? '8, 8' : undefined
      }).addTo(this.map);
      this.routes.push(polyline);
      return polyline;
    }
  }

  clearRoutes() {
    if (!this.map) {
      this.routes = [];
      this.clearVehicleMarker();
      return;
    }
    if (this.mode === 'google-api') {
      this.routes.forEach(r => r.setMap(null));
    } else {
      this.routes.forEach(r => {
        try { this.map.removeLayer(r); } catch(e) {}
      });
    }
    this.routes = [];
    this.clearVehicleMarker();
  }

  clearVehicleMarker() {
    if (this.teamVehicleMarker) {
      try {
        if (this.mode === 'google-api') this.teamVehicleMarker.setMap(null);
        else if (this.map) this.map.removeLayer(this.teamVehicleMarker);
      } catch (e) {}
      this.teamVehicleMarker = null;
    }
  }

  clearMarkers(category = 'all') {
    if (!this.map) return;
    const clearList = (list) => {
      list.forEach(m => {
        try {
          if (this.mode === 'google-api') m.setMap(null);
          else this.map.removeLayer(m);
        } catch(e) {}
      });
    };

    if (category === 'all') {
      Object.keys(this.markers).forEach(k => {
        clearList(this.markers[k]);
        this.markers[k] = [];
      });
    } else if (this.markers[category]) {
      clearList(this.markers[category]);
      this.markers[category] = [];
    }
  }
  // --- Draw Radius Circles (500m, 1.5km, 5km) Matching Image 4 ---
  // Keeps shade ONLY in the first radius (500m Hot Zone), retains clean dotted radius lines around outer perimeters without orange wash
  drawRadiusCircles(lat, lng, radii = [500, 1500, 5000]) {
    this.clearCircles();
    this.circles = [];
    if (!this.map) return;

    const colors = [
      { color: '#ef4444', name: '500m Hot Zone' },
      { color: '#f97316', name: '1.5km Buffer Perimeter' },
      { color: '#eab308', name: '5km Response Sector' }
    ];

    radii.forEach((radiusMeters, idx) => {
      const col = colors[idx] || colors[0];
      const isFirstRadius = (idx === 0); // Keep shade ONLY in the first radius

      if (this.mode === 'google-api') {
        const circle = new google.maps.Circle({
          strokeColor: col.color,
          strokeOpacity: 0.85,
          strokeWeight: 1.8,
          fillColor: col.color,
          fillOpacity: isFirstRadius ? 0.16 : 0,
          map: this.map,
          center: { lat, lng },
          radius: radiusMeters
        });
        this.circles.push(circle);
      } else {
        const circle = L.circle([lat, lng], {
          radius: radiusMeters,
          color: col.color,
          weight: 1.8,
          opacity: 0.85,
          fill: isFirstRadius,
          fillColor: col.color,
          fillOpacity: isFirstRadius ? 0.16 : 0,
          dashArray: '6, 6'
        }).addTo(this.map);
        circle.bindTooltip(col.name, { permanent: false, direction: 'top' });
        this.circles.push(circle);
      }
    });
  }

  clearCircles() {
    if (this.circles) {
      this.circles.forEach(c => {
        try {
          if (this.mode === 'google-api') c.setMap(null);
          else if (this.map) this.map.removeLayer(c);
        } catch(e) {}
      });
    }
    this.circles = [];
  }

  // --- Live Response Team Vehicle Marker (Section 17) ---
  updateTeamVehicleMarker(lat, lng, label = 'Team 04') {
    if (!this.map) return null;
    if (this.teamVehicleMarker) {
      if (this.mode === 'google-api') {
        this.teamVehicleMarker.setPosition({ lat, lng });
      } else {
        this.teamVehicleMarker.setLatLng([lat, lng]);
      }
    } else {
      if (this.mode === 'google-api') {
        this.teamVehicleMarker = new google.maps.Marker({
          position: { lat, lng },
          map: this.map,
          title: `${label} (EN ROUTE)`,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 8,
            fillColor: '#00e5ff',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
          }
        });
      } else {
        const icon = L.divIcon({
          className: 'custom-vehicle-moving',
          html: `<div style="background:#00e5ff; border:2px solid #fff; border-radius:50%; width:38px; height:38px; display:flex; align-items:center; justify-content:center; font-size:18px; box-shadow:0 0 16px #00e5ff; animation:pulse 1s infinite;">🚑</div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19]
        });
        this.teamVehicleMarker = L.marker([lat, lng], { icon }).addTo(this.map);
        this.teamVehicleMarker.bindPopup(`<b>${label}</b><br><span style="color:#00e5ff;">STATUS: EN ROUTE</span>`);
      }
    }
    return this.teamVehicleMarker;
  }

  // =========================================================================
  // FEATURE 1: FIRE PERIMETER VISUALIZATION
  // =========================================================================
  drawFirePerimeter(perimeterData) {
    this.clearFirePerimeter();
    if (!this.map || !perimeterData || !perimeterData.zones) return;
    if (this.layerVisibility.firePerimeter === false) return;

    try {
      const zones = [
        { key: 'potentialExpansion', data: perimeterData.zones.potentialExpansion, label: 'Potential Expansion Zone (Yellow)' },
        { key: 'highRisk', data: perimeterData.zones.highRisk, label: 'High-Risk Surrounding Zone (Orange)' },
        { key: 'confirmed', data: perimeterData.zones.confirmed, label: 'Current Fire / Confirmed Affected Area (Red)' }
      ];

      zones.forEach(z => {
        if (!z.data) return;
        const color = z.data.color || '#ef4444';
        const isConfirmed = (z.key === 'confirmed'); // Keep shade ONLY in the innermost confirmed fire zone
        const fillOpacity = isConfirmed ? 0.22 : 0;
        const tooltipText = `<b>ESTIMATED FIRE PERIMETER</b><br><span style="color:${color};font-weight:bold;">${z.label}</span><br>Estimated Area: <b>${z.data.estimatedHectares || perimeterData.estimatedAreaHectares} ha</b><br><span style="font-size:10px;color:#94a3b8;">Prototype estimate based on coordinates & severity</span>`;

        if (this.mode === 'google-api') {
          if (z.data.polygonCoords && z.data.polygonCoords.length > 0) {
            const polygon = new google.maps.Polygon({
              paths: z.data.polygonCoords,
              strokeColor: color,
              strokeOpacity: 0.9,
              strokeWeight: z.data.strokeWeight || 2,
              fillColor: color,
              fillOpacity: fillOpacity,
              map: this.map,
              zIndex: z.key === 'confirmed' ? 10 : z.key === 'highRisk' ? 9 : 8
            });
            const info = new google.maps.InfoWindow({ content: tooltipText });
            polygon.addListener('click', (e) => {
              info.setPosition(e.latLng);
              info.open(this.map);
            });
            this.perimeterLayers.push(polygon);
          } else if (perimeterData.center && z.data.radiusMeters) {
            const circle = new google.maps.Circle({
              center: perimeterData.center,
              radius: z.data.radiusMeters,
              strokeColor: color,
              strokeOpacity: 0.9,
              strokeWeight: z.data.strokeWeight || 2,
              fillColor: color,
              fillOpacity: fillOpacity,
              map: this.map,
              zIndex: z.key === 'confirmed' ? 10 : z.key === 'highRisk' ? 9 : 8
            });
            this.perimeterLayers.push(circle);
          }
        } else {
          // Leaflet Hybrid Engine
          if (z.data.polygonCoords && z.data.polygonCoords.length > 0) {
            const latLngs = z.data.polygonCoords.map(c => [c.lat, c.lng]);
            const poly = L.polygon(latLngs, {
              color: color,
              fill: isConfirmed,
              fillColor: color,
              fillOpacity: fillOpacity,
              weight: z.data.strokeWeight || 2,
              dashArray: !isConfirmed ? '4, 4' : undefined
            }).addTo(this.map);
            poly.bindTooltip(tooltipText, { permanent: false, direction: 'top' });
            this.perimeterLayers.push(poly);
          } else if (perimeterData.center && z.data.radiusMeters) {
            const circle = L.circle([perimeterData.center.lat, perimeterData.center.lng], {
              radius: z.data.radiusMeters,
              color: color,
              fill: isConfirmed,
              fillColor: color,
              fillOpacity: fillOpacity,
              weight: z.data.strokeWeight || 2,
              dashArray: !isConfirmed ? '4, 4' : undefined
            }).addTo(this.map);
            circle.bindTooltip(tooltipText, { permanent: false, direction: 'top' });
            this.perimeterLayers.push(circle);
          }
        }
      });
    } catch (err) {
      console.warn('Map service temporarily unavailable (Perimeter):', err.message);
    }
  }

  clearFirePerimeter() {
    if (this.perimeterLayers) {
      this.perimeterLayers.forEach(l => {
        try {
          if (this.mode === 'google-api') l.setMap(null);
          else if (this.map) this.map.removeLayer(l);
        } catch(e) {}
      });
    }
    this.perimeterLayers = [];
  }

  // =========================================================================
  // FEATURE 2: FIRE SPREAD PREDICTION / SIMULATION
  // =========================================================================
  drawSpreadSimulation(simulationData, activeMinutes = 60) {
    this.clearSpreadSimulation();
    if (!this.map || !simulationData) return;
    if (this.layerVisibility.spreadSimulation === false) return;

    try {
      const geoms = simulationData.spreadGeometries;
      if (!geoms) return;

      const steps = [
        { key: 'current', geom: geoms.current, min: 0, label: 'CURRENT FIRE (Red)', color: '#ef4444' },
        { key: 'min30', geom: geoms.min30, min: 30, label: '30 MIN SPREAD (Orange)', color: '#f97316' },
        { key: 'min60', geom: geoms.min60, min: 60, label: '60 MIN SPREAD (Orange/Yellow)', color: '#f59e0b' },
        { key: 'min90', geom: geoms.min90, min: 90, label: '90 MIN SPREAD (Yellow)', color: '#eab308' }
      ];

      // Draw projected spread zones up to activeMinutes
      steps.filter(s => s.min <= activeMinutes).forEach(s => {
        if (!s.geom || !s.geom.polygon) return;
        const tipText = `<b>SIMULATION - NOT AN OPERATIONAL FIRE-PREDICTION MODEL</b><br><span style="color:${s.color};font-weight:bold;">${s.label}</span><br>Projected Direction: <b>${simulationData.estimates?.projectedDirection || 'North-East'} ↗</b><br>Wind Speed: <b>${simulationData.weather?.windSpeedKmH || 18} km/h</b><br>Area: <b>${simulationData.rawEstimates?.[s.key]?.areaHectares || '--'} ha</b>`;

        if (this.mode === 'google-api') {
          const poly = new google.maps.Polygon({
            paths: s.geom.polygon,
            strokeColor: s.color,
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillColor: s.color,
            fillOpacity: s.min === 0 ? 0.25 : 0,
            map: this.map,
            zIndex: 15 - Math.round(s.min / 10)
          });
          const info = new google.maps.InfoWindow({ content: tipText });
          poly.addListener('click', (e) => {
            info.setPosition(e.latLng);
            info.open(this.map);
          });
          this.spreadLayers.push(poly);
        } else {
          const latLngs = s.geom.polygon.map(c => [c.lat, c.lng]);
          const poly = L.polygon(latLngs, {
            color: s.color,
            fill: s.min === 0,
            fillColor: s.color,
            fillOpacity: s.min === 0 ? 0.25 : 0,
            weight: 2,
            dashArray: s.min > 0 ? '5, 5' : undefined
          }).addTo(this.map);
          poly.bindTooltip(tipText, { permanent: false, direction: 'top' });
          this.spreadLayers.push(poly);
        }
      });

      // Draw projected spread trajectory arrow
      if (simulationData.arrowWaypoints && simulationData.arrowWaypoints.length > 0) {
        if (this.mode === 'google-api') {
          const gPoints = simulationData.arrowWaypoints.map(w => ({ lat: w[0], lng: w[1] }));
          const arrowLine = new google.maps.Polyline({
            path: gPoints,
            strokeColor: '#f59e0b',
            strokeOpacity: 0.9,
            strokeWeight: 3.5,
            icons: [{
              icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 4, fillColor: '#f59e0b', fillOpacity: 1, strokeWeight: 1 },
              offset: '100%'
            }],
            map: this.map
          });
          this.spreadLayers.push(arrowLine);
        } else {
          const arrowLine = L.polyline(simulationData.arrowWaypoints, {
            color: '#f59e0b',
            weight: 3.5,
            dashArray: '4, 6',
            opacity: 0.95
          }).addTo(this.map);
          arrowLine.bindTooltip('Projected Fire Spread Direction (North-East ↗)', { direction: 'top' });
          this.spreadLayers.push(arrowLine);

          // Arrowhead end badge
          const lastPoint = simulationData.arrowWaypoints[simulationData.arrowWaypoints.length - 1];
          const arrowBadge = L.divIcon({
            className: 'custom-spread-arrow',
            html: `<div style="background:#f59e0b; color:#000; font-weight:900; font-size:12px; border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px #f59e0b; border:2px solid #fff;">↗</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
          });
          const arrowMarker = L.marker(lastPoint, { icon: arrowBadge }).addTo(this.map);
          this.spreadLayers.push(arrowMarker);
        }
      }
    } catch (err) {
      console.warn('Map service temporarily unavailable (Spread):', err.message);
    }
  }

  clearSpreadSimulation() {
    if (this.spreadLayers) {
      this.spreadLayers.forEach(l => {
        try {
          if (this.mode === 'google-api') l.setMap(null);
          else if (this.map) this.map.removeLayer(l);
        } catch(e) {}
      });
    }
    this.spreadLayers = [];
  }

  // =========================================================================
  // FEATURE 4: NEARBY POPULATION & VULNERABLE LOCATIONS
  // =========================================================================
  drawVulnerableLocations(vulnerableData) {
    this.clearVulnerableLocations();
    if (!this.map || !vulnerableData) return;
    if (this.layerVisibility.vulnerableLocations === false) return;

    try {
      const list = vulnerableData.vulnerableLocations || [];
      list.forEach(item => {
        if (!item.coordinates) return;
        const lat = item.coordinates.lat;
        const lng = item.coordinates.lng;
        const popupContent = `<b>${item.name}</b><br><span style="color:${item.color};font-weight:bold;">${item.category}</span><br>Distance: <b>${item.distanceKm} km</b>${item.population ? `<br>Population Est: <b>${item.population.toLocaleString('en-IN')}</b>` : ''}<br><span style="font-size:9px;color:#94a3b8;">Population data: DEMO / API READY</span>`;

        if (this.mode === 'google-api') {
          const marker = new google.maps.Marker({
            position: { lat, lng },
            map: this.map,
            title: `${item.name} (${item.distanceKm} km)`,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: item.color,
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2
            }
          });
          const info = new google.maps.InfoWindow({ content: popupContent });
          marker.addListener('click', () => info.open(this.map, marker));
          this.vulnerableLayers.push(marker);
        } else {
          const icon = L.divIcon({
            className: 'custom-vuln-marker',
            html: `<div style="background:${item.color}; border:2px solid #fff; border-radius:8px; padding:2px 6px; box-shadow:0 0 10px ${item.color}; color:#fff; font-size:10px; font-weight:800; display:inline-flex; align-items:center; gap:3px; white-space:nowrap; transform:translate(-50%, -50%);"><span>${item.icon || '📍'}</span><span>${item.name.split(',')[0]}</span></div>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          });
          const marker = L.marker([lat, lng], { icon }).addTo(this.map);
          marker.bindPopup(popupContent);
          this.vulnerableLayers.push(marker);
        }
      });
    } catch (err) {
      console.warn('Map service temporarily unavailable (Vulnerable):', err.message);
    }
  }

  clearVulnerableLocations() {
    if (this.vulnerableLayers) {
      this.vulnerableLayers.forEach(l => {
        try {
          if (this.mode === 'google-api') l.setMap(null);
          else if (this.map) this.map.removeLayer(l);
        } catch(e) {}
      });
    }
    this.vulnerableLayers = [];
  }

  drawPopulationExposureCircles(lat, lng, radii = [1000, 5000, 10000]) {
    this.clearPopulationExposureCircles();
    if (!this.map || !lat || !lng) return;
    if (this.layerVisibility.populationExposure === false) return;

    try {
      const specs = [
        { radius: radii[0] || 1000, color: '#ef4444', label: '1 km Immediate Impact Zone', fillOpacity: 0 },
        { radius: radii[1] || 5000, color: '#f97316', label: '5 km Population Buffer Zone', fillOpacity: 0 },
        { radius: radii[2] || 10000, color: '#eab308', label: '10 km Regional Monitoring Zone', fillOpacity: 0 }
      ];

      specs.forEach(s => {
        if (this.mode === 'google-api') {
          const circle = new google.maps.Circle({
            center: { lat, lng },
            radius: s.radius,
            strokeColor: s.color,
            strokeOpacity: 0.75,
            strokeWeight: 1.5,
            fillColor: s.color,
            fillOpacity: 0,
            map: this.map
          });
          this.populationExposureLayers.push(circle);
        } else {
          const circle = L.circle([lat, lng], {
            radius: s.radius,
            color: s.color,
            weight: 1.5,
            opacity: 0.75,
            fill: false,
            fillColor: s.color,
            fillOpacity: 0,
            dashArray: '6, 8'
          }).addTo(this.map);
          circle.bindTooltip(`<b>POPULATION EXPOSURE</b><br>${s.label}`, { direction: 'top' });
          this.populationExposureLayers.push(circle);
        }
      });
    } catch (err) {
      console.warn('Map service temporarily unavailable (Exposure):', err.message);
    }
  }

  clearPopulationExposureCircles() {
    if (this.populationExposureLayers) {
      this.populationExposureLayers.forEach(l => {
        try {
          if (this.mode === 'google-api') l.setMap(null);
          else if (this.map) this.map.removeLayer(l);
        } catch(e) {}
      });
    }
    this.populationExposureLayers = [];
  }

  // Layer Visibility Control Method
  setLayerVisibility(layerKey, isVisible) {
    this.layerVisibility[layerKey] = isVisible;
    if (layerKey === 'firePerimeter') {
      if (!isVisible) this.clearFirePerimeter();
    } else if (layerKey === 'spreadSimulation') {
      if (!isVisible) this.clearSpreadSimulation();
    } else if (layerKey === 'vulnerableLocations') {
      if (!isVisible) this.clearVulnerableLocations();
    } else if (layerKey === 'populationExposure') {
      if (!isVisible) this.clearPopulationExposureCircles();
    }
  }

  // --- Invalidate Map Size to prevent tile overlap, clipping, or grey tiles ---
  invalidateSize() {
    if (!this.map) return;
    try {
      if (this.mode === 'google-api') {
        if (typeof google !== 'undefined' && google.maps && google.maps.event) {
          google.maps.event.trigger(this.map, 'resize');
        }
      } else {
        if (this.map && typeof this.map.invalidateSize === 'function') {
          this.map.invalidateSize({ pan: false, debounceMoveEvents: true });
        }
      }
    } catch (err) {
      console.warn('[MAP ENGINE] Error in invalidateSize:', err);
    }
  }
}

window.forestMapEngine = new ForestGuardMapEngine();
