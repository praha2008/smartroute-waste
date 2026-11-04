/**
 * Sets the hosted backend address that the installed APKs connect to.
 *   node set-server-url.js https://smartroute-api.onrender.com
 * (Expo Go during development still auto-uses your laptop's IP.)
 */
const fs = require('fs');
const path = require('path');

const url = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(url)) {
  console.error('Usage: node set-server-url.js https://your-backend.onrender.com');
  process.exit(1);
}
for (const app of ['citizen-app', 'collector-app', 'recycler-app']) {
  const file = path.join(__dirname, app, 'app.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  cfg.expo.extra = { ...(cfg.expo.extra || {}), serverUrl: url };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`${app}: serverUrl = ${url}`);
}
