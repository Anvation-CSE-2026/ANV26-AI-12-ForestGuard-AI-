# 🌲🔥 FORESTGUARD AI
### Live AI Forest Fire Detection, Mapping & Rapid Emergency Response System for India

> **TAGLINE: "Report. Locate. Alert. Respond."**  
> *"An AI-powered real-time forest fire emergency platform connecting citizens, forest authorities, and response teams through one live geospatial command center."*

---

## 📑 Core Concept & Architecture

Forest fires in India threaten vital biodiversity reserves such as **Bandipur**, **Nagarhole**, **Kanha**, and **Jim Corbett**. Traditional alerts are often fragmented, slow, or plagued by false alarms (such as sunset twilight, ambient haze, or agricultural burning).

**FORESTGUARD AI** establishes a closed-loop emergency ecosystem centered on a **LIVE GOOGLE MAP**:
1. **User / Citizen Emergency Dashboard** (`/user.html`): 6 reporting methods (Image upload, camera snapshot, video upload, manual map pin, GPS geolocation, location search), dynamic pre-send confirmation modal, real-time report tracker, and state-wise emergency telephone directory.
2. **Admin Command Operations Center** (`/admin.html`): Live Socket.IO alerts without refreshing, auto-zooming Google Map to ground zero, red pulsing marker with 500m/1km/5km impact rings, multi-source verification (Citizen + Satellite + IoT), ranked emergency response fleet, nearest water drafting source, and dispatch controls (preventing fake alerts).
3. **Fire Station & Response Team Terminal** (`/station.html`): Mission assignment reception, turnout acceptance, road transit simulation with live vehicle GPS telemetry, on-site arrival, and containment controls.

Instead of treating fire reports in isolation, the platform cross-references all 3 streams into a **Multi-Source Risk Score (0–100)**. When a critical threshold (≥75) is crossed, it transmits an instantaneous **Socket.IO alert to the Admin Command Center**, auto-zooms Google Maps, drops an animated **red pulsing fire marker**, calculates the **nearest Forest Response Unit** and **nearest water drafting source**, and coordinates simulated rapid dispatch!

---

## 🗺️ Live Google Map Color Specifications

As defined in the project architecture:
- 🔴 **RED**: Critical active fire (Animated pulsing radar shockwaves)
- 🟠 **ORANGE**: High-risk fire
- 🟡 **YELLOW**: Possible fire / verification required
- 🟢 **GREEN**: Safe / resolved incident
- 🔵 **BLUE**: Water body / reservoir / river draft terminal
- 🟣 **PURPLE**: Fire / forest department response station
- 🔷 **CYAN**: IoT microclimate sensor node

---

## 🚀 Live Demo Flow for Judges (Step-by-Step)

