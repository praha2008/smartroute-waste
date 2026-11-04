/**
 * One-time upgrade of the three apps to v2 (new UI, Tamil, maps, OTP).
 * Adds the new Expo packages to package.json and the splash screen to app.json,
 * WITHOUT touching your EAS projectId or serverUrl.
 *   node upgrade-v2.js        (then run "npm install" inside each app folder)
 */
const fs = require('fs');
const path = require('path');

const NEW_DEPS = {
  'expo-haptics': '~58.0.7',
  'expo-image-manipulator': '~58.0.16',
  'expo-linear-gradient': '~58.0.3',
  'expo-localization': '~58.0.5',
  'expo-splash-screen': '~58.0.13',
  'react-native-maps': '1.29.11',
};
const SPLASH = { 'citizen-app': '#0D5A3D', 'collector-app': '#132F57', 'recycler-app': '#97500A' };

for (const app of Object.keys(SPLASH)) {
  const dir = path.join(__dirname, app);
  const pkgFile = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  pkg.version = '2.0.0';
  pkg.dependencies = { ...pkg.dependencies, ...NEW_DEPS };
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

  const appFile = path.join(dir, 'app.json');
  const cfg = JSON.parse(fs.readFileSync(appFile, 'utf8'));
  const e = cfg.expo;
  e.version = '2.0.0';
  e.android = e.android || {};
  e.android.versionCode = 2;
  e.android.softwareKeyboardLayoutMode = 'resize';
  e.android.permissions = [...new Set((e.android.permissions || []).filter((p) => p !== 'android.permission.RECORD_AUDIO'))];
  e.backgroundColor = '#F4F6F5';
  const keep = (p) => !['expo-splash-screen', 'react-native-maps'].includes(Array.isArray(p) ? p[0] : p);
  const oldKey = (e.plugins || []).find((p) => Array.isArray(p) && p[0] === 'react-native-maps')?.[1]?.androidGoogleMapsApiKey;
  e.plugins = (e.plugins || []).filter(keep);
  e.plugins.push(['expo-splash-screen', { backgroundColor: SPLASH[app], image: './assets/adaptive-icon.png', imageWidth: 160 }]);
  e.plugins.push(['react-native-maps', { androidGoogleMapsApiKey: oldKey || 'PASTE_ANDROID_MAPS_KEY' }]);
  fs.writeFileSync(appFile, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`${app}: packages + splash updated (projectId ${e.extra?.eas?.projectId ?? 'not set yet'}, server ${e.extra?.serverUrl ?? 'not set'})`);
}
console.log('\nNow run  npm install  inside citizen-app, collector-app and recycler-app.');
