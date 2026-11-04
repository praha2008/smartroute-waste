/**
 * Put your Google Maps Android API key into all three apps (needed for the APK build;
 * Expo Go works without it).
 *   node set-maps-key.js AIzaSy...
 */
const fs = require('fs');
const path = require('path');

const key = (process.argv[2] || '').trim();
if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(key)) {
  console.error('Usage: node set-maps-key.js AIzaSy...   (copy the key from Google Cloud -> APIs & Services -> Credentials)');
  process.exit(1);
}
for (const app of ['citizen-app', 'collector-app', 'recycler-app']) {
  const file = path.join(__dirname, app, 'app.json');
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const plugins = (cfg.expo.plugins || []).filter((p) => (Array.isArray(p) ? p[0] : p) !== 'react-native-maps');
  plugins.push(['react-native-maps', { androidGoogleMapsApiKey: key }]);
  cfg.expo.plugins = plugins;
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`${app}: Google Maps key set`);
}
console.log('Done. Now build the APKs again (eas build -p android --profile preview).');
