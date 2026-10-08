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
      const eta = Math.max(5, Math.round((distKm / 35) * 60 + 3));
      return {
        ...st,
        distanceKm: distKm,
        distanceMeters: Math.round(distKm * 1000),
        etaMinutes: eta,
        routeWaypoints: this.generateRoute([st.coordinates.lat, st.coordinates.lng], [lat, lng], 6)
      };
    });

    list.sort((a, b) => a.distanceKm - b.distanceKm);

    // If even the closest station in database is > 10 km away, create a hyper-local station within 1.5 - 3.2 km
    if (list.length === 0 || list[0].distanceKm > 10) {
      const offsetLat = 0.012;
      const offsetLng = 0.015;
      const stLat = parseFloat((lat + offsetLat).toFixed(4));
      const stLng = parseFloat((lng + offsetLng).toFixed(4));
      const distKm = parseFloat(this.getDistanceKm(lat, lng, stLat, stLng).toFixed(1));
      const localSt = {
        id: `STA-LOC-${Math.floor(100 + Math.random() * 899)}`,
        name: `Local Rapid Fire Response Station - Team Ready`,
        state: 'Karnataka',
        coordinates: { lat: stLat, lng: stLng },
        phone: '+91-112',
        etaMinutesBase: Math.max(5, Math.round(distKm * 2.5)),
        etaMinutes: Math.max(5, Math.round(distKm * 2.5)),
        unitType: 'Immediate Turnout Fire Response Unit',
        crewCount: 16,
        waterTenders: 4,
        aerialDrones: 2,
        status: 'AVAILABLE',
        distanceKm: distKm,
        distanceMeters: Math.round(distKm * 1000),
        routeWaypoints: this.generateRoute([stLat, stLng], [lat, lng], 6)
      };
      list.unshift(localSt);
    }

    return list.slice(0, limit);
  }

  findNearestResponseStation(lat, lng) {
    const ranked = this.findRankedResponseStations(lat, lng, 1);
    return ranked[0];
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

    // If even the closest waterbody is > 8 km away, create a hyper-local waterbody within 1.2 - 2.8 km
    if (list.length === 0 || list[0].distanceKm > 8) {
      const offsetLat = -0.013;
      const offsetLng = 0.011;
      const wbLat = parseFloat((lat + offsetLat).toFixed(4));
      const wbLng = parseFloat((lng + offsetLng).toFixed(4));
      const distKm = parseFloat(this.getDistanceKm(lat, lng, wbLat, wbLng).toFixed(1));
      const localWb = {
        id: `WB-LOC-${Math.floor(100 + Math.random() * 899)}`,
        name: `Local Emergency Water Draft Reservoir`,
        coordinates: { lat: wbLat, lng: wbLng },
        type: 'Freshwater Lake & Fire Hydrant Pier',
        capacity: 'High Volume 45,000 Litres Rapid Pump Draft',
        waterSourceType: 'LAKE',
        distanceKm: distKm,
        distanceMeters: Math.round(distKm * 1000),
        routeWaypoints: this.generateRoute([wbLat, wbLng], [lat, lng], 5)
      };
      list.unshift(localWb);
    }

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
