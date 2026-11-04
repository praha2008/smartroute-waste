# SmartRoute Waste

Dynamic, demand-driven waste collection for Vellore: citizens request pickups from an app, the backend
groups and routes the requests, drivers follow an optimized route, and recyclers buy the segregated
recyclables. This is the VIT IDP project.

```
 Citizen app ──requests──►                         ◄──route / GPS── Collector app
                         FastAPI backend + planner
 Recycler app ◄──lots────                          ──live data──►  Admin web dashboard
```

| Folder | What it is | Tech |
|---|---|---|
| `backend/` | REST API, database, route-planning engine, demo data | Python, FastAPI, SQLAlchemy, SQLite |
| `mobile/citizen-app/` | Households and businesses request pickups, track the truck, earn green credits | React Native (Expo SDK 58) |
| `mobile/collector-app/` | Drivers get today's route, navigate stop by stop, record actual weight and photo proof | React Native (Expo SDK 58) |
| `mobile/recycler-app/` | Recyclers browse and claim collected recyclable / e-waste lots | React Native (Expo SDK 58) |
| `mobile/shared/core/` | Code shared by all 3 apps (API client, login, map, UI kit) | TypeScript |
| `dashboard/` | Municipal control room: live map, route planning, fleet, users, analytics | React, Vite, Leaflet |

---

## 1. Install the tools (one time)

1. **Python 3.10 or newer**: https://www.python.org/downloads/ (tick "Add Python to PATH")
2. **Node.js 20 LTS or newer**: https://nodejs.org
3. On your Android or iPhone, install **Expo Go** from the Play Store or App Store.
4. Your phone and laptop must be on the **same Wi-Fi**. A mobile hotspot from one phone also works.

## 2. Start the backend

Double-click **`start-backend.bat`**, or run:

```bat
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.seed --reset
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API docs (try every endpoint here): http://localhost:8000/docs
- `--host 0.0.0.0` lets the phones on your Wi-Fi reach the backend.
- The first time, Windows Firewall will ask: click **Allow** (private networks).

## 3. Start the admin dashboard

Double-click **`start-dashboard.bat`**, or run:

```bat
cd dashboard
npm install
npm run dev
```

Open http://localhost:5173 and log in with `admin@smartroute.in` / `admin123`.

## 4. Run the mobile apps

Each app runs on its own port, so you can run all three at once in three terminals:

```bat
cd mobile\citizen-app
npm install
npm start
```

(`collector-app` and `recycler-app` work the same way.) Then scan the QR code with Expo Go
(Android) or the Camera app (iPhone).

The app guesses your laptop's IP automatically. If the login screen shows "Server … (not reachable)",
tap it and enter `http://<your-laptop-IP>:8000`. Run `ipconfig` and look for the "IPv4 Address" of
your Wi-Fi adapter.

If the QR code doesn't connect (common on college Wi-Fi), use `npm run tunnel` instead.

## 5. Demo logins

| App | Email | Password |
|---|---|---|
| Dashboard | admin@smartroute.in | admin123 |
| Citizen | citizen@smartroute.in (or user1 … user39) | citizen123 |
| Collector | driver1@smartroute.in … driver4 | driver123 |
| Recycler | recycler@smartroute.in, recycler2@smartroute.in | recycler123 |

To reset all data at any time: `python -m app.seed --reset`

## 6. End-to-end demo script (for reviews)

1. **Citizen app:** log in, tap **Request a pickup**, choose a waste type, quantity and urgency (the app shows the SLA window), set the location on the map, add a photo, submit.
2. **Dashboard → Live map:** the new pin appears (colour = waste type, size = urgency). Click **Plan routes now**: routes are drawn per truck, respecting capacity and which waste types each truck may carry.
3. **Collector app** (log in as the driver of that route): the route shows with numbered stops. Tap **Start route**. The phone's GPS is now sent to the server every 15 seconds.
4. **Citizen app:** the status becomes "Truck on the way", with the truck on the map, an ETA, and how many stops are before yours.
5. **Collector app:** open the stop, enter the weighed kg, add a proof photo, tap **Mark collected**. The citizen gets green credits, and their reliability score updates based on how accurate their estimate was.
6. **Recycler app:** if the pickup was dry recyclable or e-waste, a new lot appears in the Market. Claim it, then mark it picked up.
7. **Dashboard → Overview / Analytics:** the KPIs (SLA compliance, kg collected, utilization) update.

## 7. What's built so far, and what's next

Built:
- [x] Full data loop: generator → optimizer → collector → recycler
- [x] Waste-type SLA tiers + urgency → deadline + dynamic priority score
- [x] Capacity-aware, waste-type-compatible, priority-weighted route planner (greedy baseline, `backend/app/engine/planner.py`)
- [x] Live GPS tracking, ETAs, skip/re-queue handling
- [x] Green credits + user reliability score (handles untrustworthy crowdsourced estimates)
- [x] Recyclable lot marketplace (circular economy)
- [x] 14 days of Vellore demo history for analytics

Next:
- [ ] DBSCAN clustering (Haversine) of active requests → communities
- [ ] OR-Tools CVRP with time windows (SLA) + penalties, compared against the greedy baseline
- [ ] OSRM road-distance matrix (currently Haversine × 1.35 road factor)
- [ ] Rolling-horizon re-planning + live insertion of urgent requests
- [ ] Ward-level demand forecasting → suggested fleet size for tomorrow
- [ ] AI waste-photo classification
- [ ] Evaluation: fixed-schedule baseline vs SmartRoute (km, CO₂, utilization, SLA %)

## Tests

```bat
cd backend
pytest -q
```

This runs the whole flow (register → request → plan → collect → credits → recycler claim) and
checks capacity and waste-type constraints on every planned route.

## Editing the shared mobile code

`mobile/shared/core` is the single source of the code shared by the three apps. After changing it,
run `node mobile/sync-shared.js` to copy it into each app.

## Building APKs (to install without Expo Go)

Each app is set up to build an installable `.apk` using Expo's free cloud build service (EAS):

```bat
npm install -g eas-cli
eas login                      &rem free account at expo.dev
cd mobile\citizen-app
npm install
npm run build:apk              &rem first time it asks to create the project, press Y
```

After about 10–15 minutes, EAS gives you a download link and a QR code for the `.apk`. Repeat for
`collector-app` and `recycler-app`.

- The APK talks to the backend over plain `http://`. Android blocks that by default, so each
  `app.json` enables it through `expo-build-properties` (`usesCleartextTraffic`).
- An APK can't auto-detect your laptop's IP the way Expo Go does. On first launch, tap
  "Server" on the login screen and enter `http://<laptop-IP>:8000`. For the final demo, host the
  backend online (e.g. Render or Railway) so the APKs work on any network.
