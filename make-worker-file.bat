@echo off
title PulseDesk - make worker file
cd /d "%~dp0"

echo.
echo   Building the single file you paste into Cloudflare...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is not installed. Get it from https://nodejs.org ^(green LTS button^).
  pause
  exit /b 1
)

if not exist "node_modules\esbuild" call npm install
call npm run worker:bundle
if errorlevel 1 (
  echo.
  echo   Build failed. Check your internet and try again.
  pause
  exit /b 1
)

echo.
echo   Done. The file is here:
echo   %~dp0worker\dist\worker.js
echo.
echo   Open it in Notepad, select all ^(Ctrl+A^), copy ^(Ctrl+C^),
echo   then paste it into the Cloudflare worker editor.
echo.
start "" "%~dp0worker\dist"
pause
