# SmartRoute Waste ♻️🚛

**On-demand waste collection for Vellore, Tamil Nadu.** Citizens request a pickup from their phone. The server groups nearby requests and plans capacity-aware truck routes. Drivers follow the route stop by stop, and recyclers buy the segregated recyclables that were collected.

> Innovative Design Project (IDP) · VIT Vellore · 2026

<p align="center">
  <img src="docs/screenshots/citizen-home.png" width="200" alt="Citizen app home">
  <img src="docs/screenshots/location-picker.png" width="200" alt="Pick pickup location">
  <img src="docs/screenshots/driver-route.png" width="200" alt="Driver route">
  <img src="docs/screenshots/recycler-market.png" width="200" alt="Recycler marketplace">
</p>
<p align="center">
  <img src="docs/screenshots/dashboard-livemap.png" width="820" alt="Admin dashboard: live map with clusters and routes">
</p>

## The problem
Most Indian cities collect garbage on **fixed routes on fixed days**. The truck passes empty streets and misses overflowing ones. Hazardous waste waits like everything else, and segregated recyclables end up in the landfill.

## What SmartRoute does
| | |
|---|---|
| 📱 **Citizen app** | Snap a photo, choose the type, amount and urgency, and pick the spot on a map (search, or drag the pin as in Uber / Rapido). Track the truck live and earn green credits for segregating waste. |
| 🧠 **Planner** | Groups nearby requests (**DBSCAN**), then solves a **capacity-constrained vehicle routing problem (CVRP)** with deadlines, truck–waste compatibility and priorities (OR-Tools). Urgent and hazardous requests are slotted into trucks already on the road. |
| 🚛 **Driver app** | Today's optimised route on a map, one-tap navigation, weight entry and proof photo at each stop, and live GPS. Drivers log in with an **employee ID + PIN**. |
| ♻️ **Recycler app** | Every collected recyclable or e-waste pickup becomes a lot that local recyclers can claim and buy. Recyclers also see their impact stats. |
| 🖥️ **Admin dashboard** | Live map with clusters and routes, one-click route planning, fleet and staff management, analytics, a **7-day demand forecast** and the evaluation report. |
| 🤖 **AI photo check** | A MobileNetV3 model (98.6% test accuracy) suggests the waste type from the photo and flags likely mis-segregation to the driver. |
| 🌐 **Tamil + English** | The whole app works in both languages and can be switched at any time. |

## Results (simulation)
One day, 120 requests across 10 Vellore wards, 4 trucks, re-planning every 4 hours:

| Strategy | Collected | On time | Total km | km per pickup | CO₂ |
|---|---|---|---|---|---|
| Fixed daily routes (today's system) | 84% | 79% | 225 km | 2.23 | 241 kg |
| Greedy nearest-request | 100% | 99% | 352 km | 2.94 | 378 kg |
| **SmartRoute (DBSCAN + CVRP)** | **100%** | **100%** | **195 km** | **1.63** | **209 kg** |

SmartRoute serves every request on time and drives **13% fewer km than fixed routes**. Compared with the fixed routes, it also has **0 late hazardous pickups** (fixed routes had 5).

The trade-off: the average wait is a little longer (3.6 h vs 3.4 h), because low-urgency requests wait to be batched. Re-planning more often than every ~4 hours removes the distance savings. All of this is in the dashboard's *Evaluation* page and `backend/app/engine/evaluate.py`.

## Architecture
```
 Citizen app ──requests, photos──►                          ◄── route, GPS ── Driver app
                                    FastAPI backend
                                    ├─ DBSCAN clustering (haversine)
 Recycler app ◄──── lots ──────     ├─ OR-Tools CVRP + SLA priorities      ──► Admin dashboard
                                    ├─ demand forecast (per ward)               (React + Leaflet)
                                    ├─ ONNX waste-photo classifier
                                    └─ PostgreSQL (Neon) / SQLite
```

| Folder | What | Tech |
|---|---|---|
| `backend/` | REST API, planner, forecasting, AI, auth (phone OTP, email reset) | Python, FastAPI, SQLAlchemy, OR-Tools, scikit-learn, ONNX Runtime |
| `mobile/citizen-app`, `collector-app`, `recycler-app` | The three Android apps | React Native (Expo SDK 58), TypeScript |
| `mobile/shared/core/` | Code shared by the apps: UI kit, maps, auth, Tamil/English strings | TypeScript, MapLibre GL |
| `dashboard/` | Municipal control room | React, Vite, Leaflet |
| `ml/` | Training notebook for the waste-photo classifier | PyTorch, Google Colab |

Maps and search are 100% free and open: OpenFreeMap tiles, plus an OpenStreetMap place index of Vellore built from the Overpass API, with Photon and Nominatim as backups.

## Try it
- **Android apps:** download the APKs from the [Releases](../../releases) page.
- **Run it yourself:** see [docs/SETUP.md](docs/SETUP.md) (laptop) and [DEPLOY.md](DEPLOY.md) (free cloud hosting on Render + Neon). For a real deployment, see [RELEASE.md](RELEASE.md).
- **Tests:** `cd backend && pytest`

## Limitations and next steps
- The results come from a **simulation** with synthetic demand, not real municipal data. A pilot in one ward would be the real test.
- Distances are straight-line × a road factor (1.35). Real road distances (OSRM) would make routes more accurate.
- The demo runs on free hosting, so the server takes about 1 minute to wake up after being idle.
- Next ideas: WhatsApp requests, QR-coded bins, and a leaderboard for wards.

## Team
- _Add names and LinkedIn links here_

## Credits
OpenStreetMap contributors · OpenFreeMap · Photon (Komoot) · Nominatim · Overpass API · Google OR-Tools · Expo · Kaggle *Garbage Classification* dataset (mostafaabla)

## License
[MIT](LICENSE)
