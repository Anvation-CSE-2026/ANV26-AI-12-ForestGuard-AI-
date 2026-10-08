# 🌲🔥 ForestGuard-AI
### Live AI Forest Fire Detection, Geospatial Mapping & Rapid Emergency Response System for India

> **TAGLINE: "Report. Locate. Alert. Respond."**  
> *"An AI-powered real-time forest fire emergency ecosystem connecting citizens, forest authorities, and response teams through one live geospatial command center."*

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Live%20Demo-success?logo=vercel&style=for-the-badge)](https://agni-rakshak-three.vercel.app/)
[![GitHub Repository](https://img.shields.io/badge/GitHub-ForestGuard--AI-181717?logo=github&style=for-the-badge)](https://github.com/Anvation-CSE-2026/ANV26-AI-12-ForestGuard-AI-)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Real-Time Engine](https://img.shields.io/badge/Real--Time-Socket.IO%20%7C%20Zero--Refresh-red?style=for-the-badge)](https://agni-rakshak-three.vercel.app/demo.html)

---

## 👥 Engineering Team & Project Credentials

> **EXPLORE • INNOVATE • TRANSFORM**  
> **Project: AI-Based Forest Fire Detection**  
> **Team Name: VibeCoders 🚀**

| Team Member | Role & Focus | LinkedIn Profile |
| :--- | :--- | :--- |
| **Suhas S** | Core AI Architecture, Emergency Coordination Engine & Full-Stack System Design | [**linkedin.com/in/suhas-s-081b84335 ↗**](https://www.linkedin.com/in/suhas-s-081b84335?utm_source=share_via&utm_content=profile&utm_medium=member_android) |
| **Sanjay V** | Geospatial Intelligence, Water Body Triangulation & Response Station Optimization | [**linkedin.com/in/sanjay-v-20abb13b8 ↗**](https://www.linkedin.com/in/sanjay-v-20abb13b8?utm_source=share_via&utm_content=profile&utm_medium=member_android) |
| **Shekhar Singh** | Dual-Spectrum YOLOv8 Detection, Drone Telemetry & Optical Vision Verification | **🛡️ Team VibeCoders Core** |
| **Sachin Gotur** | IoT Sensor Mesh Telemetry, Environmental Threat Modeling & Incident Analytics | **🌲 Team VibeCoders Core** |

---

## 🌐 Live Demo & Cloud Deployment Links

| Environment | Interface / Portal | Direct Live Link | Key Capabilities |
| :--- | :--- | :--- | :--- |
| 🏠 **Vercel Cloud** | **Home Landing Page** | [**Open Home Landing Page ➔**](https://agni-rakshak-three.vercel.app/) | Tactical intro flash card, dynamic glowing ember canopy, Team VibeCoders credentials |
| 🔀 **Vercel Cloud** | **Unified Dual Live Demo Hub** | [**Open Dual Split Demo ➔**](https://agni-rakshak-three.vercel.app/demo.html) | Side-by-side synchronized Citizen + Admin split view for rapid evaluation |
| 🚨 **Vercel Cloud** | **Admin Authority Command Center** | [**Open Admin Command Center ➔**](https://agni-rakshak-three.vercel.app/admin.html) | Instant Login, 🔬 Deep Zoom (Zoom 19), 🎯 Sector Default Zoom, real-time alert receipt, fleet dispatch |
| 👤 **Vercel Cloud** | **Citizen Emergency Dashboard** | [**Open Citizen Reporting Portal ➔**](https://agni-rakshak-three.vercel.app/user.html) | 6 reporting modes, YOLOv8 scoreboard, GPS search, real physical fire station & water body routing |
| 🚒 **Vercel Cloud** | **Fire Station Turnout Terminal** | [**Open Station Turnout Terminal ➔**](https://agni-rakshak-three.vercel.app/station.html) | Station alert receipt, turnout acceptance, drafting routes & turn-by-turn navigation |
| 🛰️ **Vercel Cloud** | **Satellite Thermal Radar** | [**Open Satellite Thermal Radar ➔**](https://agni-rakshak-three.vercel.app/satellite.html) | ISRO / MODIS thermal anomaly hotspots & Fire Radiative Power (FRP) tracking |
| 📡 **Vercel Cloud** | **IoT Microclimate Grid** | [**Open IoT Sensor Grid ➔**](https://agni-rakshak-three.vercel.app/iot.html) | Real-time temperature, humidity, and LoRaWAN mesh smoke telemetry |
| 📊 **Vercel Cloud** | **Analytics & Risk Intelligence** | [**Open Analytics & Simulation ➔**](https://agni-rakshak-three.vercel.app/analytics.html) | Historical fire trends, McArthur FFDI spread simulation & threat models |
| 🐙 **GitHub** | **Official Source Code Repository** | [**github.com/Anvation-CSE-2026/ANV26-AI-12-ForestGuard-AI-**](https://github.com/Anvation-CSE-2026/ANV26-AI-12-ForestGuard-AI-.git) | Complete source code, test scenarios, and GIS dataset |

---

## ⚡ Real-Time Multi-Device Fire Alert Delivery

ForestGuard-AI provides an instantaneous, end-to-end alert pipeline linking mobile citizen phones and laptop admin consoles across the country:

```
Mobile Citizen Dashboard (Smartphone)
              ↓
  POST /api/incidents (Multer / Express API)
              ↓
  Database Persistence (data/forestguard_db.json)
              ↓
  Socket.IO Real-Time Event: "new-fire-alert" + Resilient Background Sync Heartbeat
              ↓
  Laptop Admin Dashboard (Command Center)
              ↓
  ⚡ Zero-Refresh Alert Display + Live Audio Siren + Map Marker Update
```

- **Zero-Refresh Immediate Delivery**: When a user submits an alert from their smartphone, the admin console receives it instantly without needing to refresh the page or reload the map.
- **Duplicate Protection**: Uses canonical incident IDs (`incidentId`) to ensure duplicate events do not create multiple map markers or duplicate list cards.
- **Resilient Fallback**: Incorporates an intelligent background synchronization heartbeat that automatically updates the dashboard even across serverless cloud environments where WebSockets cannot persist across disconnected devices.

---

## 🌟 Key System Capabilities & Highlights

1. **🚫 Anti-Hoax & Fake Alert Signal**:
   - Both Native Computer Vision and YOLOv8 pipelines analyze uploaded images for authentic fire signatures.
   - Non-fire photos (scenery, random objects, sunset skies without fire) trigger an explicit **`⚠️ FAKE ALERT SIGNAL`** badge and 0% risk score to the user prior to submission.
   - If submitted anyway, the alert is clearly flagged as `FAKE ALERT` on the Admin console, preventing false panic and wasted fleet dispatches.

2. **📱 Edge-to-Edge Mobile Platform Mode & Default Desktop Mode Switcher**:
   - Header mini button control `[ 💻 Desktop ]` (Default) and `[ 📱 Mobile ]` allows 1-click toggling between display styles.
   - **Default Desktop Mode**: Full multi-column workstation layout, expanded map, side-by-side incident feed, Deep Zoom, FFDI, spread simulator, and dispatch controls.
   - **Dedicated Mobile Mode**: Edge-to-edge uniform layout with zero horizontal overflow, thumb-friendly cards, and fixed bottom navigation (`Live Map`, `Incidents`, `Dispatch`, `AI HUD`).

3. **🔬 Deep Zoom In (Tree & Building Level - Zoom 19)**:
   - High-resolution Google Hybrid satellite imagery allows inspecting Ground Zero at maximum resolution (`zoom: 19`).
   - Clearly view individual building footprints (e.g. KSSEM college blocks, DSATM campus, temples), access roads, and tree canopies.

4. **🎯 Sector Default Zoom (Zoom 15)**:
   - Coordinated 1-click camera reset framing the fire ground zero, nearest responding fire station (< 2 km), and nearest emergency waterbody together in one operational sector view.

5. **🚒 Real Physical Fire Stations & Actual Water Bodies**:
   - Triangulates actual government fire stations and certified drafting reservoirs/lakes within the immediate district.
   - Renders neat dotted orange response trajectory lines directly from the station building to the fire ground zero, and dotted blue water drafting routes from the lake.

6. **🔐 Admin Passcode Gate & Instant Login**:
   - Command dispatch and tactical approvals are guarded behind an administrative passcode.
   - Includes a **⚡ Instant Login** one-click bypass for rapid, frictionless jury and hackathon evaluations.

---

## 🗺️ Live Map Visual Legend

- 🔴 **RED**: Critical active fire (Pulsing radar shockwaves + subtle 500m core fire tint)
- 🟥 **RED OUTLINE**: Confirmed fire perimeter boundary (dash 4,4)
- 🟠 **ORANGE**: 1.5km Buffer perimeter (crisp dotted ring) & Dotted dispatch route from fire station
- 🟡 **YELLOW**: 5.0km Regional response sector (crisp dotted ring) & fire spread projection
- 🟣 **PURPLE / BADGE**: Emergency Forestry Response Station (`Team Ready 🛡️`)
- 🔵 **BLUE / SKY-BLUE**: Water drafting terminal / emergency lake & hose relay route (`💧`)
- 🟢 **GREEN**: Resolved / safe sector
- 🔷 **CYAN**: IoT microclimate sensor node (`📡`)

---

## 🚀 Live Demo Flow for Judges (Step-by-Step)

1. **Launch the Dual Live Demo**:
   Open [https://agni-rakshak-three.vercel.app/demo.html](https://agni-rakshak-three.vercel.app/demo.html).
2. **Step 1: Test Location Autocomplete & Real Facilities**:
   In the Citizen search box (Left pane), type **"DSATM Campus"** or **"KSSEM"** or **"Bandipur"**.
   - Ground zero is pinned.
   - Dotted orange line connects the real local fire station (within 0.4–1.1 km).
   - Dotted blue line connects the real emergency water reservoir.
   - Admin map (Right pane) synchronizes in real time.
3. **Step 2: Upload Fire Evidence & Test Anti-Hoax Engine**:
   - Upload a non-fire photo to observe the **`⚠️ FAKE ALERT SIGNAL`** trigger.
   - Upload a real fire photograph or choose a test scenario to view the **Fire & Criticality Scoreboard** calculate Fire Coverage %, Severity, and Authenticity.
4. **Step 3: Click SEND FIRE ALERT**:
   - Audio siren triggers on the Admin dashboard.
   - Incident appears at the top of the Admin queue without refreshing.
   - Admin map focuses on the ground zero sector.
5. **Step 4: Test 🔬 Deep Zoom & 🎯 Default Zoom**:
   - Click **🔬 Deep Zoom (Tree/Building)** to zoom deeply into Ground Zero at `zoom: 19` to view individual buildings and tree canopies.
   - Click **🎯 Default Zoom** to restore the operational sector view with the fire station and waterbody.
6. **Step 5: Dispatch Response Team**:
   - Admin unlocks via **⚡ Instant Login** (or passcode `admin123`), selects the recommended local unit and clicks **DEPLOY UNIT**.
   - Live emergency vehicle tracking animates along the dotted route to Ground Zero!

---

## 🛠️ Challenge Requirement Coverage Matrix

- [x] **Image-based fire detection**: Python FastAPI with OpenCV + Native Computer Vision Fallback.
- [x] **AI confidence score**: 0–100% confidence gauge with YOLOv8 feature breakdown.
- [x] **False-positive handling**: Non-fire and sunset test cases return safe classification with explainable reasoning.
- [x] **Fire localization**: GPS & interactive map coordinate pinning with autocomplete catalog.
- [x] **Fire severity classification**: CRITICAL, HIGH, MODERATE, NORMAL, FAKE ALERT.
- [x] **Explainable AI**: Visual feature breakdown (Flames, Smoke, Heat, Vegetation, Haze, Cloud).
- [x] **Geospatial visualization**: Google Maps JS API + High-res Google Hybrid satellite engine with building-level zoom.
- [x] **Simulated alert & dispatch**: Turnout workflow with ETA, waterbody drafting, and vehicle tracking.
- [x] **Anti-Hoax Verification**: AI fake score vs. authenticity evaluation.
- [x] **Cloud & Local Deployment**: Configured for Vercel Serverless and local Node.js.

---

## 💻 Tech Stack

- **Frontend**: Tailwind CSS, HTML5, Leaflet & Google Maps JavaScript API, Web Audio API (Synthesized dispatch sirens).
- **Backend**: Node.js, Express, Socket.IO, Multer, UUID.
- **AI Service**: Python FastAPI, OpenCV, NumPy, Pillow (`ai_service.py`) + Native Computer Vision Fallback (`services/aiVisionService.js`).
- **Database**: Persistent JSON store with Mongoose-compatible schema design (`data/forestguard_db.json`).
- **Geospatial Engine**: Haversine distance matrix, waypoint synthesis, Indian forest GIS dataset.
- **Cloud Hosting**: Vercel Serverless Functions (`vercel.json`, `api/index.js`).

---

## 🏃‍♂️ How to Run Locally

### Quick Start (Node.js Server)
```bash
npm install
npm start
```
Server listens simultaneously on:
- Primary Port: **http://localhost:8109**
- Compatibility Bridge: **http://localhost:3000**

### Full Dual-Stack (Python AI + Node.js)
```bash
# Terminal 1: Python AI Vision Engine
python ai_service.py

# Terminal 2: Node.js Command Server
npm start
```
*(On Windows, you can double-click `start.bat`)*

---

## 📄 License & Presentation Note

Distributed under the MIT License.  
*Note: Emergency notifications to government agencies, fire departments, or helplines are simulated for hackathon evaluation and demonstration purposes.*
