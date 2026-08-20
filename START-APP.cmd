@echo off
setlocal
set "PATH=%PATH%;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PROGRAMFILES%\nodejs"

cd /d "%~dp0palworld-breeding\mobile"

echo.
echo ===============================================
echo  Palforge - Dev Server (works on WiFi AND 5G)
echo ===============================================
echo.
echo  Makes JS changes land on the phone automatically.
echo  Works on ANY network the phone is on.
echo.
echo  When the dev URL is ready, this script will:
echo    - copy it to the Windows clipboard
echo    - save it to CURRENT-DEV-URL.txt in this folder
echo    - save a clickable CURRENT-DEV-URL.html page too
echo    - show it in a big banner here in this window
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: node not found.
    pause
    exit /b 1
)

if not exist "src\App.tsx" (
    echo ERROR: src\App.tsx missing.
    pause
    exit /b 1
)

echo Step 1 of 2: Reconciling npm dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo.
echo Step 2 of 2: Starting Metro dev server in TUNNEL mode...
echo (Takes ~10 seconds extra at startup to open the tunnel.)
echo.

call node scripts\start-dev.js

echo.
echo Dev server has stopped.
pause
