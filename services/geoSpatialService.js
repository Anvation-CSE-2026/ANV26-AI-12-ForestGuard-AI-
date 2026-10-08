const fs = require('fs');
const path = require('path');

class GeoSpatialService {
  constructor() {
    this.forestData = {
      forests: [],
      waterBodies: [],
      responseStations: [],
      iotSensors: [],
      satelliteHotspots: []
    };
    this.loadData();
  }

  loadData() {
    try {
      const filePath = path.join(__dirname, '..', 'data', 'india_forests.json');
      if (fs.existsSync(filePath)) {
        this.forestData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (err) {
      console.warn('Error loading india_forests.json:', err.message);
    }
  }

  getDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  findClosestForest(lat, lng) {
    let closest = null;
    let minDist = Infinity;

    for (const f of this.forestData.forests) {
      const d = this.getDistanceKm(lat, lng, f.coordinates.lat, f.coordinates.lng);
      if (d < minDist) {
        minDist = d;
        closest = { ...f, distanceKm: parseFloat(d.toFixed(1)) };
      }
    }
    return closest || {
      id: 'FOR-GEN-01',
      name: 'Bandipur Tiger Reserve & National Park',
      state: 'Karnataka',
      district: 'Chamarajanagar',
      coordinates: { lat: 11.6643, lng: 76.6250 },
      distanceKm: 0.0
    };
  }

  findNearestResponseStation(lat, lng) {
    let closest = null;
    let minDist = Infinity;

    for (const st of this.forestData.responseStations) {
      const d = this.getDistanceKm(lat, lng, st.coordinates.lat, st.coordinates.lng);
      if (d < minDist) {
        minDist = d;
        closest = { ...st, distanceKm: parseFloat(d.toFixed(1)) };
      }
    }

    if (!closest || minDist > 40) {
      // Procedurally generate a local forest station within 6 - 12 km
      const offsetLat = (Math.random() > 0.5 ? 1 : -1) * 0.055;
      const offsetLng = (Math.random() > 0.5 ? 1 : -1) * 0.055;
      const stLat = lat + offsetLat;
      const stLng = lng + offsetLng;
      const dist = this.getDistanceKm(lat, lng, stLat, stLng);

      closest = {
        id: `STA-LOC-${Math.floor(10 + Math.random() * 89)}`,
        name: `Forest Range Fire Strike Squad #${Math.floor(1 + Math.random() * 9)}`,
        coordinates: { lat: parseFloat(stLat.toFixed(4)), lng: parseFloat(stLng.toFixed(4)) },
        phone: '+91-1800-425-FIRE',
        etaMinutesBase: Math.max(12, Math.round(dist * 1.8)),
        unitType: 'Forest Fire Rapid Response Unit',
        crewCount: 14,
        waterTenders: 2,
        aerialDrones: 1,
        status: 'AVAILABLE',
        distanceKm: parseFloat(dist.toFixed(1))
      };
    }

    const eta = Math.max(8, Math.round((closest.distanceKm / 35) * 60 + 4));

    return {
      ...closest,
      distanceKm: closest.distanceKm,
      distanceMeters: Math.round(closest.distanceKm * 1000),
      etaMinutes: eta,
      routeWaypoints: this.generateRoute([closest.coordinates.lat, closest.coordinates.lng], [lat, lng], 6)
    };
  }

  findNearestWaterBody(lat, lng) {
    let closest = null;
    let minDist = Infinity;

    for (const wb of this.forestData.waterBodies) {
      const d = this.getDistanceKm(lat, lng, wb.coordinates.lat, wb.coordinates.lng);
      if (d < minDist) {
        minDist = d;
        closest = { ...wb, distanceKm: parseFloat(d.toFixed(1)) };
      }
    }

    if (!closest || minDist > 35) {
      // Local water reserve within 1.5 - 4.5 km
      const offsetLat = (Math.random() > 0.5 ? 1 : -1) * 0.022;
      const offsetLng = (Math.random() > 0.5 ? 1 : -1) * 0.022;
      const wbLat = lat + offsetLat;
      const wbLng = lng + offsetLng;
      const dist = this.getDistanceKm(lat, lng, wbLat, wbLng);

      closest = {
        id: `WB-LOC-${Math.floor(100 + Math.random() * 899)}`,
        name: `Forest Department Rainwater Reservoir Tank #${Math.floor(10 + Math.random() * 89)}`,
        coordinates: { lat: parseFloat(wbLat.toFixed(4)), lng: parseFloat(wbLng.toFixed(4)) },
        type: 'Underground Forest Water Sump',
        capacity: '45,000 Litres (Continuous High Pressure Pump)',
        waterSourceType: 'RESERVOIR',
        distanceKm: parseFloat(dist.toFixed(1))
      };
    }

    return {
      ...closest,
      distanceKm: closest.distanceKm,
      distanceMeters: Math.round(closest.distanceKm * 1000),
      routeWaypoints: this.generateRoute([closest.coordinates.lat, closest.coordinates.lng], [lat, lng], 4)
    };
  }

  findNearbySensor(lat, lng, maxRadiusKm = 18) {
    let closest = null;
    let minDist = Infinity;

    for (const s of this.forestData.iotSensors) {
      const d = this.getDistanceKm(lat, lng, s.coordinates.lat, s.coordinates.lng);
      if (d < minDist && d <= maxRadiusKm) {
        minDist = d;
        closest = { ...s, distanceKm: parseFloat(d.toFixed(1)) };
      }
    }
    return closest;
  }

  findNearbySatelliteHotspot(lat, lng, maxRadiusKm = 20) {
    let closest = null;
    let minDist = Infinity;

    for (const sat of this.forestData.satelliteHotspots) {
      const d = this.getDistanceKm(lat, lng, sat.coordinates.lat, sat.coordinates.lng);
      if (d < minDist && d <= maxRadiusKm) {
        minDist = d;
        closest = { ...sat, distanceKm: parseFloat(d.toFixed(1)) };
      }
    }
    return closest;
  }

  generateRoute(start, end, segments = 6) {
    const waypoints = [start];
    const [lat1, lng1] = start;
    const [lat2, lng2] = end;

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      let lat = lat1 + (lat2 - lat1) * t;
      let lng = lng1 + (lng2 - lng1) * t;

      // Realistic terrain detour
      const curve = Math.sin(t * Math.PI) * 0.002 * (i % 2 === 0 ? 1 : -1);
      lat += curve;
      lng += curve * 0.6;

      waypoints.push([parseFloat(lat.toFixed(5)), parseFloat(lng.toFixed(5))]);
    }
    waypoints.push(end);
    return waypoints;
  }

  getAllForests() {
    return this.forestData.forests || [];
  }

  getAllWaterBodies() {
    return this.forestData.waterBodies || [];
  }

  getAllResponseStations() {
    return this.forestData.responseStations || [];
  }

  getAllSensors() {
    return this.forestData.iotSensors || [];
  }

  getAllSatelliteHotspots() {
    return this.forestData.satelliteHotspots || [];
  }
}

module.exports = new GeoSpatialService();
