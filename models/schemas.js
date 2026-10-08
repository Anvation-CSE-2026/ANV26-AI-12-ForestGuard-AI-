/**
 * ForestGuard AI Database Schemas (MongoDB / Mongoose Compatible Specs)
 * Document definitions for Incidents, IoT Sensors, Response Teams, Forests, and User Reports.
 */

const IncidentSchema = {
  incidentId: { type: String, required: true, unique: true },
  source: { type: String, enum: ['Citizen Photo', 'Satellite', 'IoT Sensor', 'Forest Patrol'], default: 'Citizen Photo' },
  imageUrl: { type: String, required: false },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  forestName: { type: String, required: true },
  state: { type: String, required: true },
  district: { type: String, required: false },
  aiConfidence: { type: Number, min: 0, max: 100 },
  severity: { type: String, enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'], default: 'HIGH' },
  riskScore: { type: Number, min: 0, max: 100 },
  satelliteConfidence: { type: Number, default: 0 },
  sensorConfidence: { type: Number, default: 0 },
  status: { type: String, enum: ['NEW', 'UNDER_VERIFICATION', 'VERIFIED', 'RESPONSE_DISPATCHED', 'CONTAINED', 'RESOLVED', 'FALSE_POSITIVE'], default: 'NEW' },
  aiExplanation: { type: String },
  affectedAreaHectares: { type: Number, default: 0.0 },
  detectedFeatures: [{ type: String }],
  featureBreakdown: [{ name: String, detected: Boolean, confidence: Number }],
  assignedTeam: {
    teamId: String,
    name: String,
    dispatchedAt: Date,
    etaMinutes: Number,
    notes: String
  },
  nearestStation: {
    stationId: String,
    name: String,
    distanceKm: Number,
    etaMinutes: Number,
    phone: String,
    coordinates: { lat: Number, lng: Number }
  },
  nearestWaterBody: {
    waterId: String,
    name: String,
    type: String,
    capacity: String,
    distanceKm: Number,
    distanceMeters: Number,
    coordinates: { lat: Number, lng: Number }
  },
  reporter: {
    name: String,
    phone: String,
    notes: String
  },
  timeline: [{
    time: String,
    message: String,
    type: String
  }],
  firePerimeter: { type: Object, required: false },
  estimatedArea: { type: Number, required: false },
  fireDangerScore: { type: Number, required: false },
  fireDangerFactors: { type: Object, required: false },
  spreadSimulation: { type: Object, required: false },
  populationExposure: { type: Object, required: false },
  nearbyLocations: [{ type: Object }],
  recommendedTeam: { type: Object, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
};

const SensorSchema = {
  sensorId: { type: String, required: true, unique: true },
  forestId: String,
  forestName: String,
  coordinates: { lat: Number, lng: Number },
  temperature: Number,
  humidity: Number,
  smokeIndex: Number,
  battery: Number,
  network: String,
  status: { type: String, enum: ['NORMAL', 'MODERATE', 'CRITICAL', 'OFFLINE'], default: 'NORMAL' },
  lastUpdate: Date
};

const ResponseTeamSchema = {
  teamId: { type: String, required: true, unique: true },
  name: String,
  forestId: String,
  state: String,
  coordinates: { lat: Number, lng: Number },
  phone: String,
  crewCount: Number,
  waterTenders: Number,
  aerialDrones: Number,
  status: { type: String, enum: ['AVAILABLE', 'DISPATCHED', 'ON_SCENE', 'STANDBY'], default: 'AVAILABLE' }
};

const ForestSchema = {
  forestId: { type: String, required: true, unique: true },
  name: String,
  state: String,
  district: String,
  coordinates: { lat: Number, lng: Number },
  areaHectares: Number,
  riskLevel: String,
  activeFires: Number,
  sensorCount: Number
};

module.exports = {
  IncidentSchema,
  SensorSchema,
  ResponseTeamSchema,
  ForestSchema
};
