@echo off
rem Opens one window per mobile app. Scan each QR code with Expo Go.
cd /d "%~dp0mobile"
start "SmartRoute Citizen" cmd /k "cd citizen-app && npm install && npm start"
start "SmartRoute Collector" cmd /k "cd collector-app && npm install && npm start"
start "SmartRoute Recycler" cmd /k "cd recycler-app && npm install && npm start"
