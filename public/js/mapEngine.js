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

    if (points.length === 1) {
      this.centerOn(fLat, fLng, 16);
      return;
    }

    if (this.mode === 'google-api') {
      const bounds = new google.maps.LatLngBounds();
      points.forEach(p => bounds.extend(new google.maps.LatLng(p[0], p[1])));
      this.map.fitBounds(bounds);
    } else {
      // Leaflet fitBounds ensuring BOTH the forest fire ground zero AND the fire station building are simultaneously visible
      this.map.fitBounds(points, {
        padding: [75, 75],
        maxZoom: 16,
        animate: true,
        duration: 1.4
      });
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
      const icon = L.divIcon({
        className: 'custom-map-marker marker-blue',
        html: `<div class="water-badge-marker" style="background:#0284c7; border:2px solid #38bdf8; box-shadow:0 0 14px #0284c7;">💧</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17]
      });
      const marker = L.marker([lat, lng], { icon }).addTo(this.map);
      marker.bindPopup(`<b>${water.name}</b><br><span style="color:#38bdf8;">Water Body / Drafting Source (BLUE)</span><br>${water.capacity || ''}`);
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
  drawRadiusCircles(lat, lng, radii = [500, 1500, 5000]) {
    this.clearCircles();
    this.circles = [];
    if (!this.map) return;

    const colors = [
      { color: '#ef4444', fill: 'rgba(239, 68, 68, 0.16)', name: '500m Hot Zone' },
      { color: '#f97316', fill: 'rgba(249, 115, 22, 0.09)', name: '1.5km Buffer Perimeter' },
      { color: '#eab308', fill: 'rgba(234, 179, 8, 0.05)', name: '5km Response Sector' }
    ];

    radii.forEach((radiusMeters, idx) => {
      const col = colors[idx] || colors[0];
      if (this.mode === 'google-api') {
        const circle = new google.maps.Circle({
          strokeColor: col.color,
          strokeOpacity: 0.85,
          strokeWeight: 1.8,
          fillColor: col.color,
          fillOpacity: 0.1,
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
          fillColor: col.color,
          fillOpacity: 0.09,
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
