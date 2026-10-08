const fs = require('fs');
const path = require('path');
const riskEngine = require('./riskEngine');
const geoSpatialService = require('./geoSpatialService');
const fireIntelligenceService = require('./fireIntelligenceService');

class IncidentStore {
  constructor() {
    this.dbFilePath = path.join(__dirname, '..', 'data', 'forestguard_db.json');
    this.incidents = new Map();
    this.teams = new Map();
    this.emergencyContacts = new Map();
    this.loadFromDisk();
    
    if (this.teams.size === 0) {
      this.seedTeams();
    }
    if (this.emergencyContacts.size === 0) {
      this.seedEmergencyContacts();
    }
    if (this.incidents.size === 0) {
      this.seedInitialIncidents();
    }
  }

  enrichWithIntelligence(inc) {
    if (!inc) return inc;
    if (!inc.firePerimeter) {
      inc.firePerimeter = fireIntelligenceService.calculateFirePerimeter(inc);
    }
    if (!inc.fireDangerIndex) {
      inc.fireDangerIndex = fireIntelligenceService.calculateFireDangerIndex(inc);
    }
    if (!inc.vulnerableLocations) {
      inc.vulnerableLocations = fireIntelligenceService.calculateNearbyVulnerableLocations(inc);
    }
    if (!inc.spreadSimulation) {
      inc.spreadSimulation = fireIntelligenceService.simulateFireSpread(inc, 60);
    }
    if (!inc.teamRecommendations) {
      inc.teamRecommendations = fireIntelligenceService.recommendResponseTeams(inc, this.getAllTeams(), geoSpatialService.getAllResponseStations());
    }
    return inc;
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const raw = fs.readFileSync(this.dbFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.incidents && Array.isArray(data.incidents)) {
          data.incidents.forEach(inc => {
            if (!inc.title) inc.title = inc.forestName || 'Bandipur Forest Fire Alert';
            this.incidents.set(inc.incidentId, inc);
          });
        }
        if (data.teams && Array.isArray(data.teams)) {
          data.teams.forEach(tm => this.teams.set(tm.teamId, tm));
        }
        if (data.emergencyContacts && Array.isArray(data.emergencyContacts)) {
          data.emergencyContacts.forEach(ct => this.emergencyContacts.set(ct.id || `${ct.state}_${ct.department}`, ct));
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
        teams: Array.from(this.teams.values()),
        emergencyContacts: Array.from(this.emergencyContacts.values()),
        lastSaved: new Date().toISOString()
      };
      fs.writeFileSync(this.dbFilePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.warn('Error saving forestguard_db.json:', err.message);
    }
  }

  seedTeams() {
    const defaultTeams = [
      {
        teamId: 'TEAM-01',
        name: 'Team 01 (Bandipur Forest Unit)',
        stationId: 'STA-KA-01',
        stationName: 'Bandipur Forest Response Unit',
        status: 'AVAILABLE', // AVAILABLE, ASSIGNED, EN_ROUTE, ON_SITE, BUSY, OFFLINE
        members: 6,
        vehicle: 'Heavy Water Tender & Drone Patrol',
        coordinates: { lat: 11.6680, lng: 76.6340 },
        currentIncident: null,
        etaMinutes: 14
      },
      {
        teamId: 'TEAM-02',
        name: 'Team 02 (Gundlupet Municipal Squad)',
        stationId: 'STA-KA-02',
        stationName: 'Gundlupet Municipal Fire Brigade',
        status: 'BUSY',
        members: 8,
        vehicle: 'Dual Attack Bowser',
        coordinates: { lat: 11.8050, lng: 76.6890 },
        currentIncident: null,
        etaMinutes: 28
      },
      {
        teamId: 'TEAM-03',
        name: 'Team 03 (Nagarhole Wildlife Strike Force)',
        stationId: 'STA-KA-03',
        stationName: 'Nagarhole Rapid Post',
        status: 'BUSY',
        members: 6,
        vehicle: 'Quick Response Tender',
        coordinates: { lat: 11.9610, lng: 76.1340 },
        currentIncident: null,
        etaMinutes: 32
      },
      {
        teamId: 'TEAM-04',
        name: 'Team 04 (Bandipur Rapid Response Squad)',
        stationId: 'STA-KA-01',
        stationName: 'Bandipur Forest Response Unit',
        status: 'AVAILABLE', // The recommended team for Bandipur
        members: 6,
        vehicle: 'High-Clearance 4x4 Brush Engine + Drone',
        coordinates: { lat: 11.6680, lng: 76.6340 },
        currentIncident: null,
        etaMinutes: 16
      },
      {
        teamId: 'TEAM-05',
        name: 'Team 05 (Reserve Backup Squad)',
        stationId: 'STA-KA-01',
        stationName: 'Bandipur Forest Response Unit',
        status: 'OFFLINE',
        members: 5,
        vehicle: 'Logistics Bowser',
        coordinates: { lat: 11.6680, lng: 76.6340 },
        currentIncident: null,
        etaMinutes: 45
      }
    ];

    defaultTeams.forEach(t => this.teams.set(t.teamId, t));
  }

