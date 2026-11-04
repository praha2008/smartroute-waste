@echo off
title SmartRoute dashboard
cd /d "%~dp0dashboard"
if not exist node_modules (
  echo Installing dashboard packages - first time only...
  call npm install
)
start "" http://localhost:5173
call npm run dev
