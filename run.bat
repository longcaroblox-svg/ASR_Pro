@echo off
setlocal EnableExtensions
title ASR Studio UltraX
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Install Node.js 22.2 or newer, then run this file again.
  echo.
  pause
  exit /b 1
)

node -e "const v=process.versions.node.split('.').map(Number); process.exit(v[0]>22||(v[0]===22&&v[1]>=2)?0:1)"
if errorlevel 1 (
  echo [ERROR] Node.js 22.2 or newer is required. Current version:
  node --version
  echo.
  pause
  exit /b 1
)

if not "%~1"=="" set "ASR_GUI_PORT=%~1"
set "PORT=%ASR_GUI_PORT%"
if not defined PORT set "PORT=8760"

rem Reuse an instance that is already running on this port.
where curl >nul 2>nul
if not errorlevel 1 (
  curl -s -o nul --max-time 2 "http://127.0.0.1:%PORT%/" >nul 2>nul
  if not errorlevel 1 (
    echo ASR Studio UltraX is already running at http://127.0.0.1:%PORT%
    if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
      start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="http://127.0.0.1:%PORT%"
    ) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
      start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="http://127.0.0.1:%PORT%"
    ) else (
      start "" "http://127.0.0.1:%PORT%"
    )
    exit /b 0
  )
)

echo Starting ASR Studio UltraX GUI on http://127.0.0.1:%PORT% ...
echo Press Ctrl+C to stop.
echo.

rem Prefer the bundled dist build (single-file modules + V8 compile cache).
set "ASR_ENTRY=src\gui.js"
if exist "dist\gui.js" if exist "dist\gui.bundle.mjs" set "ASR_ENTRY=dist\gui.js"
node "%ASR_ENTRY%"
set "CODE=%ERRORLEVEL%"

if not "%CODE%"=="0" (
  echo.
  echo [ERROR] App exited with code %CODE%.
  pause
)
exit /b %CODE%
