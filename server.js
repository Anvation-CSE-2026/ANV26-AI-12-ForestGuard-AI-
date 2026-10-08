const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const { Server } = require('socket.io');

const aiVisionService = require('./services/aiVisionService');
const geoSpatialService = require('./services/geoSpatialService');
const incidentStore = require('./services/incidentStore');
const riskEngine = require('./services/riskEngine');
const fireIntelligenceService = require('./services/fireIntelligenceService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE']
  }
});

const PORT = process.env.PORT || 8109;

// Dynamic config store (e.g. for Google Maps API Key entered in UI)
let userConfig = {
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
};

// Ensure directories
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const sampleImagesDir = path.join(__dirname, 'public', 'sample_images');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(sampleImagesDir)) fs.mkdirSync(sampleImagesDir, { recursive: true });

// Configure Multer for Images and Videos
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `fg_${Date.now()}_${Math.round(Math.random() * 1e4)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB for video/image
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// API ROUTES
// ========================

// 1. Submit Fire Incident (Citizen Report via Multiple Methods: Image, Camera, Video, Manual, GPS, Search)
app.post(['/api/incidents', '/api/reports'], upload.fields([{ name: 'fireImage', maxCount: 1 }, { name: 'fireVideo', maxCount: 1 }]), async (req, res) => {
  try {
    const lat = parseFloat(req.body.latitude || req.body.lat) || 11.6643;
    const lng = parseFloat(req.body.longitude || req.body.lng) || 76.6250;
    const locationName = req.body.locationName || req.body.forestName || 'Bandipur Forest';
    const alertTitle = (req.body.alertTitle || req.body.title || req.body.alertName || '').trim() || locationName;
    const detectionMethod = req.body.detectionMethod || 'Image'; // Image, Camera, Video, Manual, GPS, Search
    const description = req.body.description || 'Forest fire alert reported by citizen.';
    const reporterName = req.body.reporterName || 'Citizen Reporter';
    const reporterPhone = req.body.reporterPhone || 'Undisclosed';
    const source = req.body.source || (detectionMethod === 'Manual' ? 'Manual Alert' : `Citizen ${detectionMethod}`);
    const estimatedSize = req.body.estimatedSize || 'Medium';
    const smokeVisible = req.body.smokeVisible === 'true' || req.body.smokeVisible === true;
    const flamesVisible = req.body.flamesVisible === 'true' || req.body.flamesVisible === true;
    const peopleInDanger = req.body.peopleInDanger === 'true' || req.body.peopleInDanger === true;

    let imageRelativePath = '';
    let imageDiskPath = '';
    let videoRelativePath = '';

    if (req.files && req.files.fireImage && req.files.fireImage[0]) {
      imageRelativePath = `/uploads/${req.files.fireImage[0].filename}`;
      imageDiskPath = req.files.fireImage[0].path;
    } else if (req.body.presetImage) {
      imageRelativePath = req.body.presetImage;
      imageDiskPath = path.join(__dirname, 'public', req.body.presetImage.replace(/^\//, ''));
    } else if (detectionMethod === 'Manual' || detectionMethod === 'GPS') {
      imageRelativePath = '/sample_images/sample_wildfire.jpg';
      imageDiskPath = path.join(__dirname, 'public', 'sample_images', 'sample_wildfire.jpg');
    } else {
      imageRelativePath = '/sample_images/sample_wildfire.jpg';
      imageDiskPath = path.join(__dirname, 'public', 'sample_images', 'sample_wildfire.jpg');
    }

    if (req.files && req.files.fireVideo && req.files.fireVideo[0]) {
      videoRelativePath = `/uploads/${req.files.fireVideo[0].filename}`;
    }

    console.log(`[FORESTGUARD] ${detectionMethod} report received at (${lat}, ${lng}) - ${locationName}`);

    // AI Vision Analysis (Python FastAPI or Native Engine)
    let aiResult;
    if (detectionMethod === 'Manual') {
      aiResult = {
        fireDetected: true,
        confidence: 88.0,
        severity: 'HIGH',
        explanation: 'Manual ground verification pin placed by citizen on live map.',
        detectedFeatures: ['Visual Smoke Reported'],
        featureBreakdown: []
      };
    } else {
      aiResult = await aiVisionService.analyzeFireImage(imageDiskPath, locationName);
    }

    // Save Incident to Store (calculates multi-source risk + proximity)
    const newIncident = incidentStore.createIncident({
      latitude: lat,
      longitude: lng,
      title: alertTitle,
      alertTitle: alertTitle,
      forestName: locationName,
      detectionMethod,
      source,
      imageUrl: imageRelativePath,
      videoUrl: videoRelativePath,
      description,
      estimatedSize,
      smokeVisible,
      flamesVisible,
      peopleInDanger,
      aiConfidence: aiResult.confidence,
      fireDetected: aiResult.fireDetected,
      severity: aiResult.severity,
      aiExplanation: aiResult.explanation,
      affectedAreaHectares: aiResult.affectedAreaEstimateHectares || 2.4,
      detectedFeatures: aiResult.detectedFeatures,
      scoreboard: aiResult.scoreboard,
      fireScore: aiResult.fireScore,
      fireLevel: aiResult.fireLevel,
      anomalyConfidence: aiResult.anomalyConfidence,
      smokeConfidence: aiResult.smokeConfidence,
      fireCoverage: aiResult.fireCoverage,
      smokeLevel: aiResult.smokeLevel,
      riskScore: aiResult.riskScore,
      objectsCount: aiResult.objectsCount,
      fakeProbability: aiResult.fakeProbability,
      authenticityScore: aiResult.authenticityScore,
      fakeVerdict: aiResult.fakeVerdict,
      fakeStatus: aiResult.fakeStatus,
      isFake: aiResult.isFake,
      isPriority: true,
      priorityLevel: 'PRIORITY 1 - CITIZEN REPORT',
      reporter: {
        name: reporterName,
        phone: reporterPhone,
        notes: description
      }
    });

    console.log(`🚨 [PRIORITY 1 LIVE BROADCAST] ${newIncident.incidentId} | Status: ${newIncident.status} | Risk: ${newIncident.riskScore}/100`);

    // Broadcast in Real Time via Socket.IO
    io.emit('new_fire_alert', newIncident);
    io.emit('response_status_updated', newIncident);

    return res.status(201).json({
      success: true,
      message: 'Your fire report has been transmitted to the ForestGuard emergency command center.',
      incident: newIncident
    });
  } catch (err) {
    console.error('[REPORT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Failed to process report: ' + err.message });
  }
});

// 1.1 Dedicated AI Vision Scoreboard Analyzer Endpoint (Instant Pre-Submission & Inspector)
app.post(['/api/analyze-image', '/api/analyze-scoreboard'], upload.single('fireImage'), async (req, res) => {
  try {
    let imageDiskPath = '';
    let locationName = req.body.forestRegion || req.body.forestName || 'Bandipur Forest Region';

    if (req.file) {
      imageDiskPath = req.file.path;
    } else if (req.body.base64Image) {
      const base64Data = req.body.base64Image;
      const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      const buffer = matches ? Buffer.from(matches[2], 'base64') : Buffer.from(base64Data, 'base64');
      const tempFilename = `temp_scan_${Date.now()}_${Math.round(Math.random() * 1e4)}.jpg`;
      imageDiskPath = path.join(uploadsDir, tempFilename);
      fs.writeFileSync(imageDiskPath, buffer);
    } else if (req.body.imageUrl) {
      const relPath = req.body.imageUrl.replace(/^\//, '');
      imageDiskPath = path.join(__dirname, 'public', relPath);
    } else {
      imageDiskPath = path.join(__dirname, 'public', 'sample_images', 'sample_wildfire.jpg');
    }

    const aiResult = await aiVisionService.analyzeFireImage(imageDiskPath, locationName);
    return res.json({
      success: true,
      ...aiResult
    });
  } catch (err) {
    console.error('[AI ANALYZE ERROR]', err);
    return res.status(500).json({ success: false, message: 'AI Analysis failed: ' + err.message });
  }
});

// 2. Fetch all incidents
app.get('/api/incidents', (req, res) => {
  res.json({ success: true, incidents: incidentStore.getAllIncidents() });
});

// 3. Fetch single incident
app.get('/api/incidents/:id', (req, res) => {
  const inc = incidentStore.getIncidentById(req.params.id);
  if (!inc) return res.status(404).json({ success: false, message: 'Incident not found' });
  res.json({ success: true, incident: inc });
});

// 3.1 Fetch fire intelligence bundle (Perimeter, Spread, Danger Index, Vulnerabilities, Team Recommendations)
app.get('/api/incidents/:id/intelligence', (req, res) => {
  const inc = incidentStore.getIncidentById(req.params.id);
  if (!inc) return res.status(404).json({ success: false, message: 'Incident not found' });
  const perimeter = fireIntelligenceService.calculateFirePerimeter(inc);
  const dangerIndex = fireIntelligenceService.calculateFireDangerIndex(inc);
  const vulnerable = fireIntelligenceService.calculateNearbyVulnerableLocations(inc);
  const teams = fireIntelligenceService.recommendResponseTeams(inc, incidentStore.getAllTeams(), geoSpatialService.getAllResponseStations());
  res.json({
    success: true,
    incidentId: inc.incidentId,
    firePerimeter: perimeter,
    fireDangerIndex: dangerIndex,
    vulnerableLocations: vulnerable,
    teamRecommendations: teams
  });
});

// 3.2 Fire Spread Simulation Endpoint (Calculated on-demand per performance rules)
app.post('/api/incidents/:id/simulate-spread', (req, res) => {
  const inc = incidentStore.getIncidentById(req.params.id);
  if (!inc) return res.status(404).json({ success: false, message: 'Incident not found' });
  const minutes = parseInt(req.body.minutes) || 60;
  const simulation = fireIntelligenceService.simulateFireSpread(inc, minutes);
  inc.spreadSimulation = simulation;
  io.emit('fire_spread_simulated', { incidentId: inc.incidentId, simulation });
  res.json({ success: true, simulation });
});

// 3.3 Fetch Ranked Response Team Recommendations
app.get('/api/incidents/:id/team-recommendations', (req, res) => {
  const inc = incidentStore.getIncidentById(req.params.id);
  if (!inc) return res.status(404).json({ success: false, message: 'Incident not found' });
  const recs = fireIntelligenceService.recommendResponseTeams(inc, incidentStore.getAllTeams(), geoSpatialService.getAllResponseStations());
  res.json({ success: true, recommendations: recs });
});

// 4. Admin Verifies Fire (Prevents Fake Alert)
app.post('/api/incidents/:id/verify', (req, res) => {
  const adminUser = (req.body && req.body.adminUser) || 'Forest Authority Admin';
  const updated = incidentStore.verifyIncident(req.params.id, adminUser);
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('fire_verified', updated);
  io.emit('response_status_updated', updated);
  res.json({ success: true, message: 'Fire verified by Admin Command.', incident: updated });
});

// 5. Admin Requests More Information
app.post('/api/incidents/:id/request-info', (req, res) => {
  const notes = (req.body && req.body.notes) || 'More ground information requested from nearby patrol.';
  const updated = incidentStore.requestMoreInfo(req.params.id, notes);
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('response_status_updated', updated);
  res.json({ success: true, message: 'Information requested.', incident: updated });
});

// 6. Admin Dispatches Team
app.post('/api/incidents/:id/dispatch', (req, res) => {
  const { teamId, teamName, etaMinutes, instruction } = req.body;
  const result = incidentStore.dispatchTeam(req.params.id, { teamId, teamName, etaMinutes, instruction });
  if (!result) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('team_dispatched', { incident: result.incident, team: result.team });
  io.emit('response_status_updated', result.incident);
  res.json({ success: true, message: 'Response team dispatched (Simulated).', incident: result.incident, team: result.team });
});

// 7. Fire Station / Response Team Accepts Mission
app.post('/api/incidents/:id/accept-mission', (req, res) => {
  const teamId = req.body.teamId || 'TEAM-04';
  const result = incidentStore.acceptMission(req.params.id, teamId);
  if (!result) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('mission_accepted', { incident: result.incident, team: result.team });
  io.emit('response_status_updated', result.incident);
  res.json({ success: true, message: 'Mission accepted by response team.', incident: result.incident, team: result.team });
});

// 8. Response Team Starts Travel (En Route)
app.post('/api/incidents/:id/start-travel', (req, res) => {
  const teamId = req.body.teamId || 'TEAM-04';
  const result = incidentStore.startTravel(req.params.id, teamId);
  if (!result) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('team_travel_started', { incident: result.incident, team: result.team });
  io.emit('response_status_updated', result.incident);
  res.json({ success: true, message: 'Team is now en route.', incident: result.incident, team: result.team });
});

// 9. Update Team Location Progress Along Route
app.post('/api/incidents/:id/team-progress', (req, res) => {
  const teamId = req.body.teamId || 'TEAM-04';
  const { waypointIndex, remainingDistanceKm, remainingEtaMin } = req.body;
  const result = incidentStore.updateTeamProgress(req.params.id, teamId, waypointIndex, remainingDistanceKm, remainingEtaMin);
  if (!result) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('team_location_update', {
    incidentId: req.params.id,
    teamId,
    waypointIndex,
    remainingDistanceKm,
    remainingEtaMin,
    coordinates: result.team?.coordinates
  });
  res.json({ success: true, incident: result.incident, team: result.team });
});

// 10. Team Arrives at Site
app.post('/api/incidents/:id/arrive-site', (req, res) => {
  const teamId = req.body.teamId || 'TEAM-04';
  const result = incidentStore.arriveAtSite(req.params.id, teamId);
  if (!result) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('team_arrived_site', { incident: result.incident, team: result.team });
  io.emit('response_status_updated', result.incident);
  res.json({ success: true, message: 'Team has arrived at site.', incident: result.incident, team: result.team });
});

// 11. Mark Fire Contained
app.post('/api/incidents/:id/contain', (req, res) => {
  const teamId = req.body.teamId || 'TEAM-04';
  const result = incidentStore.markContained(req.params.id, teamId);
  if (!result) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('fire_contained', { incident: result.incident, team: result.team });
  io.emit('response_status_updated', result.incident);
  res.json({ success: true, message: 'Fire marked as contained.', incident: result.incident });
});

// 12. Resolve Incident
app.post('/api/incidents/:id/resolve', (req, res) => {
  const updated = incidentStore.resolveIncident(req.params.id);
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('incident_resolved', updated);
  io.emit('response_status_updated', updated);
  res.json({ success: true, message: 'Incident marked as resolved.', incident: updated });
});

// 13. Mark False Alarm / False Positive
app.post(['/api/incidents/:id/false-alarm', '/api/incidents/:id/false-positive'], (req, res) => {
  const reason = (req.body && req.body.reason) || 'Verified as non-hazardous ambient haze / sunset';
  const updated = incidentStore.markFalseAlarm(req.params.id, reason);
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('response_status_updated', updated);
  res.json({ success: true, message: 'Marked as false alarm.', incident: updated });
});

// 13.1 Cancel Alert One at a Time
app.post('/api/incidents/:id/cancel', (req, res) => {
  const incidentId = req.params.id;
  if (!incidentId || incidentId === 'undefined' || incidentId === '--') {
    return res.status(400).json({ success: false, message: 'Invalid or missing incident ID' });
  }
  const reason = (req.body && req.body.reason) || 'Alert cancelled by operator';
  const updated = incidentStore.cancelIncident(incidentId, reason);
  // Also delete from incident store so it doesn't linger in database
  incidentStore.deleteIncident(incidentId);

  io.emit('incident_cancelled', { incidentId, incident: updated || { incidentId } });
  io.emit('incident_deleted', { incidentId }); // Also emit deleted so cards remove smoothly
  if (updated) io.emit('response_status_updated', updated);
  res.json({ success: true, message: `Incident ${incidentId} cancelled successfully.`, incident: updated });
});

// 13.2 Delete Alert One at a Time
app.delete('/api/incidents/:id', (req, res) => {
  const incidentId = req.params.id;
  const deleted = incidentStore.deleteIncident(incidentId);
  if (!deleted) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('incident_deleted', { incidentId });
  res.json({ success: true, message: `Incident ${incidentId} deleted successfully.`, incidentId });
});

// 13.3 Reset to Only ONE Single Bandipur Forest Test Case
app.post('/api/incidents/reset-single-bandipur', (req, res) => {
  const incidents = incidentStore.resetToSingleBandipur();
  io.emit('queue_reset', { incidents });
  res.json({ success: true, message: 'All test alerts removed. Only 1 Bandipur Forest test case preserved.', incidents });
});

// 13.4 Automatic IP Geolocation Fallback Endpoint
app.get('/api/geolocate', async (req, res) => {
  try {
    const ipRes = await fetch('https://ipwho.is/');
    if (ipRes.ok) {
      const data = await ipRes.json();
      if (data && data.success && data.latitude && data.longitude) {
        return res.json({
          success: true,
          source: 'ip_network',
          lat: data.latitude,
          lng: data.longitude,
          city: data.city || 'Bengaluru',
          region: data.region || 'Karnataka',
          country: data.country || 'India'
        });
      }
    }
  } catch (err) {
    console.warn('[GEOLOCATE SERVER WARN]', err.message);
  }

  // Graceful fallback coordinates: Bengaluru (Kanakapura Road / Campus Region)
  res.json({
    success: true,
    source: 'region_default',
    lat: 12.8258,
    lng: 77.5158,
    city: 'Bengaluru (Kanakapura Road Area)',
    region: 'Karnataka',
    country: 'India'
  });
});

// 14. Response Teams Endpoints
app.get('/api/teams', (req, res) => {
  res.json({ success: true, teams: incidentStore.getAllTeams() });
});

app.patch('/api/teams/:id/status', (req, res) => {
  const team = incidentStore.updateTeamStatus(req.params.id, req.body.status, req.body.coordinates);
  if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
  io.emit('team_status_changed', team);
  res.json({ success: true, team });
});

// 15. Emergency Contacts Management (Section 7 & 26)
app.get('/api/emergency-contacts', (req, res) => {
  const state = req.query.state;
  if (state) {
    res.json({ success: true, contacts: incidentStore.getContactsForState(state) });
  } else {
    res.json({ success: true, contacts: incidentStore.getAllEmergencyContacts() });
  }
});

app.post('/api/emergency-contacts', (req, res) => {
  const contact = incidentStore.upsertEmergencyContact(req.body);
  res.json({ success: true, contact });
});

app.delete('/api/emergency-contacts/:id', (req, res) => {
  const ok = incidentStore.deleteEmergencyContact(req.params.id);
  res.json({ success: ok });
});

// 16. IoT Sensor Trigger
app.post('/api/sensors/:id/trigger', (req, res) => {
  const sensorId = req.params.id;
  const temp = parseFloat(req.body.temperature) || 48.5;
  const smoke = parseFloat(req.body.smokeIndex) || 82.0;
  const humidity = parseFloat(req.body.humidity) || 18.0;

  const sensor = geoSpatialService.getAllSensors().find(s => s.id === sensorId) || {
    id: sensorId,
    forestName: 'Bandipur Forest Sector 4',
    coordinates: { lat: 11.6690, lng: 76.6210 }
  };

  const sensorAlertData = {
    sensorId,
    forestName: sensor.forestName,
    coordinates: sensor.coordinates,
    temperature: temp,
    smokeIndex: smoke,
    humidity,
    status: 'CRITICAL',
    timestamp: new Date().toISOString()
  };

  const linkedIncident = incidentStore.createIncident({
    source: `IoT Sensor (${sensorId})`,
    detectionMethod: 'Sensor',
    latitude: sensor.coordinates.lat,
    longitude: sensor.coordinates.lng,
    forestName: sensor.forestName,
    imageUrl: '/sample_images/sample_wildfire.jpg',
    aiConfidence: 91.5,
    fireDetected: true,
    severity: 'CRITICAL',
    aiExplanation: `High-risk thermal telemetry anomaly triggered by IoT sensor node ${sensorId}. Temperature: ${temp}°C, Smoke Index: ${smoke}%.`,
    affectedAreaHectares: 1.5,
    reporter: { name: `Automated Sensor Node (${sensorId})`, phone: 'LoRa Mesh' }
  });

  io.emit('sensor_alert', sensorAlertData);
  io.emit('new_fire_alert', linkedIncident);
  io.emit('response_status_updated', linkedIncident);

  res.json({ success: true, message: 'IoT sensor alert broadcast.', alert: sensorAlertData, incident: linkedIncident });
});

// 17. Demo Scenarios
app.post('/api/demo/scenario/:id', (req, res) => {
  const scenarioId = parseInt(req.params.id) || 1;
  let incident = null;

  if (scenarioId === 1) {
    incident = incidentStore.createIncident({
      incidentId: 'FG-2026-1052',
      source: 'Citizen Report + Image',
      detectionMethod: 'Image',
      latitude: 11.6643,
      longitude: 76.6250,
      forestName: 'Bandipur Forest, Karnataka',
      imageUrl: '/sample_images/sample_wildfire.jpg',
      aiConfidence: 94.2,
      fireDetected: true,
      severity: 'CRITICAL',
      aiExplanation: 'Visible smoke and flame-like regions detected. Image evidence indicates a high probability of forest fire with rapid crown propagation risk.',
      affectedAreaHectares: 2.4,
      reporter: { name: 'Citizen Observer', phone: '+91-98765-43210', notes: 'Heavy canopy blaze spotted near Moyar gorge.' }
    });
  } else if (scenarioId === 2) {
    incident = incidentStore.createIncident({
      source: 'Citizen Image',
      detectionMethod: 'Image',
      latitude: 12.8009,
      longitude: 75.5762,
      forestName: 'Bannerghatta Hills, Karnataka',
      imageUrl: '/sample_images/sample_sunset_safe.jpg',
      aiConfidence: 83.2,
      fireDetected: false,
      severity: 'LOW',
      aiExplanation: 'Potential False Alarm: Orange hue detected corresponds to atmospheric twilight sunset. Zero satellite thermal anomalies detected.',
      affectedAreaHectares: 0.0,
      reporter: { name: 'Tourist Report', phone: '+91-91234-56789' }
    });
  } else {
    incident = incidentStore.createIncident({
      source: 'IoT Sensor Grid',
      detectionMethod: 'Sensor',
      latitude: 22.3345,
      longitude: 80.6115,
      forestName: 'Kanha Tiger Reserve Core, MP',
      imageUrl: '/sample_images/sample_wildfire.jpg',
      aiConfidence: 88.0,
      fireDetected: true,
      severity: 'HIGH',
      aiExplanation: 'Early Warning: Ambient temperature 47.5°C and smoke index 84% indicating smoldering understory ignition.',
      affectedAreaHectares: 1.2,
      reporter: { name: 'Automated Mesh Sensor FS-MP-077', phone: 'Telemetry Feed' }
    });
  }

  io.emit('new_fire_alert', incident);
  io.emit('response_status_updated', incident);
  res.json({ success: true, message: `Scenario ${scenarioId} executed.`, incident });
});

// 18. Geospatial Datasets
app.get('/api/forests', (req, res) => res.json({ success: true, forests: geoSpatialService.getAllForests() }));
app.get('/api/water-bodies', (req, res) => res.json({ success: true, waterBodies: geoSpatialService.getAllWaterBodies() }));
app.get('/api/response-stations', (req, res) => res.json({ success: true, responseStations: geoSpatialService.getAllResponseStations() }));
app.get('/api/sensors', (req, res) => res.json({ success: true, sensors: geoSpatialService.getAllSensors() }));
app.get('/api/satellite-hotspots', (req, res) => res.json({ success: true, hotspots: geoSpatialService.getAllSatelliteHotspots() }));

// 19. System Stats
app.get('/api/stats', (req, res) => {
  res.json({ success: true, stats: incidentStore.getStats() });
});

// 20. Google Maps API Config
app.get('/api/config', (req, res) => {
  res.json({
    googleMapsApiKey: userConfig.googleMapsApiKey,
    hasApiKey: !!userConfig.googleMapsApiKey
  });
});

app.post('/api/config', (req, res) => {
  if (req.body.googleMapsApiKey !== undefined) {
    userConfig.googleMapsApiKey = req.body.googleMapsApiKey.trim();
  }
  res.json({ success: true, hasApiKey: !!userConfig.googleMapsApiKey });
});

// ========================
// SOCKET.IO CONNECTION
// ========================
io.on('connection', (socket) => {
  console.log(`[SOCKET CONNECTED] Client: ${socket.id}`);
  socket.emit('initial_active_incidents', incidentStore.getAllIncidents());
  socket.emit('initial_teams', incidentStore.getAllTeams());

  socket.on('disconnect', () => {
    console.log(`[SOCKET DISCONNECTED] Client: ${socket.id}`);
  });
});

// Unified Live Demo Route (Port 8109 Hub)
app.get(['/demo', '/live-demo'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'demo.html'));
});

// Start Server
server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🌲 FORESTGUARD AI - Live AI Forest Fire Detection & Mapping System`);
  console.log(`🚀 Server listening on: http://localhost:${PORT}`);
  console.log(`🔀 Unified Live Demo Hub:   http://localhost:${PORT}/demo.html`);
  console.log(`👤 User/Citizen Dashboard:  http://localhost:${PORT}/user.html`);
  console.log(`🚨 Admin Command Center:    http://localhost:${PORT}/admin.html`);
  console.log(`🌐 Landing Page:            http://localhost:${PORT}/index.html`);
  console.log(`================================================================`);
});

// Dual-Port Bridge: Listen on port 8109 AND port 3000 simultaneously so users on either port work seamlessly!
if (PORT !== 3000) {
  const serverFallback = http.createServer(app);
  serverFallback.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log('ℹ️ Port 3000 is occupied by an external project. ForestGuard running isolated on port ' + PORT);
    } else {
      console.warn('[PORT 3000 Notice]:', err.message);
    }
  });

  try {
    io.attach(serverFallback);
    serverFallback.listen(3000, () => {
      console.log(`🌐 Compatibility Bridge: Also listening on http://localhost:3000`);
    });
  } catch (e) {
    console.warn('Bridge attach error:', e.message);
  }
}