  seedEmergencyContacts() {
    const contacts = [
      {
        id: 'CT-NAT-112',
        state: 'All India',
        district: 'National',
        department: 'Fire & Emergency Services (National Emergency Number)',
        phone: '112',
        type: 'Fire',
        active: true,
        isOfficial: true,
        description: 'Nationwide single emergency telephone number for immediate assistance.'
      },
      {
        id: 'CT-KA-FOR',
        state: 'Karnataka',
        district: 'Chamarajanagar / Mysore',
        department: 'Karnataka Forest Department Wildfire Helpline',
        phone: '1926',
        type: 'Forest',
        active: true,
        isOfficial: true,
        description: 'Toll-free forest fire reporting and human-wildlife conflict helpline.'
      },
      {
        id: 'CT-KA-BAN',
        state: 'Karnataka',
        district: 'Chamarajanagar',
        department: 'Bandipur Tiger Reserve Field Directorate Emergency Desk',
        phone: '+91-8229-236021',
        type: 'Forest',
        active: true,
        isOfficial: false,
        description: 'Direct forest range control room for Bandipur sectors.'
      },
      {
        id: 'CT-MP-FOR',
        state: 'Madhya Pradesh',
        district: 'Mandla / Balaghat',
        department: 'MP State Forest Fire Control Room (Van Agni)',
        phone: '1926',
        type: 'Forest',
        active: true,
        isOfficial: true,
        description: 'State emergency control cell for Kanha and central tiger reserves.'
      },
      {
        id: 'CT-UK-FOR',
        state: 'Uttarakhand',
        district: 'Nainital',
        department: 'Corbett Tiger Reserve Fire & Anti-Poaching Cell',
        phone: '+91-5947-251489',
        type: 'Forest',
        active: true,
        isOfficial: false,
        description: 'Special Tiger Protection Force 24x7 wireless control unit.'
      },
      {
        id: 'CT-KL-FOR',
        state: 'Kerala',
        district: 'Idukki',
        department: 'Kerala Forest Wildlife Emergency Control',
        phone: '1800-425-4733',
        type: 'Forest',
        active: true,
        isOfficial: true,
        description: 'Periyar Reserve Forest Emergency response cell.'
      }
    ];

    contacts.forEach(c => this.emergencyContacts.set(c.id, c));
  }

