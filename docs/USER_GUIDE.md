# SmartRoute Waste: user guide

How to use the live demo: the three Android apps and the admin dashboard. No laptop and no installation of developer tools is needed, only an Android phone with internet.

---

## 1. Links

| What | Link | When |
|---|---|---|
| **Server (wake-up link)** | https://smartroute-api-8lxy.onrender.com/meta | Open **first, every time** |
| **Admin dashboard** | https://smartroute-dashboard-ezba.onrender.com | Municipality control room (works on phone and laptop) |
| **Android apps (APKs)** | [Releases page](https://github.com/praha2008/smartroute-waste/releases) | Install once |
| Place search status | https://smartroute-api-8lxy.onrender.com/geo/status | Optional check |
| AI photo check status | https://smartroute-api-8lxy.onrender.com/ai/status | Optional check |

### ⚠️ Before you open any app: wake the server
The server runs on a free cloud plan and **sleeps after 15 minutes without use**.

1. Open **https://smartroute-api-8lxy.onrender.com/meta** in your phone browser.
2. Wait until some text appears (it starts with `{"city":"Vellore"...`). This takes **up to 1 minute** the first time.
3. Now open the apps. They respond instantly.

If an app says **"Cannot reach the server"** or keeps loading, the server is still waking up. Wait a few seconds and pull down to refresh.

---

## 2. Install the apps (Android)

1. On your phone, open the [Releases page](https://github.com/praha2008/smartroute-waste/releases) and download the APK you need:
   - `SmartRoute-Citizen-…apk`: for households and businesses
   - `SmartRoute-Driver-…apk`: for municipality truck drivers
   - `SmartRoute-Recycler-…apk`: for scrap dealers and recyclers
2. Open the downloaded file. If Android asks, allow **"Install unknown apps"** for your browser.
3. If it says **"App not installed"**, uninstall the older version first and try again.
4. Allow **location** and **camera** when the app asks. They're needed for the pickup spot and the photos.

On first launch each app asks for your **language** (English / தமிழ்) and shows a short intro. You can change the language later in **Account**.

---

## 3. Citizen app: request a pickup

**Create an account**
1. Tap **Create account**. Enter your name, 10-digit mobile number, email and a password.
2. Set your **home location**: drag the map under the pin, or type a place in the search box (e.g. "VIT", "CMC", "Katpadi bus stand") and pick it.
3. Tap **Send verification code**, then enter the 6-digit SMS code. In demo mode the code is shown on screen in a yellow box.

**Request a pickup**
1. Home → **Request a pickup**.
2. **Take a photo** of the waste. The AI suggests the waste type.
3. Choose the **type** (organic, recyclable, mixed, e-waste, hazardous), the **amount in kg** and the **urgency**.
4. Check the **pickup location** (tap the card to change it) and tap **Submit**.

**Track it:** the **Pickups** tab shows each request's status: Waiting → Scheduled → **Truck on the way** (with ETA and the number of stops before you) → **Collected**.

**Green credits:** you earn credits for each collected pickup, more for segregated waste and accurate estimates. See the **Rewards** tab.

**Forgot password?** On the login screen tap **Forgot password?** and enter your email. You get a 6-digit code to set a new password.

---

## 4. Driver app: collect along the route

1. Log in with the **Employee ID** and **4-digit PIN** given by the municipality (Admin dashboard → Users → Add driver).
2. The **Route** tab shows today's stops in the best order, on a map. Tap **Start route**.
3. For each stop: **Navigate** opens Google Maps directions. At the stop, enter the **weighed kg**, add a **proof photo**, and tap **Mark as collected**.
4. Can't collect (gate locked, not segregated…)? Choose **Can't collect** and a reason. The request goes back into the queue.
5. Urgent or hazardous requests can appear in your route automatically while you drive.

Forgot your PIN? The admin can give you a new one (Dashboard → Users → Collectors → **New PIN**).

---

## 5. Recycler app: buy segregated recyclables

1. Create an account with your company name and **yard location**, then verify your mobile number.
2. Wait for **approval** by the municipality (Dashboard → Users → Recyclers → **Approve**), then tap **Check again**.
3. **Market** shows every collected recyclable or e-waste lot with weight, price and distance, as a list or on a map. Tap a lot, then **Claim**.
4. After picking it up, go to **My lots** → **Confirm picked up**. **Impact** shows the kg recovered and CO₂ saved.

---

## 6. Admin dashboard (municipality)

Log in with the admin email and password set on the server.

| Page | Use it to |
|---|---|
| **Overview** | See today's numbers at a glance |
| **Live Map** | See requests, clusters and truck routes. Click **Plan routes** to run the optimiser |
| **Requests** | All pickup requests. The AI badge marks a possible wrong waste type |
| **Routes** | Stop order, distance and load of every truck |
| **Fleet** | Add trucks and **assign drivers** to them |
| **Users** | **Add driver / staff** (employee ID + PIN), approve recyclers, disable accounts, give a new PIN or password, **Clear operations** |
| **Analytics / Forecast / Evaluation** | Charts, the 7-day demand forecast per ward, SmartRoute vs fixed routes |

**A typical demo:**
1. Create a few requests in different areas from the citizen app.
2. In the dashboard, go to **Live Map → Plan routes**.
3. In the driver app, **Start route** and collect.
4. The citizen sees *Collected* and earns credits, and the recycler sees a new lot.

**Start fresh:** Users → **Clear operations** (type CLEAR) deletes all requests, routes, lots and photos but keeps every account.

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot reach the server" / loading forever | Open the wake-up link (section 1), wait for the text, then pull down to refresh in the app |
| Driver: "Wrong employee ID or PIN" | Check with the admin. After 5 wrong tries the ID is locked for 15 minutes |
| "No route assigned" in the driver app | The admin has to **Plan routes** in the dashboard, and the driver must be assigned to a truck (Fleet page) |
| Recycler stuck on "Waiting for approval" | Admin: Users → Recyclers → Approve, then tap **Check again** |
| Search shows few results | Type at least 2–3 letters of a real word ("katp", "vit uni", "hosp"). Places around Vellore are found best |
| Map is blank | Check the phone's internet. The map tiles load from the web |
| Something went wrong screen | Tap **Try again**, or **Log out and start again** |

Running it on your own laptop or server instead? See [SETUP.md](SETUP.md), [DEPLOY.md](../DEPLOY.md) and [RELEASE.md](../RELEASE.md).
