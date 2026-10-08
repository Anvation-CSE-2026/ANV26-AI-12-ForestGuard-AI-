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
      water: [],
      sensors: [],
      satellites: []
    };
    this.routes = [];
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

    this.map = L.map(elementId, {
      center: [coords.lat, coords.lng],
      zoom: zoom,
      zoomControl: true
    });

    // High-resolution Google Hybrid Satellite & Roads Tiles
    this.googleHybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: 'Map & Imagery &copy; Google Maps'
    }).addTo(this.map);

    this.darkTacticalLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
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

  // --- Add Fire Incident Marker (RED Pulsing / ORANGE / YELLOW / GREEN) ---
  addFireMarker(incident, onClickCallback) {
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
      const icon = L.divIcon({
        className: 'custom-map-marker marker-purple',
        html: `<div class="station-badge-marker" style="background:#9333ea; border:2px solid #fff; box-shadow:0 0 14px #9333ea;">🚒</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      const marker = L.marker([lat, lng], { icon }).addTo(this.map);
      marker.bindPopup(`<b>${station.name}</b><br><span style="color:#a855f7;">Forest Response Unit (PURPLE)</span>`);
      marker.on('click', () => onClickCallback && onClickCallback(station));
      this.markers.stations.push(marker);
      return marker;
    }
  }

  // --- Add Water Body Marker (BLUE) ---
  addWaterMarker(water, onClickCallback) {
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
  drawRoute(waypoints, color = '#ff6a00', isDashed = false) {
    if (this.mode === 'google-api') {
      const gWaypoints = waypoints.map(w => ({ lat: w[0], lng: w[1] }));
      const polyline = new google.maps.Polyline({
        path: gWaypoints,
        geodesic: true,
        strokeColor: color,
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map: this.map
      });
      this.routes.push(polyline);
      return polyline;
    } else {
      const polyline = L.polyline(waypoints, {
        color: color,
        weight: 4,
        opacity: 0.9,
        dashArray: isDashed ? '6, 6' : undefined
      }).addTo(this.map);
      this.routes.push(polyline);
      return polyline;
    }
  }

  clearRoutes() {
    if (this.mode === 'google-api') {
      this.routes.forEach(r => r.setMap(null));
    } else {
      this.routes.forEach(r => this.map.removeLayer(r));
    }
    this.routes = [];
    this.clearVehicleMarker();
  }

  clearVehicleMarker() {
    if (this.teamVehicleMarker) {
      try {
        if (this.mode === 'google-api') this.teamVehicleMarker.setMap(null);
        else this.map.removeLayer(this.teamVehicleMarker);
      } catch (e) {}
      this.teamVehicleMarker = null;
    }
  }

  clearMarkers(category = 'all') {
    const clearList = (list) => {
      list.forEach(m => {
        if (this.mode === 'google-api') m.setMap(null);
        else this.map.removeLayer(m);
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
  // --- Draw Radius Circles (500m, 1km, 5km) (Section 11) ---
  drawRadiusCircles(lat, lng, radii = [500, 1000, 5000]) {
    this.clearCircles();
    this.circles = [];

    const colors = [
      { color: '#ef4444', fill: 'rgba(239, 68, 68, 0.15)', name: '500m Hot Zone' },
      { color: '#f97316', fill: 'rgba(249, 115, 22, 0.08)', name: '1km Buffer Perimeter' },
      { color: '#eab308', fill: 'rgba(234, 179, 8, 0.04)', name: '5km Response Sector' }
    ];

    radii.forEach((radiusMeters, idx) => {
      const col = colors[idx] || colors[0];
      if (this.mode === 'google-api') {
        const circle = new google.maps.Circle({
          strokeColor: col.color,
          strokeOpacity: 0.8,
          strokeWeight: 1.5,
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
          weight: 1.5,
          fillColor: col.color,
          fillOpacity: 0.08,
          dashArray: '5, 5'
        }).addTo(this.map);
        circle.bindTooltip(col.name, { permanent: false, direction: 'top' });
        this.circles.push(circle);
      }
    });
  }

  clearCircles() {
    if (this.circles) {
      this.circles.forEach(c => {
        if (this.mode === 'google-api') c.setMap(null);
        else this.map.removeLayer(c);
      });
    }
    this.circles = [];
  }

  // --- Live Response Team Vehicle Marker (Section 17) ---
  updateTeamVehicleMarker(lat, lng, label = 'Team 04') {
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
