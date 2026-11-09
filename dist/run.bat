@echo off
setlocal EnableExtensions
title ASR Studio UltraX (dist)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Install Node.js 22.2 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

if not "%~1"=="" set "ASR_GUI_PORT=%~1"
set "PORT=%ASR_GUI_PORT%"
if not defined PORT set "PORT=8760"

where curl >nul 2>nul
if not errorlevel 1 (
  curl -s -o nul --max-time 2 "http://127.0.0.1:%PORT%/" >nul 2>nul
  if not errorlevel 1 (
    echo ASR Studio UltraX is already running at http://127.0.0.1:%PORT%
    start "" "http://127.0.0.1:%PORT%"
    exit /b 0
  )
)

echo Starting ASR Studio UltraX (dist) on http://127.0.0.1:%PORT% ...
echo Press Ctrl+C to stop.
echo.
node gui.js
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
  echo.
  echo [ERROR] App exited with code %CODE%.
  pause
)
exit /b %CODE%
