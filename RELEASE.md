# SmartRoute Waste v2: release guide

v2 adds:

- a Google-Maps-style map with search
- photos at any shape
- sign-up verified by phone, and password reset by email
- English and Tamil
- a new design for all three apps
- admin tools on the dashboard

## 1. Update the code (once)

```bat
cd smartroute-waste\mobile
node upgrade-v2.js
cd citizen-app   && npm install && cd ..
cd collector-app && npm install && cd ..
cd recycler-app  && npm install && cd ..
```

`upgrade-v2.js` adds the new packages (haptics, gradients, image resize, language detection, splash screen). It keeps your EAS project IDs and server URL as they are.

Then push the backend and dashboard so Render redeploys:

```bat
cd smartroute-waste
git add -A
git commit -m "v2: maps, phone OTP, Tamil, new UI"
git push
```

## 2. Render environment variables (api service → Environment)

| Variable | What to put | Needed? |
|---|---|---|
| `APP_MODE` | `release` for the final project (no demo logins on screen, reset only to admin + fleet). `demo` while practising | yes |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_PHONE` / `ADMIN_NAME` | Your real admin login. **Set it here only, never in code.** | yes |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SID` | Real SMS codes (see 3) | optional |
| `BREVO_API_KEY`, `EMAIL_FROM`, `EMAIL_FROM_NAME` | Real password-reset emails (see 4) | optional |

**What happens without SMS or email set up:** the app still works. The 6-digit code is shown on the screen in a yellow "Demo mode" box. The dashboard Users page shows which mode is active.

## 3. Real SMS codes: Twilio Verify (free trial)

1. Sign up at twilio.com. The trial gives free credit.
2. Go to **Verify → Services → Create**. Name it "SmartRoute" and copy the **Service SID** (starts with `VA…`).
3. From the console home, copy the **Account SID** (`AC…`) and the **Auth Token**.
4. Trial limitation: SMS only reaches numbers you have verified under **Phone Numbers → Verified Caller IDs**. Add your own phone and your guide's phone before the presentation.

## 4. Real reset emails: Brevo (free, 300 emails/day)

1. Sign up at brevo.com.
2. Go to **Senders → add sender** and verify your Gmail address. This becomes `EMAIL_FROM`.
3. Go to **SMTP & API → API keys → Generate**. This becomes `BREVO_API_KEY`.

## 5. Build the new APKs

In each app folder run `eas build -p android --profile preview`, then install the new APKs over the old ones.

## 6. Going live for the presentation

1. On Render, set `APP_MODE=release` and the `ADMIN_*` variables.
2. In the dashboard, go to **Users → Reset data → Release start**. Only your admin account and the 4 trucks remain.
3. Add each driver with **Users → Add staff account**. They get a temporary password and must change it at first login. Assign them a truck on the **Fleet** page.
4. Citizens and recyclers sign up themselves with their phone numbers. Approve recyclers on **Users → Recyclers → Approve**.
5. Between practice runs, use **Users → Clear operations**. It wipes requests and routes but keeps every account.