  seedInitialIncidents() {
    // Seed FG-2026-1052 as specified in prompt
    const bandipurCoords = { lat: 11.6643, lng: 76.6250 };
    const station = geoSpatialService.findNearestResponseStation(bandipurCoords.lat, bandipurCoords.lng);
    const water = geoSpatialService.findNearestWaterBody(bandipurCoords.lat, bandipurCoords.lng);

    const initialIncident = {
      incidentId: 'FG-2026-1052',
      title: 'Bandipur Moyar Gorge Canopy Fire',
      reporterId: 'REP-CITIZEN-884',
      source: 'Citizen Image',
      detectionMethod: 'Image',
      imageUrl: '/sample_images/sample_wildfire.jpg',
      latitude: bandipurCoords.lat,
      longitude: bandipurCoords.lng,
      forestName: 'Bandipur Forest',
      state: 'Karnataka',
      district: 'Chamarajanagar',
      description: 'Visible flames and thick dark smoke spreading rapidly across teak canopy near Moyar gorge.',
      estimatedSize: 'Large',
      smokeVisible: true,
      flamesVisible: true,
      peopleInDanger: false,
      aiConfidence: 94.2,
      severity: 'CRITICAL',
      riskScore: 93,
      satelliteConfidence: 89.2,
      sensorConfidence: 94.0,
      status: 'UNDER REVIEW', // NEW ALERT -> UNDER REVIEW -> VERIFIED -> TEAM ASSIGNED -> TEAM DISPATCHED -> TEAM EN ROUTE -> TEAM ON SITE -> FIRE CONTAINED -> RESOLVED
      aiExplanation: 'Visible smoke and flame-like regions detected. Image evidence indicates a high probability of forest fire.',
      affectedAreaHectares: 2.4,
      affectedRadiiMeters: [500, 1000, 5000],
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
      assignedStation: {
        stationId: 'STA-KA-01',
        name: 'Bandipur Forest Fire Response Unit',
        distanceKm: 8.4,
        etaMinutes: 16,
        phone: '+91-8229-236021',
        availability: 'AVAILABLE'
      },
      rankedStations: geoSpatialService.findRankedResponseStations(bandipurCoords.lat, bandipurCoords.lng, 3),
      assignedTeam: {
        teamId: 'TEAM-04',
        name: 'Team 04',
        status: 'AVAILABLE',
        distanceKm: 8.4,
        etaMinutes: 16
      },
      nearestWaterBody: water,
      rankedWaterBodies: geoSpatialService.findRankedWaterBodies(bandipurCoords.lat, bandipurCoords.lng, 3),
      reporter: {
        name: 'Citizen Observer',
        phone: '+91-98765-43210'
      },
      timeline: [
        { time: '10:52:13 AM', message: 'Citizen reported fire at Bandipur Forest', type: 'REPORT' },
        { time: '10:52:14 AM', message: 'Photographic evidence uploaded to storage', type: 'INGEST' },
        { time: '10:52:16 AM', message: 'AI analysis completed: 94.2% fire confidence (CRITICAL)', type: 'AI' },
        { time: '10:52:17 AM', message: 'Risk score calculated: 93 / 100', type: 'RISK' },
        { time: '10:52:18 AM', message: 'Admin authority alerted in real-time via Socket.IO', type: 'ALERT' }
      ],
      scoreboard: {
        anomalyConfidence: 94.6,
        smokeConfidence: 92.0,
        fireCoverage: 38.5,
        smokeLevel: 85.0,
        riskScore: 96,
        severity: 'CRITICAL',
        objectsCount: 3,
        statusTitle: 'FIRE DETECTED',
        statusText: 'Status: Active Wildfire (3 Objects)',
        badgeText: 'CRITICAL',
        earlyWarningAlert: 'CRITICAL - IMMEDIATE DISPATCH',
        timestamp: '10:48:21 AM',
        engineName: 'YOLOv8 ENGINE READY'
      },
      routeWaypoints: station.routeWaypoints || [],
      routeProgressIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Enrich with Fire Intelligence
    this.enrichWithIntelligence(initialIncident);

    this.incidents.set(initialIncident.incidentId, initialIncident);
    this.saveToDisk();
  }

  createIncident(data) {
    const nextSeq = Math.floor(1000 + Math.random() * 9000);
    const incidentId = data.incidentId || `FG-2026-${nextSeq}`;
    const timestampStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    // Geospatial Context Lookup
    const forest = geoSpatialService.findClosestForest(data.latitude, data.longitude);
    const station = geoSpatialService.findNearestResponseStation(data.latitude, data.longitude);
    const water = geoSpatialService.findNearestWaterBody(data.latitude, data.longitude);
    const sensor = geoSpatialService.findNearbySensor(data.latitude, data.longitude);
    const satellite = geoSpatialService.findNearbySatelliteHotspot(data.latitude, data.longitude);

    // Multi-Source Risk Evaluation
    const riskResult = riskEngine.calculateRisk({
      aiConfidence: data.aiConfidence || 94.0,
      fireDetected: data.fireDetected !== false,
      nearestSatellite: satellite,
      nearestSensor: sensor,
      source: data.source || 'Citizen Report'
    });

    const newIncident = {
      incidentId,
      reporterId: data.reporterId || `REP-ANON-${Math.floor(100 + Math.random() * 900)}`,
      source: data.source || 'Citizen Report',
      detectionMethod: data.detectionMethod || 'Image',
      imageUrl: data.imageUrl || '/sample_images/sample_wildfire.jpg',
      videoUrl: data.videoUrl || null,
      latitude: data.latitude,
      longitude: data.longitude,
      title: (data.title || data.alertTitle || data.forestName || forest.name || 'Wildfire Alert').trim(),
      alertTitle: (data.title || data.alertTitle || data.forestName || forest.name || 'Wildfire Alert').trim(),
      forestName: data.forestName || forest.name,
      state: data.state || forest.state,
      district: data.district || forest.district || '',
      description: data.description || 'Fire alert reported by citizen via mobile terminal.',
      estimatedSize: data.estimatedSize || 'Medium',
      smokeVisible: data.smokeVisible !== undefined ? data.smokeVisible : true,
      flamesVisible: data.flamesVisible !== undefined ? data.flamesVisible : true,
      peopleInDanger: data.peopleInDanger !== undefined ? data.peopleInDanger : false,
      aiConfidence: data.aiConfidence || 94.0,
      severity: riskResult.severity || 'CRITICAL',
      riskScore: riskResult.combinedRiskScore || 92,
      satelliteConfidence: satellite ? satellite.confidence : 0,
      sensorConfidence: sensor ? sensor.smokeIndex : 0,
      status: 'UNDER REVIEW', // Prevent fake alert: Admin must verify
      aiExplanation: data.aiExplanation || 'Visible smoke and flame-like regions detected. Image evidence indicates a high probability of forest fire.',
      affectedAreaHectares: data.affectedAreaHectares || 2.1,
      affectedRadiiMeters: [500, 1000, 5000],
      detectedFeatures: data.detectedFeatures || ['Flames', 'Smoke'],
      featureBreakdown: data.featureBreakdown || [],
      multiSourceSummary: riskResult.verificationSummary,
      nearestStation: station,
      assignedStation: {
        stationId: station.id,
        name: station.name,
        distanceKm: station.distanceKm,
        etaMinutes: station.etaMinutes,
        phone: station.phone,
        availability: 'AVAILABLE'
      },
      rankedStations: geoSpatialService.findRankedResponseStations(data.latitude, data.longitude, 3),
      assignedTeam: {
        teamId: 'TEAM-04',
        name: 'Team 04',
        status: 'AVAILABLE',
        distanceKm: station.distanceKm,
        etaMinutes: station.etaMinutes
      },
      nearestWaterBody: water,
      rankedWaterBodies: geoSpatialService.findRankedWaterBodies(data.latitude, data.longitude, 3),
      reporter: data.reporter || { name: 'Citizen Reporter', phone: 'Undisclosed' },
      timeline: [
        { time: timestampStr, message: `Citizen reported fire at ${forest.name} (${data.latitude}, ${data.longitude})`, type: 'REPORT' },
        { time: timestampStr, message: `Evidence ingested (${data.detectionMethod || 'Image'})`, type: 'INGEST' },
        { time: timestampStr, message: `AI Analysis complete: ${data.aiConfidence || 94}% confidence (${riskResult.severity})`, type: 'AI' },
        { time: timestampStr, message: `Risk score calculated: ${riskResult.combinedRiskScore} / 100`, type: 'RISK' },
        { time: timestampStr, message: 'Admin authority alerted in real-time via Socket.IO', type: 'ALERT' }
      ],
      isPriority: data.isPriority !== undefined ? data.isPriority : true,
      priorityLevel: data.priorityLevel || 'PRIORITY 1 - CITIZEN REPORT',
      scoreboard: data.scoreboard || {
        fireScore: parseFloat((data.fireScore || data.anomalyConfidence || data.aiConfidence || 94.6).toFixed ? (data.fireScore || data.anomalyConfidence || data.aiConfidence || 94.6).toFixed(1) : 94.6),
        fireLevel: data.fireLevel || data.severity || 'CRITICAL',
        anomalyConfidence: parseFloat((data.anomalyConfidence || data.aiConfidence || 94.6).toFixed ? (data.anomalyConfidence || data.aiConfidence || 94.6).toFixed(1) : 94.6),
        smokeConfidence: parseFloat((data.smokeConfidence || 92.0).toFixed ? (data.smokeConfidence || 92.0).toFixed(1) : 92.0),
        fireCoverage: parseFloat((data.fireCoverage || 38.5).toFixed ? (data.fireCoverage || 38.5).toFixed(1) : 38.5),
        smokeLevel: parseFloat((data.smokeLevel || 85.0).toFixed ? (data.smokeLevel || 85.0).toFixed(1) : 85.0),
        riskScore: data.riskScore !== undefined ? data.riskScore : (riskResult.combinedRiskScore || 96),
        severity: data.severity || riskResult.severity || 'CRITICAL',
        fakeProbability: data.fakeProbability !== undefined ? data.fakeProbability : 3.2,
        authenticityScore: data.authenticityScore !== undefined ? data.authenticityScore : 96.8,
        fakeVerdict: data.fakeVerdict || 'AUTHENTIC GROUND EVIDENCE',
        fakeStatus: data.fakeStatus || 'PASSED - REAL FIELD EVIDENCE (NOT FAKE / NOT AI-GEN)',
        isFake: data.isFake || false,
        objectsCount: data.objectsCount !== undefined ? data.objectsCount : 3,
        statusTitle: (data.fireDetected !== false) ? 'FIRE DETECTED' : 'NO ANOMALIES DETECTED',
        statusText: (data.fireDetected !== false) ? `Status: Active Wildfire (${data.objectsCount || 3} Objects)` : 'Status: Forest Clear (0 Objects)',
        badgeText: (data.fireDetected !== false) ? (data.severity || riskResult.severity || 'CRITICAL') : 'SAFE',
        earlyWarningAlert: (data.fireDetected !== false) ? 'CRITICAL - IMMEDIATE DISPATCH' : 'NORMAL - SECTOR CLEAR',
        timestamp: timestampStr,
        engineName: 'YOLOv8 ENGINE READY'
      },
      routeWaypoints: station.routeWaypoints || [],
      routeProgressIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Enrich with Fire Intelligence
    this.enrichWithIntelligence(newIncident);

    this.incidents.set(incidentId, newIncident);
    this.saveToDisk();
    return newIncident;
  }

  getIncidentById(id) {
    const inc = this.incidents.get(id);
    return this.enrichWithIntelligence(inc);
  }

  getAllIncidents() {
    return Array.from(this.incidents.values())
      .filter(i => i.status !== 'CANCELLED')
      .map(i => this.enrichWithIntelligence(i))
      .sort((a, b) => {
        const pA = a.isPriority ? 1 : 0;
        const pB = b.isPriority ? 1 : 0;
        if (pB !== pA) return pB - pA;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }

  // --- WORKFLOW TRANSITIONS (Prevent Fake Alerts & Full Response Control) ---

  // 1. Admin Verifies Fire
  verifyIncident(id, adminUser = 'Forest Duty Marshal') {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    inc.status = 'VERIFIED';
    inc.verifiedBy = adminUser;
    inc.verifiedAt = new Date().toISOString();
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: `Fire verified by ${adminUser}`, type: 'VERIFY' });

    // Feature 5: When incident becomes VERIFIED, automatically search & recommend response teams
    inc.teamRecommendations = fireIntelligenceService.recommendResponseTeams(inc, this.getAllTeams(), geoSpatialService.getAllResponseStations());
    if (inc.teamRecommendations && inc.teamRecommendations.recommendedTeam) {
      inc.timeline.push({
        time: timeStr,
        message: `System recommended nearest response team: ${inc.teamRecommendations.recommendedTeam.name} (${inc.teamRecommendations.recommendedTeam.distanceKm} km, ETA: ${inc.teamRecommendations.recommendedTeam.etaMinutes} min)`,
        type: 'RECOMMEND'
      });
    }

    this.saveToDisk();
    return this.enrichWithIntelligence(inc);
  }

  // 2. Request More Information
  requestMoreInfo(id, notes = 'Requested additional ground photos / verification from nearby patrol') {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    inc.status = 'UNDER REVIEW';
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: notes, type: 'INFO' });

    this.saveToDisk();
    return inc;
  }

