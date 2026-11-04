@echo off
title SmartRoute backend
cd /d "%~dp0backend"
if not exist .venv (
  echo Creating Python virtual environment...
  python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.txt
if not exist smartroute.db (
  echo Loading Vellore demo data...
  python -m app.seed --reset
)
echo.
echo  Backend running:  http://localhost:8000      API docs: http://localhost:8000/docs
echo  Phones use your Wi-Fi IP (see "IPv4 Address" below) with port 8000:
ipconfig | findstr /i "IPv4"
echo.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
