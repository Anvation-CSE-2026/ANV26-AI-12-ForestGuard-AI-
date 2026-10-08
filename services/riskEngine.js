/**
 * ForestGuard AI Risk Engine
 * Multi-source fire verification combining Citizen Photo AI + Satellite Hotspots + IoT Sensors
 */

class RiskEngine {
  /**
   * Calculate comprehensive multi-source fire risk score
   * @param {Object} params
   * @param {number} params.aiConfidence - Image classification confidence (0-100)
   * @param {boolean} params.fireDetected - AI detected fire
   * @param {Object|null} params.nearestSatellite - Nearby satellite hotspot if any
   * @param {Object|null} params.nearestSensor - Nearby IoT sensor telemetry if any
   * @param {string} params.source - Initial reporting source (Citizen Photo, Satellite, IoT Sensor)
   */
  calculateRisk(params) {
    const {
      aiConfidence = 0,
      fireDetected = false,
      nearestSatellite = null,
      nearestSensor = null,
      source = 'Citizen Photo'
    } = params;

    let sourcesConfirming = 0;
    const sourceBreakdown = [];

    // 1. Citizen AI Score
    let citizenScore = 0;
    if (fireDetected) {
      citizenScore = aiConfidence;
      sourcesConfirming++;
      sourceBreakdown.push({
        source: 'CITIZEN PHOTO + AI',
        confidence: Math.round(aiConfidence),
        status: 'CONFIRMED'
      });
    } else {
      sourceBreakdown.push({
        source: 'CITIZEN PHOTO + AI',
        confidence: Math.round(aiConfidence),
        status: 'NO FIRE SIGNATURE'
      });
    }

    // 2. Satellite Hotspot Score
    let satelliteScore = 0;
    if (nearestSatellite && nearestSatellite.confidence) {
      satelliteScore = nearestSatellite.confidence;
      sourcesConfirming++;
      sourceBreakdown.push({
        source: `SATELLITE (${nearestSatellite.satellite || 'MODIS/VIIRS'})`,
        confidence: Math.round(satelliteScore),
        status: 'HOTSPOT DETECTED'
      });
    } else {
      sourceBreakdown.push({
        source: 'SATELLITE THERMAL RADAR',
        confidence: 0,
        status: 'NO ACTIVE HOTSPOT DETECTED'
      });
    }

    // 3. IoT Sensor Score
    let sensorRiskScore = 0;
    if (nearestSensor) {
      const temp = nearestSensor.temperature || 30;
      const humidity = nearestSensor.humidity || 50;
      const smoke = nearestSensor.smokeIndex || 10;

      // Risk formula based on thermodynamic forest fire factors
      const tempFactor = Math.min(40, (temp / 50) * 40);
      const humFactor = Math.min(30, ((100 - humidity) / 100) * 30);
      const smokeFactor = Math.min(30, (smoke / 100) * 30);

      sensorRiskScore = Math.min(99, Math.round(tempFactor + humFactor + smokeFactor));

      if (sensorRiskScore >= 65 || smoke > 60 || temp > 44) {
        sourcesConfirming++;
        sourceBreakdown.push({
          source: `IOT SENSOR (${nearestSensor.id})`,
          confidence: Math.round(sensorRiskScore),
          status: 'THRESHOLD EXCEEDED',
          details: `Temp: ${temp}°C | Humidity: ${humidity}% | Smoke: ${smoke}%`
        });
      } else {
        sourceBreakdown.push({
          source: `IOT SENSOR (${nearestSensor.id})`,
          confidence: Math.round(sensorRiskScore),
          status: 'NORMAL READINGS',
          details: `Temp: ${temp}°C | Humidity: ${humidity}% | Smoke: ${smoke}%`
        });
      }
    } else {
      sourceBreakdown.push({
        source: 'IOT SENSOR GRID',
        confidence: 0,
        status: 'NO SENSORS WITHIN 15KM RADIUS'
      });
    }

    // Combined Risk Calculation
    let combinedRisk = 0;
    let severity = 'LOW';
    let verificationSummary = '';

    if (sourcesConfirming >= 3) {
      // 3 Sources Confirm! (Citizen + Satellite + IoT)
      combinedRisk = Math.min(99, Math.round(0.40 * citizenScore + 0.30 * satelliteScore + 0.30 * sensorRiskScore + 5));
      severity = 'CRITICAL';
      verificationSummary = '3 SOURCES CONFIRM POTENTIAL FIRE (Citizen + Satellite + IoT)';
    } else if (sourcesConfirming === 2) {
      const activeScores = [citizenScore, satelliteScore, sensorRiskScore].filter(s => s > 0);
      const avg = activeScores.reduce((a, b) => a + b, 0) / activeScores.length;
      combinedRisk = Math.min(96, Math.round(avg + 2));
      severity = combinedRisk >= 75 ? 'CRITICAL' : 'HIGH';
      verificationSummary = '2 SOURCES CONFIRM POTENTIAL FIRE';
    } else if (sourcesConfirming === 1) {
      if (fireDetected) {
        combinedRisk = Math.round(citizenScore * 0.76);
        severity = combinedRisk >= 60 ? 'HIGH' : 'MODERATE';
        verificationSummary = 'SINGLE SOURCE - MANUAL VERIFICATION REQUIRED';
      } else if (sensorRiskScore > 70) {
        combinedRisk = sensorRiskScore;
        severity = 'HIGH';
        verificationSummary = 'IOT SENSOR EARLY WARNING - SATELLITE/CAMERA PENDING';
      } else if (satelliteScore > 70) {
        combinedRisk = satelliteScore;
        severity = 'HIGH';
        verificationSummary = 'SATELLITE THERMAL DETECTION - VISUAL CONFIRMATION PENDING';
      } else {
        combinedRisk = 22;
        severity = 'LOW';
        verificationSummary = 'INSUFFICIENT ANOMALY EVIDENCE';
      }
    } else {
      combinedRisk = Math.max(8, Math.round(citizenScore * 0.2));
      severity = 'LOW';
      verificationSummary = 'FALSE POSITIVE / SAFE - NO FIRE DETECTED';
    }

    return {
      combinedRiskScore: combinedRisk,
      severity,
      sourcesConfirming,
      verificationSummary,
      sourceBreakdown,
      criticalThresholdExceeded: combinedRisk >= 75
    };
  }
}

module.exports = new RiskEngine();
