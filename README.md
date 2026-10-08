# 🌲🔥 FORESTGUARD AI (AGNI-RAKSHAK)
### Live AI Forest Fire Detection, Geospatial Mapping & Rapid Emergency Response System for India

> **TAGLINE: "Report. Locate. Alert. Respond."**  
> *"An AI-powered real-time forest fire emergency ecosystem connecting citizens, forest authorities, and response teams through one live geospatial command center."*

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Live%20Demo-success?logo=vercel&style=for-the-badge)](https://agni-rakshak.vercel.app/demo.html)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Suhas--Saur%2FAgniRakshak-181717?logo=github&style=for-the-badge)](https://github.com/Suhas-Saur/AgniRakshak)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

---

## 🌐 Live Demo & Cloud Deployment Links

| Environment | Interface / Portal | Direct Live Link | Features |
| :--- | :--- | :--- | :--- |
| 🔀 **Vercel Cloud** | **Unified Dual Live Demo Hub** | [**Open Dual Split Demo ➔**](https://agni-rakshak.vercel.app/demo.html) | Side-by-side synchronized Citizen + Admin view |
| 👤 **Vercel Cloud** | **Citizen Reporting Dashboard** | [**Open Citizen Portal ➔**](https://agni-rakshak.vercel.app/user.html) | 6 reporting methods, YOLOv8 scoreboard, GPS |
| 🚨 **Vercel Cloud** | **Admin Authority Command Center** | [**Open Admin Center ➔**](https://agni-rakshak.vercel.app/admin.html) | Protected authorization gate + 1-Click Instant Login |
| 🏠 **Vercel Cloud** | **Home Landing Page** | [**Open Home Page ➔**](https://agni-rakshak.vercel.app) | 3s flash intro, dashboard launchpad |
| 🚒 **Vercel Cloud** | **Fire Station Turnout Terminal** | [**Open Station Terminal ➔**](https://agni-rakshak.vercel.app/station.html) | Turnout acceptance & route navigation |
| 🛰️ **Vercel Cloud** | **Satellite Thermal Radar** | [**Open Satellite Radar ➔**](https://agni-rakshak.vercel.app/satellite.html) | ISRO / MODIS thermal hotspots |
| 📡 **Vercel Cloud** | **IoT Microclimate Grid** | [**Open IoT Sensor Grid ➔**](https://agni-rakshak.vercel.app/iot.html) | Temperature, humidity, wind telemetry |
| 📊 **Vercel Cloud** | **Analytics & Risk Intelligence** | [**Open Analytics ➔**](https://agni-rakshak.vercel.app/analytics.html) | Fire spread simulation & history |
| 🐙 **GitHub** | **Source Code Repository** | [**github.com/Suhas-Saur/AgniRakshak**](https://github.com/Suhas-Saur/AgniRakshak) | Full source code, test data, and models |

> 💡 **Mirror Cloud URL**: [https://agnirakshak.vercel.app/demo.html](https://agnirakshak.vercel.app/demo.html)

---

## 💻 Local Presentation Links (When Running Locally)

When running the project locally (`node server.js` or `npm start`):

- 🔀 **Unified Dual Live Demo**: [http://localhost:8109/demo.html](http://localhost:8109/demo.html) *(or [http://localhost:3000/demo.html](http://localhost:3000/demo.html))*
- 👤 **Citizen Emergency Dashboard**: [http://localhost:8109/user.html](http://localhost:8109/user.html)
- 🚨 **Admin Command Center**: [http://localhost:8109/admin.html](http://localhost:8109/admin.html) *(Passcode: `admin123` or click ⚡ Instant Login)*
- 🏠 **Home Landing Page**: [http://localhost:8109/index.html](http://localhost:8109/index.html)

---

## 📑 Core Concept & Architecture

Forest fires in India threaten vital biodiversity reserves such as **Bandipur**, **Nagarhole**, **Kanha**, and **Jim Corbett**, as well as urban forest interface corridors along **Kanakapura Road (KSSEM, DSATM, Bannerghatta)**. Traditional alerts are often fragmented, slow, or plagued by false alarms (such as sunset twilight, ambient haze, or agricultural burning).

**FORESTGUARD AI** establishes a closed-loop emergency ecosystem centered on a **LIVE GEOSPATIAL MAP ENGINE**:

1. **User / Citizen Emergency Dashboard** (`/user.html`):
   - **6 Reporting Methods**: Image upload, camera snapshot, video upload, manual map pin, GPS geolocation, and location autocomplete search.
   - **YOLOv8 AI Scoreboard**: Displays **Fire Coverage %** (primary criticality driver), Criticality Level, AI Authenticity Score (Anti-Hoax), Fire Confidence, Smoke Level, and Anomaly Detection.
   - **Hyper-Local Entity Mapping**: Instantly connects Ground Zero to the nearest local fire station (within 0.4–1.5 km) and emergency water draft reservoirs (within 1.5–2.5 km) via neat dotted routes.
   - **Default Zoom Restore (`🎯`)**: 1-click restore to sector view showing fire, station, and water bodies together.

2. **Admin Command Operations Center** (`/admin.html`):
   - **Real-Time Streaming**: Live incident reception without page refresh via Socket.IO.
   - **Geospatial Radar**: High-resolution Google Hybrid satellite tiles, 500m/1.5km/5km impact rings, fire perimeters, and spread simulation.
   - **Hyper-Local Response Dispatch**: Ranked fire response units strictly in the same state/district, direct route plotting from the fire station building to the fire pin, and water draft pipeline relays.
   - **Anti-Overlap Tactical Layout**: Expanded 60% central map display with responsive sidebar management.

3. **Unified Live Demo Hub** (`/demo.html`):
   - **Synchronized Split Screen**: Citizen dashboard on the left, Admin command radar on the right.
   - Entering or searching any location on the Citizen panel immediately transmits telemetry to the Admin map in real time.

---

## 🗺️ Live Map Color Specifications

As defined in the project architecture:
- 🔴 **RED**: Critical active fire (Animated pulsing radar shockwaves)
- 🟥 **RED OUTLINE**: Fire perimeter & 500m Hot Zone
- 🟠 **ORANGE**: High-risk fire buffer & Dotted response route from fire station
- 🟡 **YELLOW**: 5km Response sector & fire spread projection
- 🟣 **PURPLE**: Fire response station building pin
- 🔵 **BLUE / SKY-BLUE**: Water drafting terminal / emergency lake & hose relay route
- 🟢 **GREEN**: Safe / resolved incident
- 🔷 **CYAN**: IoT microclimate sensor node

---

## 🚀 Live Demo Flow for Judges (Step-by-Step)

1. **Open the Dual Live Demo**:
   Open [https://agni-rakshak.vercel.app/demo.html](https://agni-rakshak.vercel.app/demo.html) *(or [http://localhost:8109/demo.html](http://localhost:8109/demo.html))*.
2. **Step 1: Test Location Autocomplete**:
   In the Citizen search box (Left pane), type **"DSATM Campus"** or **"KSSEM"** or **"Bandipur"**.
   - Ground zero is pinned.
   - Dotted orange line connects the local fire station (0.4–1.1 km away).
   - Dotted blue line connects the emergency water draft terminal.
   - Admin map (Right pane) syncs automatically!
3. **Step 2: Upload Fire Evidence**:
   Upload a fire photograph or choose a test scenario.
   - Watch the **Fire & Criticality Scoreboard** calculate Fire Coverage, Severity, and Authenticity.
4. **Step 3: Click SEND FIRE ALERT**:
   - Audio siren triggers on the Admin dashboard.
   - Incident card appears in the Admin queue.
   - Admin map focuses on the ground zero sector.
5. **Step 4: Dispatch Response Team**:
   - Admin selects the recommended local unit and clicks **DEPLOY UNIT**.
   - Live vehicle tracking animates along the dotted route to the fire ground zero!
6. **Step 5: Test Default Zoom Button**:
   - Zoom deep into a building footprint (zoom 18–20).
   - Click the **🎯 Default Zoom** button to instantly restore the sector view containing the fire, station, and waterbody.

---

## 🛠️ Challenge Requirement Coverage

- [x] **Image-based fire detection**: Python FastAPI with OpenCV + Native Computer Vision Fallback.
- [x] **AI confidence score**: 0–100% confidence gauge with YOLOv8 feature breakdown.
- [x] **False-positive handling**: Sunset and non-fire test cases return safe classification with explainable reasoning.
- [x] **Fire localization**: GPS & interactive map coordinate pinning with autocomplete catalog.
- [x] **Fire severity classification**: CRITICAL, HIGH, MODERATE, NORMAL.
- [x] **Explainable AI**: Visual feature breakdown (Flames, Smoke, Heat, Vegetation, Haze, Cloud).
- [x] **Geospatial visualization**: Google Maps JS API + High-res Google Hybrid satellite engine with building-level zoom.
- [x] **Simulated alert & dispatch**: Turnout workflow with ETA, waterbody drafting, and vehicle tracking.
- [x] **Anti-Hoax Verification**: AI fake score vs. authenticity evaluation.
- [x] **Cloud & Local Deployment**: Configured for Vercel Serverless and local Node.js.

---

## 💻 Tech Stack

- **Frontend**: Tailwind CSS, HTML5, Leaflet & Google Maps JavaScript API, Web Audio API (Synthesized dispatch sirens).
- **Backend**: Node.js, Express, Socket.IO, Multer, UUID.
- **AI Service**: Python FastAPI, OpenCV, NumPy, Pillow (`ai_service.py`) + Native Computer Vision Fallback (`aiVisionService.js`).
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

## 📄 License & Notes

Distributed under the MIT License.  
*Note: Emergency notifications to government agencies, fire departments, or helplines are simulated for hackathon evaluation and demonstration purposes.*
