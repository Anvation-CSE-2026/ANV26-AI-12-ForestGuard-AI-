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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PATCH']
  }
});

const PORT = process.env.PORT || 3000;

// Dynamic config store (e.g. for Google Maps API Key entered in UI)
let userConfig = {
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ''
};

// Ensure directories
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const sampleImagesDir = path.join(__dirname, 'public', 'sample_images');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(sampleImagesDir)) fs.mkdirSync(sampleImagesDir, { recursive: true });

// Configure Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `fg_fire_${Date.now()}_${Math.round(Math.random() * 1e4)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ========================
// API ROUTES
// ========================

// 1. Submit Fire Incident (Citizen Report)
app.post(['/api/incidents', '/api/reports'], upload.single('fireImage'), async (req, res) => {
  try {
    const lat = parseFloat(req.body.latitude || req.body.lat) || 11.6643;
    const lng = parseFloat(req.body.longitude || req.body.lng) || 76.6250;
    const locationName = req.body.locationName || req.body.forestName || 'Bandipur Forest Region';
    const description = req.body.description || 'Citizen reported potential forest fire.';
    const reporterName = req.body.reporterName || 'Citizen Reporter';
    const reporterPhone = req.body.reporterPhone || 'Undisclosed';
    const source = req.body.source || 'Citizen Photo';

    let imageRelativePath = '';
    let imageDiskPath = '';

    if (req.file) {
      imageRelativePath = `/uploads/${req.file.filename}`;
      imageDiskPath = req.file.path;
    } else if (req.body.presetImage) {
      imageRelativePath = req.body.presetImage;
      imageDiskPath = path.join(__dirname, 'public', req.body.presetImage.replace(/^\//, ''));
    } else {
      imageRelativePath = '/sample_images/sample_wildfire.jpg';
      imageDiskPath = path.join(__dirname, 'public', 'sample_images', 'sample_wildfire.jpg');
    }

    console.log(`[FORESTGUARD] Report received at (${lat}, ${lng}) - ${locationName}`);

    // AI Vision Analysis (Python FastAPI or Native Engine)
    const aiResult = await aiVisionService.analyzeFireImage(imageDiskPath, locationName);

    // Save Incident to Store (calculates multi-source risk + proximity)
    const newIncident = incidentStore.createIncident({
      latitude: lat,
      longitude: lng,
      forestName: locationName,
      source,
      imageUrl: imageRelativePath,
      aiConfidence: aiResult.confidence,
      fireDetected: aiResult.fireDetected,
      severity: aiResult.severity,
      aiExplanation: aiResult.explanation,
      affectedAreaHectares: aiResult.affectedAreaEstimateHectares,
      detectedFeatures: aiResult.detectedFeatures,
      featureBreakdown: aiResult.featureBreakdown,
      reporter: {
        name: reporterName,
        phone: reporterPhone,
        notes: description
      }
    });

    console.log(`[ALERT EMITTED] ${newIncident.incidentId} | Risk: ${newIncident.riskScore}/100 | Severity: ${newIncident.severity}`);

    // Real-Time Socket.IO broadcast as specified in Section 21
    io.emit('new_fire_alert', newIncident);

    return res.status(201).json({
      success: true,
      message: 'Your fire report has been transmitted to the ForestGuard command dashboard.',
      incident: newIncident
    });
  } catch (err) {
    console.error('[REPORT ERROR]', err);
    return res.status(500).json({ success: false, message: 'Failed to process report: ' + err.message });
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

// 4. Verify Fire Incident
app.post('/api/incidents/:id/verify', (req, res) => {
  const updated = incidentStore.verifyIncident(req.params.id);
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('fire_verified', updated);
  io.emit('incident_updated', updated);
  res.json({ success: true, message: 'Fire verified by Command.', incident: updated });
});

// 5. Dispatch Response Team
app.post('/api/incidents/:id/dispatch', (req, res) => {
  const { teamId, teamName, etaMinutes, notes } = req.body;
  const updated = incidentStore.dispatchResponse(req.params.id, { teamId, teamName, etaMinutes, notes });
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('team_dispatched', updated);
  io.emit('incident_updated', updated);
  res.json({ success: true, message: 'Response team dispatched (Simulated).', incident: updated });
});

// 6. Mark False Positive
app.post('/api/incidents/:id/false-positive', (req, res) => {
  const updated = incidentStore.markFalsePositive(req.params.id);
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('incident_updated', updated);
  res.json({ success: true, message: 'Marked as false positive.', incident: updated });
});

// 7. Mark Contained
app.post('/api/incidents/:id/contain', (req, res) => {
  const updated = incidentStore.markContained(req.params.id);
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('incident_updated', updated);
  res.json({ success: true, message: 'Fire marked as contained.', incident: updated });
});

// 8. Resolve Fire Incident
app.post('/api/incidents/:id/resolve', (req, res) => {
  const updated = incidentStore.resolveIncident(req.params.id);
  if (!updated) return res.status(404).json({ success: false, message: 'Incident not found' });

  io.emit('fire_resolved', updated);
  io.emit('incident_updated', updated);
  res.json({ success: true, message: 'Incident marked as resolved.', incident: updated });
});

// 9. IoT Sensor Alert Trigger (Simulate Sensor Spike)
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

  console.log(`[IOT THRESHOLD EXCEEDED] Sensor ${sensorId}: Temp ${temp}°C, Smoke ${smoke}%`);

  // Also create a linked incident if requested
  const linkedIncident = incidentStore.createIncident({
    source: `IoT Sensor (${sensorId})`,
    latitude: sensor.coordinates.lat,
    longitude: sensor.coordinates.lng,
    forestName: sensor.forestName,
    imageUrl: '/sample_images/sample_wildfire.jpg',
    aiConfidence: 91.5,
    fireDetected: true,
    severity: 'CRITICAL',
    aiExplanation: `High-risk thermal telemetry anomaly triggered by IoT sensor node ${sensorId}. Temperature: ${temp}°C, Smoke Index: ${smoke}%.`,
    affectedAreaHectares: 1.5,
    reporter: { name: `Automated Sensor Node (${sensorId})`, phone: 'LoRa Mesh Telemetry' }
  });

  io.emit('sensor_alert', sensorAlertData);
  io.emit('new_fire_alert', linkedIncident);

  res.json({ success: true, message: 'IoT sensor alert triggered and broadcast.', alert: sensorAlertData, incident: linkedIncident });
});

// 10. Satellite Detection Trigger (Simulate Hotspot Alert)
app.post('/api/satellite/trigger', (req, res) => {
  const satAlertData = {
    hotspotId: `SAT-SNPP-${Math.floor(1000 + Math.random() * 9000)}`,
    forestName: 'Kanha Tiger Reserve Buffer Zone',
    coordinates: { lat: 22.3410, lng: 80.6250 },
    satellite: 'SNPP-VIIRS 375m I-Band Thermal',
    confidence: 91.0,
    frpMegawatts: 46.2,
    timestamp: new Date().toISOString(),
    source: 'NASA FIRMS / NRSC ISRO Stream (DEMO / API READY)'
  };

  const linkedIncident = incidentStore.createIncident({
    source: 'Satellite Detection (SNPP-VIIRS)',
    latitude: satAlertData.coordinates.lat,
    longitude: satAlertData.coordinates.lng,
    forestName: satAlertData.forestName,
    imageUrl: '/sample_images/sample_wildfire.jpg',
    aiConfidence: 89.0,
    fireDetected: true,
    severity: 'HIGH',
    aiExplanation: 'Thermal infrared anomaly detected by orbital satellite pass. Radiative Fire Power exceeds 40 MW.',
    affectedAreaHectares: 3.2,
    reporter: { name: 'Automated Satellite Stream', phone: 'NRSC Telemetry' }
  });

  io.emit('satellite_alert', satAlertData);
  io.emit('new_fire_alert', linkedIncident);

  res.json({ success: true, message: 'Satellite fire alert generated.', alert: satAlertData, incident: linkedIncident });
});

// 11. DEMO SCENARIOS (Section 19)
app.post('/api/demo/scenario/:id', (req, res) => {
  const scenarioId = parseInt(req.params.id) || 1;
  let incident = null;

  if (scenarioId === 1) {
    // Scenario 1: MULTI-SOURCE FIRE (Citizen photo + Satellite + IoT -> CRITICAL ALERT)
    incident = incidentStore.createIncident({
      source: 'Citizen + Satellite + IoT (Multi-Source)',
      latitude: 11.6643,
      longitude: 76.6250,
      forestName: 'Bandipur Forest Region, Karnataka',
      imageUrl: '/sample_images/sample_wildfire.jpg',
      aiConfidence: 94.6,
      fireDetected: true,
      severity: 'CRITICAL',
      aiExplanation: 'Multi-source consensus confirmed: Citizen photograph (94.6%), SNPP-VIIRS satellite hotspot (89.2%), and IoT node FS-KA-042 (Temp 48.2°C, Smoke 78%).',
      affectedAreaHectares: 2.8,
      reporter: { name: 'Arun V. (Eco-Patrol)', phone: '+91-98450-11223', notes: 'Active spreading canopy blaze near Moyar gorge.' }
    });
  } else if (scenarioId === 2) {
    // Scenario 2: FALSE POSITIVE (Citizen photo + No satellite + Normal sensors -> VERIFY)
    incident = incidentStore.createIncident({
      source: 'Citizen Photo',
      latitude: 12.8009,
      longitude: 75.5762,
      forestName: 'Bannerghatta Hills, Karnataka',
      imageUrl: '/sample_images/sample_sunset_safe.jpg',
      aiConfidence: 83.2,
      fireDetected: false,
      severity: 'LOW',
      aiExplanation: 'Potential False-Positive: Orange hue detected corresponds to atmospheric twilight sunset. Zero satellite thermal anomalies detected. Local IoT sensors report normal ambient levels (28°C, Smoke 4%).',
      affectedAreaHectares: 0.0,
      reporter: { name: 'Tourist Report', phone: '+91-91234-56789', notes: 'Suspected smoke on western horizon.' }
    });
  } else {
    // Scenario 3: EARLY WARNING (High temp + Low humidity + High smoke -> PRE-FIRE WARNING)
    incident = incidentStore.createIncident({
      source: 'IoT Sensor Grid (Early Warning)',
      latitude: 22.3345,
      longitude: 80.6115,
      forestName: 'Kanha Tiger Reserve Core, MP',
      imageUrl: '/sample_images/sample_wildfire.jpg',
      aiConfidence: 88.0,
      fireDetected: true,
      severity: 'HIGH',
      aiExplanation: 'Thermodynamic Early Fire Warning: Low relative humidity (17%), ambient temperature 47.5°C, and smoke index 84% indicating smoldering understory ignition.',
      affectedAreaHectares: 1.2,
      reporter: { name: 'Automated Mesh Sensor FS-MP-077', phone: 'Telemetry Feed' }
    });
  }

  io.emit('new_fire_alert', incident);
  res.json({ success: true, message: `Scenario ${scenarioId} executed.`, incident });
});

// 12. Geospatial Datasets
app.get('/api/forests', (req, res) => res.json({ success: true, forests: geoSpatialService.getAllForests() }));
app.get('/api/water-bodies', (req, res) => res.json({ success: true, waterBodies: geoSpatialService.getAllWaterBodies() }));
app.get('/api/response-stations', (req, res) => res.json({ success: true, responseStations: geoSpatialService.getAllResponseStations() }));
app.get('/api/sensors', (req, res) => res.json({ success: true, sensors: geoSpatialService.getAllSensors() }));
app.get('/api/satellite-hotspots', (req, res) => res.json({ success: true, hotspots: geoSpatialService.getAllSatelliteHotspots() }));

// 13. System Stats
app.get('/api/stats', (req, res) => {
  res.json({ success: true, stats: incidentStore.getStats() });
});

// 14. Google Maps API Config
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

  socket.on('disconnect', () => {
    console.log(`[SOCKET DISCONNECTED] Client: ${socket.id}`);
  });
});

// Start Server
server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🌲 FORESTGUARD AI - Live AI Forest Fire Detection & Mapping System`);
  console.log(`🚀 Server listening on: http://localhost:${PORT}`);
  console.log(`🌐 Landing Page:          http://localhost:${PORT}/index.html`);
  console.log(`📸 Report a Fire:         http://localhost:${PORT}/report.html`);
  console.log(`🚨 Admin Command Center:  http://localhost:${PORT}/admin.html`);
  console.log(`🛰️  Satellite Monitoring:  http://localhost:${PORT}/satellite.html`);
  console.log(`📡 IoT Sensor Dashboard:  http://localhost:${PORT}/iot.html`);
  console.log(`📊 Analytics Dashboard:   http://localhost:${PORT}/analytics.html`);
  console.log(`================================================================`);
});
