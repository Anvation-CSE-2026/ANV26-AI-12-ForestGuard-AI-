const fs = require('fs');
const path = require('path');
const riskEngine = require('./riskEngine');
const geoSpatialService = require('./geoSpatialService');

class IncidentStore {
  constructor() {
    this.dbFilePath = path.join(__dirname, '..', 'data', 'forestguard_db.json');
    this.incidents = new Map();
    this.sensors = new Map();
    this.loadFromDisk();
    if (this.incidents.size === 0) {
      this.seedInitialIncidents();
    }
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.incidents && Array.isArray(data.incidents)) {
          data.incidents.forEach(inc => this.incidents.set(inc.incidentId, inc));
        }
      }
    } catch (err) {
      console.warn('Error reading forestguard_db.json:', err.message);
    }
  }

  saveToDisk() {
    try {
      const dir = path.dirname(this.dbFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const data = {
        incidents: Array.from(this.incidents.values()),
        lastSaved: new Date().toISOString()
      };
      fs.writeFileSync(this.dbFilePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.warn('Error saving forestguard_db.json:', err.message);
    }
  }

  seedInitialIncidents() {
    // Exact seed specified in prompt: FG-2026-1048 Bandipur Forest Region
    const bandipurCoords = { lat: 11.6643, lng: 76.6250 };
    const station = geoSpatialService.findNearestResponseStation(bandipurCoords.lat, bandipurCoords.lng);
    const water = geoSpatialService.findNearestWaterBody(bandipurCoords.lat, bandipurCoords.lng);

    const initialIncident = {
      incidentId: 'FG-2026-1048',
      source: 'Citizen Photo + AI',
      imageUrl: '/sample_images/sample_wildfire.jpg',
      latitude: bandipurCoords.lat,
      longitude: bandipurCoords.lng,
      forestName: 'Bandipur Forest Region',
      state: 'Karnataka',
      district: 'Chamarajanagar',
      aiConfidence: 94.6,
      severity: 'CRITICAL',
      riskScore: 96,
      satelliteConfidence: 89.2,
      sensorConfidence: 94.0,
      status: 'NEW', // NEW -> UNDER_VERIFICATION -> VERIFIED -> RESPONSE_DISPATCHED -> CONTAINED
      aiExplanation: 'Smoke and flame-like visual patterns detected in the uploaded image. Image classification indicates a high probability of forest fire with rapid crown propagation risk.',
      affectedAreaHectares: 2.4,
      detectedFeatures: ['Flames', 'Smoke', 'Heat-like region', 'Vegetation'],
      featureBreakdown: [
        { name: 'Flames', detected: true, confidence: 95.0 },
        { name: 'Smoke', detected: true, confidence: 92.0 },
        { name: 'Heat-like region', detected: true, confidence: 96.0 },
        { name: 'Vegetation', detected: true, confidence: 88.0 },
        { name: 'Haze', detected: false, confidence: 15.0 },
        { name: 'Cloud', detected: false, confidence: 8.0 }
      ],
      multiSourceSummary: '3 SOURCES CONFIRM POTENTIAL FIRE (Citizen + Satellite + IoT)',
      nearestStation: station,
      nearestWaterBody: water,
      reporter: {
        name: 'K. Ramesh (Forest Eco-Guide)',
        phone: '+91-94481-22904',
        notes: 'Dense smoke visible rising above Bandipur Range III teak canopies.'
      },
      assignedTeam: null,
      timeline: [
        { time: '10:48:21 AM', message: 'New citizen report received from Bandipur Forest Region', type: 'REPORT' },
        { time: '10:48:22 AM', message: 'Photographic evidence ingested into AI Pipeline', type: 'INGEST' },
        { time: '10:48:24 AM', message: 'AI vision analysis completed: 94.6% confidence', type: 'AI' },
        { time: '10:48:25 AM', message: 'Satellite SNPP-VIIRS cross-referenced: Hotspot confirmed (89.2%)', type: 'SATELLITE' },
        { time: '10:48:26 AM', message: 'IoT Sensor FS-KA-042 threshold confirmed: Temp 48.2°C, Smoke 78%', type: 'IOT' },
        { time: '10:48:27 AM', message: 'Multi-source risk computed: 96/100 (CRITICAL). Admin alert dispatched.', type: 'ALERT' },
        { time: '10:48:30 AM', message: 'Nearest response team identified: Bandipur Forest Unit (8.7 km, ETA 18 min)', type: 'ROUTING' }
      ],
      createdAt: new Date(Date.now() - 360000).toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.incidents.set(initialIncident.incidentId, initialIncident);
    this.saveToDisk();
  }

  createIncident(data) {
    const nextSeq = Math.floor(1000 + Math.random() * 9000);
    const incidentId = `FG-2026-${nextSeq}`;
    const timestampStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    // Geospatial Context Lookup
    const forest = geoSpatialService.findClosestForest(data.latitude, data.longitude);
    const station = geoSpatialService.findNearestResponseStation(data.latitude, data.longitude);
    const water = geoSpatialService.findNearestWaterBody(data.latitude, data.longitude);
    const sensor = geoSpatialService.findNearbySensor(data.latitude, data.longitude);
    const satellite = geoSpatialService.findNearbySatelliteHotspot(data.latitude, data.longitude);

    // Multi-Source Risk Evaluation
    const riskResult = riskEngine.calculateRisk({
      aiConfidence: data.aiConfidence || 92.0,
      fireDetected: data.fireDetected !== false,
      nearestSatellite: satellite,
      nearestSensor: sensor,
      source: data.source || 'Citizen Photo'
    });

    const newIncident = {
      incidentId,
      source: data.source || 'Citizen Photo',
      imageUrl: data.imageUrl || '/sample_images/sample_wildfire.jpg',
      latitude: data.latitude,
      longitude: data.longitude,
      forestName: data.forestName || forest.name,
      state: data.state || forest.state,
      district: forest.district || '',
      aiConfidence: data.aiConfidence || 94.6,
      severity: riskResult.severity,
      riskScore: riskResult.combinedRiskScore,
      satelliteConfidence: satellite ? satellite.confidence : 0,
      sensorConfidence: sensor ? sensor.smokeIndex : 0,
      status: 'NEW',
      aiExplanation: data.aiExplanation || 'Visual signatures and spatial telemetry indicate thermal fire progression.',
      affectedAreaHectares: data.affectedAreaHectares || 1.8,
      detectedFeatures: data.detectedFeatures || ['Flames', 'Smoke'],
      featureBreakdown: data.featureBreakdown || [],
      multiSourceSummary: riskResult.verificationSummary,
      sourceBreakdown: riskResult.sourceBreakdown,
      nearestStation: station,
      nearestWaterBody: water,
      reporter: data.reporter || { name: 'Citizen Reporter', phone: 'Undisclosed' },
      assignedTeam: null,
      timeline: [
        { time: timestampStr, message: `New report submitted at ${forest.name} (${data.latitude}, ${data.longitude})`, type: 'REPORT' },
        { time: timestampStr, message: `AI Image Analysis: ${data.aiConfidence || 92}% confidence`, type: 'AI' },
        { time: timestampStr, message: `Multi-source risk: ${riskResult.combinedRiskScore}/100 (${riskResult.severity})`, type: 'RISK' },
        { time: timestampStr, message: riskResult.verificationSummary, type: 'MULTI_SOURCE' },
        { time: timestampStr, message: `Nearest response station: ${station.name} (${station.distanceKm} km)`, type: 'STATION' }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.incidents.set(incidentId, newIncident);
    this.saveToDisk();
    return newIncident;
  }

  getIncidentById(id) {
    return this.incidents.get(id);
  }

  getAllIncidents() {
    return Array.from(this.incidents.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  verifyIncident(id) {
    const inc = this.incidents.get(id);
    if (!inc) return null;
    inc.status = 'VERIFIED';
    inc.updatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    inc.timeline.push({ time: timeStr, message: 'Incident verified by Forest Operations Command', type: 'VERIFY' });
    this.saveToDisk();
    return inc;
  }

  dispatchResponse(id, payload = {}) {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    inc.status = 'RESPONSE_DISPATCHED';
    inc.updatedAt = new Date().toISOString();

    const team = {
      teamId: payload.teamId || inc.nearestStation?.id || 'STA-KA-01',
      name: payload.teamName || inc.nearestStation?.name || 'Forest Fire Rapid Response Unit 04',
      dispatchedAt: new Date().toISOString(),
      etaMinutes: payload.etaMinutes || inc.nearestStation?.etaMinutes || 18,
      notes: payload.notes || 'Forest Strike Fleet dispatched with water tenders and drones.'
    };

    inc.assignedTeam = team;
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    inc.timeline.push({ time: timeStr, message: `Response dispatched: ${team.name} (ETA: ${team.etaMinutes} mins)`, type: 'DISPATCH' });

    this.saveToDisk();
    return inc;
  }

  markFalsePositive(id) {
    const inc = this.incidents.get(id);
    if (!inc) return null;
    inc.status = 'FALSE_POSITIVE';
    inc.severity = 'LOW';
    inc.riskScore = 12;
    inc.updatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    inc.timeline.push({ time: timeStr, message: 'Marked as False Positive by Admin. Alert cleared.', type: 'STATUS' });
    this.saveToDisk();
    return inc;
  }

  markContained(id) {
    const inc = this.incidents.get(id);
    if (!inc) return null;
    inc.status = 'CONTAINED';
    inc.updatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    inc.timeline.push({ time: timeStr, message: 'Fire reported CONTAINED by ground forestry crews.', type: 'STATUS' });
    this.saveToDisk();
    return inc;
  }

  resolveIncident(id) {
    const inc = this.incidents.get(id);
    if (!inc) return null;
    inc.status = 'RESOLVED';
    inc.updatedAt = new Date().toISOString();
    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    inc.timeline.push({ time: timeStr, message: 'Incident fully RESOLVED and mopped up.', type: 'STATUS' });
    this.saveToDisk();
    return inc;
  }

  getStats() {
    const list = this.getAllIncidents();
    const critical = list.filter(i => i.severity === 'CRITICAL' && i.status !== 'RESOLVED');
    const high = list.filter(i => i.severity === 'HIGH' && i.status !== 'RESOLVED');
    const resolved = list.filter(i => i.status === 'RESOLVED');
    const falsePos = list.filter(i => i.status === 'FALSE_POSITIVE');
    const dispatched = list.filter(i => i.status === 'RESPONSE_DISPATCHED' || i.status === 'CONTAINED');

    // State distribution
    const stateCounts = {};
    list.forEach(i => {
      const s = i.state || 'Karnataka';
      stateCounts[s] = (stateCounts[s] || 0) + 1;
    });

    return {
      firesToday: list.length,
      criticalFires: critical.length,
      highRiskFires: high.length,
      resolvedFires: resolved.length,
      falsePositives: falsePos.length,
      activeDispatches: dispatched.length,
      onlineSensors: 84,
      avgResponseTimeMin: 16.4,
      avgAiConfidence: 93.8,
      stateBreakdown: stateCounts
    };
  }
}

module.exports = new IncidentStore();
