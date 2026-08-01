@echo off
title PulseDesk
cd /d "%~dp0"

echo.
echo   PULSEDESK - created by Dheerav Tandon
echo   ------------------------------------
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed on this PC.
  echo.
  echo   1. Open https://nodejs.org
  echo   2. Download the big green "LTS" button and install it ^(keep clicking Next^)
  echo   3. Close this window and double-click run-pulsedesk.bat again
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo   First run - downloading what the app needs. This takes 2-5 minutes.
  echo   You only ever see this once.
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo   Something went wrong while downloading. Check your internet and try again.
    pause
    exit /b 1
  )
)

echo   Starting PulseDesk...
echo   ^(Close this black window to quit the app.^)
echo.
call npm start
