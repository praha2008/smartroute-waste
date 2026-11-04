# Deploying SmartRoute so anyone can install the apps

Goal: three Android APKs that anyone can install from a link, all talking to one backend hosted
on the internet. Everything below uses **free** plans. Total time is about 1 hour, done once.

```
 Phones (APKs) ──https──► Render (FastAPI backend) ──► Neon (PostgreSQL database)
 Dashboard (laptop/browser) ──https──┘
```

You need 4 free accounts: **GitHub**, **Neon**, **Render** and **Expo**. Use the same email for all of them.

---

## Step 1: Put the code on GitHub

1. Install **Git for Windows** (https://git-scm.com/download/win) with the default options, then restart VS Code.
2. In VS Code, open the `smartroute-waste` folder and click the **Source Control** icon in the left bar.
3. Click **Publish to GitHub**, sign in, and choose **Private repository**.
4. Wait for it to finish. Your code is now at `github.com/<you>/smartroute-waste`.

After later changes: in Source Control, type a message, click **Commit**, then **Sync**. Render redeploys automatically.

## Step 2: Create the database (Neon)

1. Go to https://neon.tech, sign up, and click **Create project**. Name it `smartroute` and choose region **AWS Asia Pacific (Singapore)**.
2. On the project dashboard, click **Connect** and copy the **connection string**. It looks like:
   `postgresql://neondb_owner:xxxx@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
3. Keep it safe; it's your database password.

## Step 3: Host the backend (Render)

1. Go to https://render.com and sign up **with GitHub**.
2. Click **New → Blueprint** and pick your `smartroute-waste` repo. Render reads `render.yaml` from the repo.
3. When it asks for **DATABASE_URL**, paste the Neon connection string, then click **Apply / Deploy**.
4. Wait about 5 minutes. When it shows **Live**, copy your URL, e.g. `https://smartroute-api-ab12.onrender.com`.
5. Test it: open `https://<your-url>/docs` in a browser. The first start loads the Vellore demo data automatically, so the demo logins work right away.

> **Free plan note:** Render puts the server to sleep after 15 minutes without use. The first
> request after that takes about 50 seconds while it wakes up (the apps wait for it). **Before a
> demo or review, open `https://<your-url>/docs` once to wake it up.**

## Step 4: Point the apps at the hosted backend

In a VS Code terminal:

```bat
cd mobile
node set-server-url.js https://smartroute-api-ab12.onrender.com
```

Use your own URL. This writes it into all 3 `app.json` files. Installed APKs use this address,
while Expo Go during development still uses your laptop automatically.

For the dashboard: on its login screen, put the same URL in the **API server** box.

## Step 5: Build the APKs (Expo EAS, free)

```bat
npm install -g eas-cli
eas login
```

Then, for each app:

```bat
cd mobile\citizen-app
npm install
eas build -p android --profile preview
```

- "Create an EAS project?" → **Y**
- "Generate a new Android Keystore?" → **Y**. Expo stores it for you, and later updates must be signed with the same key.
- The build runs in Expo's cloud and takes about 10–20 minutes on the free plan, depending on the queue. You can close the terminal; the build page link shows its progress.
- When it's done, you get a **download link + QR code** for the `.apk`.

Repeat for `mobile\collector-app` and `mobile\recycler-app`. You can find all builds later at
https://expo.dev → your project → **Builds**.

## Step 6: Install on any Android phone

1. Open the build link on the phone, or scan the QR code, and tap **Install**.
2. If Android asks, allow **Install unknown apps** for Chrome or your file manager.
3. Open the app. The green dot at the bottom of the login screen shows it reached the server. Log in with the demo accounts (see README).

To share with your guide or friends, send them the build link. Anyone with an Android phone can install it.

## Updating later

| You changed… | Do this |
|---|---|
| Backend code | Commit + Sync in VS Code → Render redeploys (about 3 min) |
| App code | Run `eas build -p android --profile preview` again for that app and share the new link |
| Server URL | `node set-server-url.js <url>`, then rebuild the APKs |

## Troubleshooting

- **App says "Cannot reach server":** the server may be waking up, so wait a minute and retry. Or open `<url>/docs` in a browser to check it's live.
- **Render build failed:** open the service → **Logs** and send the red lines to Claude.
- **EAS build failed:** open the build page link → the failed step → copy the error.
- **Reset the demo data:** Dashboard → **Users** → **Reset demo data** (type RESET).
