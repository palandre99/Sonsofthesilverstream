@echo off
setlocal

REM ============================================================
REM HatchLab - PUSH OTA UPDATE (~2 minutes)
REM ============================================================
REM Pushes the latest JavaScript code to the installed app on
REM your phone via Expo's Update channel. No new build needed -
REM the app picks up the update on next launch.
REM
REM Use this for any JS-only change (UI, logic, new screens).
REM Native/permission changes need a full BUILD-DEV instead.

set "PATH=%PATH%;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PROGRAMFILES%\nodejs"
cd /d "%~dp0palworld-breeding\mobile"

echo.
echo ===============================================
echo  HatchLab - Push OTA Update
echo ===============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: node not found.
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
echo Step 2 of 2: Publishing OTA update to both channels...
echo.

call npx eas-cli update --branch development --message "HatchLab update"
call npx eas-cli update --branch preview --message "HatchLab update"

echo.
echo ===============================================
echo  Update published. Re-open HatchLab on your
echo  phone to receive it. Force-quit and reopen
echo  if needed.
echo ===============================================
echo.
pause
