/**
 * The three apps share the same core code (API client, login, map, UI kit).
 * The single source of truth is mobile/shared/core. After editing anything
 * there, run:   node sync-shared.js
 * and it is copied into every app's src/core folder.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'shared', 'core');
const APPS = ['citizen-app', 'collector-app', 'recycler-app'];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

for (const app of APPS) {
  const dest = path.join(__dirname, app, 'src', 'core');
  fs.rmSync(dest, { recursive: true, force: true });
  copyDir(SRC, dest);
  console.log(`synced shared core -> ${app}/src/core`);
}