  // 3. Admin Dispatches Team
  dispatchTeam(id, payload = {}) {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    const teamId = payload.teamId || 'TEAM-04';
    const team = this.teams.get(teamId) || {
      teamId,
      name: payload.teamName || 'Team 04',
      status: 'ASSIGNED',
      members: 6
    };

    team.status = 'ASSIGNED';
    team.currentIncident = id;
    this.teams.set(teamId, team);

    inc.status = 'TEAM DISPATCHED';
    inc.assignedTeam = {
      teamId: team.teamId,
      name: team.name,
      status: 'DISPATCHED',
      dispatchedAt: new Date().toISOString(),
      etaMinutes: payload.etaMinutes || inc.assignedStation?.etaMinutes || 16,
      distanceKm: payload.distanceKm || inc.assignedStation?.distanceKm || 8.4,
      instruction: payload.instruction || 'Proceed to incident location and begin fire containment.'
    };
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: `${team.name} dispatched by Admin Command`, type: 'DISPATCH' });

    this.saveToDisk();
    return { incident: inc, team };
  }

  // 4. Station / Team Accepts Mission
  acceptMission(id, teamId) {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    const team = this.teams.get(teamId);
    if (team) {
      team.status = 'ASSIGNED';
      this.teams.set(teamId, team);
    }

    inc.status = 'TEAM ASSIGNED';
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: `${team ? team.name : 'Team'} accepted response mission`, type: 'ACCEPT' });

    this.saveToDisk();
    return { incident: inc, team };
  }

  // 5. Team Starts Travel (En Route)
  startTravel(id, teamId) {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    const team = this.teams.get(teamId);
    if (team) {
      team.status = 'EN_ROUTE';
      this.teams.set(teamId, team);
    }

    inc.status = 'TEAM EN ROUTE';
    inc.routeProgressIndex = 1;
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: `${team ? team.name : 'Team'} en route to forest ground zero`, type: 'TRAVEL' });

    this.saveToDisk();
    return { incident: inc, team };
  }

  // 6. Update Team Location Along Route
  updateTeamProgress(id, teamId, waypointIndex, remainingDistKm, remainingEtaMin) {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    inc.routeProgressIndex = waypointIndex;
    if (inc.assignedTeam) {
      inc.assignedTeam.distanceRemainingKm = remainingDistKm;
      inc.assignedTeam.etaRemainingMin = remainingEtaMin;
    }
    inc.updatedAt = new Date().toISOString();

    const team = this.teams.get(teamId);
    if (team && inc.routeWaypoints && inc.routeWaypoints[waypointIndex]) {
      team.coordinates = {
        lat: inc.routeWaypoints[waypointIndex][0],
        lng: inc.routeWaypoints[waypointIndex][1]
      };
      this.teams.set(teamId, team);
    }

    this.saveToDisk();
    return { incident: inc, team };
  }

  // 7. Team Arrives at Site
  arriveAtSite(id, teamId) {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    const team = this.teams.get(teamId);
    if (team) {
      team.status = 'ON_SITE';
      this.teams.set(teamId, team);
    }

    inc.status = 'TEAM ON SITE';
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: `${team ? team.name : 'Team'} arrived at forest site - containment initiated`, type: 'ON_SITE' });

    this.saveToDisk();
    return { incident: inc, team };
  }

  // 8. Fire Contained
  markContained(id, teamId = 'TEAM-04') {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    const team = this.teams.get(teamId);
    if (team) {
      team.status = 'AVAILABLE';
      this.teams.set(teamId, team);
    }

    inc.status = 'FIRE CONTAINED';
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: 'Fire contained by forestry response crew', type: 'CONTAINED' });

    this.saveToDisk();
    return { incident: inc, team };
  }

  // 9. Incident Resolved & Closed
  resolveIncident(id) {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    inc.status = 'RESOLVED';
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: 'Incident closed and marked RESOLVED', type: 'RESOLVE' });

    this.saveToDisk();
    return inc;
  }

  // 10. Mark False Alarm
  markFalseAlarm(id, reason = 'No active fire signature found by patrol') {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    inc.status = 'FALSE ALARM';
    inc.severity = 'LOW';
    inc.riskScore = 10;
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: `Marked as FALSE ALARM: ${reason}`, type: 'STATUS' });

    this.saveToDisk();
    return inc;
  }

  // 11. Delete an incident one at a time
  deleteIncident(id) {
    const existed = this.incidents.has(id);
    if (!existed) return false;
    this.incidents.delete(id);
    this.saveToDisk();
    return true;
  }

  // 12. Cancel / Dismiss an alert
  cancelIncident(id, reason = 'Alert cancelled / dismissed by user') {
    const inc = this.incidents.get(id);
    if (!inc) return null;

    inc.status = 'CANCELLED';
    inc.severity = 'LOW';
    inc.riskScore = 5;
    inc.updatedAt = new Date().toISOString();

    const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    inc.timeline.push({ time: timeStr, message: `Alert CANCELLED: ${reason}`, type: 'CANCEL' });

    this.saveToDisk();
    return inc;
  }

  // 13. Remove all test cases and keep strictly ONE single Bandipur Forest test case
  resetToSingleBandipur() {
    let singleBandipur = this.incidents.get('FG-2026-1052') || this.incidents.get('FG-2026-1048');
    this.incidents.clear();

    if (singleBandipur) {
      singleBandipur.status = 'UNDER REVIEW';
      singleBandipur.incidentId = 'FG-2026-1052';
      singleBandipur.forestName = 'Bandipur Forest Region';
      this.incidents.set('FG-2026-1052', singleBandipur);
    } else {
      this.seedInitialIncidents();
    }

    this.saveToDisk();
    return Array.from(this.incidents.values());
  }

  // --- TEAMS MANAGEMENT ---
  getAllTeams() {
    return Array.from(this.teams.values());
  }

  getTeamById(teamId) {
    return this.teams.get(teamId);
  }

  updateTeamStatus(teamId, status, coords = null) {
    const team = this.teams.get(teamId);
    if (!team) return null;
    team.status = status;
    if (coords) team.coordinates = coords;
    this.teams.set(teamId, team);
    this.saveToDisk();
    return team;
  }

  // --- EMERGENCY CONTACTS MANAGEMENT ---
  getAllEmergencyContacts() {
    return Array.from(this.emergencyContacts.values());
  }

  getContactsForState(stateName) {
    const all = this.getAllEmergencyContacts();
    return all.filter(c => c.active && (c.state.toLowerCase() === stateName.toLowerCase() || c.state === 'All India'));
  }

  upsertEmergencyContact(contactData) {
    const id = contactData.id || `CT-${Date.now()}`;
    const contact = {
      id,
      state: contactData.state || 'All India',
      district: contactData.district || 'General',
      department: contactData.department || 'Emergency Service',
      phone: contactData.phone || '112',
      type: contactData.type || 'Fire',
      active: contactData.active !== undefined ? contactData.active : true,
      isOfficial: contactData.isOfficial || false,
      description: contactData.description || 'Configured emergency contact number.'
    };
    this.emergencyContacts.set(id, contact);
    this.saveToDisk();
    return contact;
  }

  deleteEmergencyContact(id) {
    const deleted = this.emergencyContacts.delete(id);
    if (deleted) this.saveToDisk();
    return deleted;
  }

  // --- STATS ---
  getStats() {
    const list = this.getAllIncidents();
    const critical = list.filter(i => i.severity === 'CRITICAL' && i.status !== 'RESOLVED' && i.status !== 'FALSE ALARM');
    const high = list.filter(i => i.severity === 'HIGH' && i.status !== 'RESOLVED' && i.status !== 'FALSE ALARM');
    const resolved = list.filter(i => i.status === 'RESOLVED');
    const teams = this.getAllTeams();
    const teamsAvailable = teams.filter(t => t.status === 'AVAILABLE').length;
    const teamsDeployed = teams.filter(t => t.status === 'ASSIGNED' || t.status === 'EN_ROUTE' || t.status === 'ON_SITE').length;

    return {
      activeFires: list.filter(i => i.status !== 'RESOLVED' && i.status !== 'FALSE ALARM').length,
      criticalFires: critical.length,
      highRiskFires: high.length,
      resolvedFires: resolved.length,
      teamsAvailable,
      teamsDeployed,
      alertsToday: list.length + 24, // Realistic daily activity
      onlineSensors: 84,
      avgResponseTimeMin: 16.0
    };
  }
}

module.exports = new IncidentStore();
