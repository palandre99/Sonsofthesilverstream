@echo off
setlocal

REM ============================================================
REM Palforge - BUILD DEV CLIENT (~15 min, then never again)
REM ============================================================
REM Builds the "Palforge DEV" version of the app. This is the one
REM that talks to the Metro dev server on your PC, so JS changes
REM land on the phone the moment a file is saved.
REM
REM Only run this if you do NOT already have the Palforge DEV
REM icon on your phone. After it's installed, you never need
REM this again - START-APP.cmd takes over from there.
REM
REM YOU WILL BE ASKED TO LOG IN TO APPLE once:
REM   "Do you want to log in to your Apple account?"  ->  y
REM   Apple ID: palandre99@gmail.com  +  your password
REM   (a 2FA code pops up on your iPhone - type it in)
REM Every other question: just press Enter (defaults are right).

set "PATH=%PATH%;%LOCALAPPDATA%\Programs\nodejs;%APPDATA%\npm;%PROGRAMFILES%\nodejs"
cd /d "%~dp0palworld-breeding\mobile"

echo.
echo ===============================================
echo  Palforge - Build dev client (one-time, ~15 min)
echo ===============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: node not found. Install Node 20+ from https://nodejs.org and re-run.
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
echo Step 2 of 2: Triggering EAS DEVELOPMENT build for iOS...
echo (Interactive - answer y to the Apple login question and
echo  press Enter on everything else. --no-wait detaches after
echo  triggering; watch progress in the dashboard.)
echo.

call npx eas-cli build --profile development --platform ios --no-wait

echo.
echo ===============================================
echo  Build triggered.
echo ===============================================
echo.
echo Watch progress here (QR code appears when done):
echo   https://expo.dev/accounts/palandre99/projects/hatchlab/builds
echo.
echo When the build finishes, open that page ON YOUR PC, scan the
echo QR code with your iPhone camera, and the app installs.
echo From then on, double-click START-APP.cmd for live reload.
echo.
pause