1. **Launch the Application**:
   Run `node server.js` (or double-click `start.bat`). Open [http://localhost:3000/admin.html](http://localhost:3000/admin.html) and [http://localhost:3000/report.html](http://localhost:3000/report.html).
2. **Step 1: Open Report Page**:
   Go to `/report.html`.
3. **Step 2: Select/Upload Fire Photograph**:
   Upload a fire image, or click one of the 1-click test scenarios (e.g. `🔥 Bandipur Wildfire` or `🌅 Sunset False-Alarm Test`).
4. **Step 3: Select Location on Google Map**:
   Click anywhere on the interactive map or click `📍 Use GPS Location`.
5. **Step 4: Click SUBMIT FIRE ALERT**:
   The backend AI pipeline runs, saves the incident, and transmits the `new_fire_alert` event.
6. **Step 5: Instant Real-Time Alert on Admin Dashboard**:
   **Without refreshing the page**:
   - 🚨 A flashing red emergency alert banner appears!
   - 🔊 The emergency dispatch siren sounds!
   - 🗺️ The Google Map smoothly **auto-zooms** to the exact fire coordinates!
   - 🔴 A glowing **red pulsing fire marker** appears!
   - 🧠 Admin sees: AI Confidence (e.g. `94.6%`), Severity (`CRITICAL`), Multi-Source Consensus (`3 SOURCES CONFIRM`), Nearest Response Unit (`Bandipur Forest Unit - 8.7 km, ETA 18 min`), and Nearest Water Body (`Kabini Reservoir - 14.2 km`).
7. **Step 6: Click DISPATCH RESPONSE**:
   Admin clicks `DISPATCH RESPONSE` → Confirms turnout in the tactical modal → Status advances to `RESPONSE DISPATCHED` → Logged on the live timeline!

---

## 🛠️ Challenge Requirement Coverage

- [x] **Image-based fire detection**: Python FastAPI with OpenCV & native JavaScript computer vision fallback.
- [x] **AI confidence score**: 0–100% confidence gauge.
- [x] **False-positive handling**: Sunset and non-fire test cases return safe classification with explainable reasoning.
- [x] **Fire localization**: GPS & interactive map coordinate pinning.
- [x] **Fire severity classification**: CRITICAL, HIGH, MODERATE, LOW.
- [x] **Explainable AI**: Visual feature breakdown (Flames, Smoke, Heat, Vegetation, Haze, Cloud).
- [x] **Geospatial visualization**: Google Maps JS API + High-res Google Hybrid satellite engine.
- [x] **Simulated alert & dispatch**: Turnout workflow with ETA and unit tracking.
- [x] **Multiple image testing**: Built-in test scenarios (Wildfire, Canopy Blaze, Sal Woods, Sunset).
- [x] **Non-fire test case**: Validated safe classification (97.1%).
- [x] **Risk threshold trigger**: Multi-source combined risk score (≥75 triggers critical alert).
- [x] **Multi-source verification**: Cross-references Citizen + Satellite + IoT.
- [x] **Real-time admin alert**: WebSockets / Socket.IO live streaming without page refresh.

---

## 💻 Tech Stack

- **Frontend**: Tailwind CSS, HTML5, Leaflet & Google Maps JavaScript API, Web Audio API (Synthesized dispatch sirens).
- **Backend**: Node.js, Express, Socket.IO, Multer, UUID.
- **AI Service**: Python FastAPI, OpenCV, NumPy, Pillow (`ai_service.py`) + Native Computer Vision Fallback (`aiVisionService.js`).
- **Database**: MongoDB / Mongoose schema definitions (`models/schemas.js`) with persistent JSON storage.
- **Geospatial Engine**: Haversine distance matrix, waypoint synthesis, Indian forest GIS dataset.

---

## 🏃‍♂️ How to Run

### Option 1: Quick Start (Node.js Server)
```bash
npm start
```
Open:
- 🌐 Landing Page: [http://localhost:3000](http://localhost:3000)
- 👤 User Emergency Dashboard: [http://localhost:3000/user.html](http://localhost:3000/user.html)
- 🚨 Admin Command Operations Center: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)
- 🚒 Fire Station & Response Terminal: [http://localhost:3000/station.html](http://localhost:3000/station.html)
- 📸 Dedicated Fire Report: [http://localhost:3000/report.html](http://localhost:3000/report.html)
- 🛰️ Satellite Thermal Radar: [http://localhost:3000/satellite.html](http://localhost:3000/satellite.html)
- 📡 IoT Sensor Grid: [http://localhost:3000/iot.html](http://localhost:3000/iot.html)
- 📊 Incident Analytics: [http://localhost:3000/analytics.html](http://localhost:3000/analytics.html)

### Option 2: Full Dual-Stack (Python AI + Node.js)
```bash
# Terminal 1: Python AI Vision Engine
python ai_service.py

# Terminal 2: Node.js Command Server
npm start
```
*(On Windows, you can simply double-click `start.bat`)*

---

*Note: Emergency notifications to government agencies, fire departments, or helplines are simulated for hackathon evaluation purposes.*
