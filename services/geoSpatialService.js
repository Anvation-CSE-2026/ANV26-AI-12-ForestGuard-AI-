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
    this.findRankedResponseStations = this.findRankedResponseStations.bind(this);
    this.findNearestResponseStation = this.findNearestResponseStation.bind(this);
    this.findRankedWaterBodies = this.findRankedWaterBodies.bind(this);
    this.findNearestWaterBody = this.findNearestWaterBody.bind(this);
    this.findClosestForest = this.findClosestForest.bind(this);
    this.generateRoute = this.generateRoute.bind(this);
    this.getDistanceKm = this.getDistanceKm.bind(this);
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

  findRankedResponseStations(lat, lng, limit = 4) {
    let list = (this.forestData.responseStations || []).map(st => {
      const d = this.getDistanceKm(lat, lng, st.coordinates.lat, st.coordinates.lng);
      const distKm = parseFloat(d.toFixed(1));
      const eta = Math.max(4, Math.round((distKm / 35) * 60 + 2));
      return {
        ...st,
        distanceKm: distKm,
        distanceMeters: Math.round(distKm * 1000),
        etaMinutes: eta,
        routeWaypoints: this.generateRoute([st.coordinates.lat, st.coordinates.lng], [lat, lng], 6)
      };
    });

    list.sort((a, b) => a.distanceKm - b.distanceKm);
    return list.slice(0, limit);
  }

  findNearestResponseStation(lat, lng) {
    const ranked = this.findRankedResponseStations(lat, lng, 1);
    return ranked[0] || {
      id: 'STA-KA-01',
      name: 'Bandipur Range Forest Office & Fire Command (HQ)',
      coordinates: { lat: 11.6617, lng: 76.6272 },
      distanceKm: 0.9,
      etaMinutes: 4,
      phone: '+91-8229-236021'
    };
  }

  findRankedWaterBodies(lat, lng, limit = 3) {
    let list = (this.forestData.waterBodies || []).map(wb => {
      const d = this.getDistanceKm(lat, lng, wb.coordinates.lat, wb.coordinates.lng);
      const distKm = parseFloat(d.toFixed(1));
      return {
        ...wb,
        distanceKm: distKm,
        distanceMeters: Math.round(distKm * 1000),
        routeWaypoints: this.generateRoute([wb.coordinates.lat, wb.coordinates.lng], [lat, lng], 5)
      };
    });

    list.sort((a, b) => a.distanceKm - b.distanceKm);
    return list.slice(0, limit);
  }

  findNearestWaterBody(lat, lng) {
    const ranked = this.findRankedWaterBodies(lat, lng, 1);
    return ranked[0];
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

  generateRoute(start, end) {
    // Direct straight line without sawtooth zig-zag detour
    return [start, end];
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
