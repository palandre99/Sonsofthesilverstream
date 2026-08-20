@echo off
REM ============================================================
REM Palforge - COPY THE APP INSTALL LINK TO CLIPBOARD
REM ============================================================
REM Double-click me: the install page URL for the FAST Palforge
REM app lands in your clipboard. Paste it into Safari on the
REM iPhone (or into a message to yourself) and tap Install.
REM
REM Claude keeps INSTALL-LINK.txt pointed at the newest build.

set /p LINK=<"%~dp0INSTALL-LINK.txt"
echo %LINK%| clip
echo.
echo ===============================================
echo  Install link copied to clipboard:
echo.
echo  %LINK%
echo.
echo  Paste it in Safari on your iPhone - tap Install.
echo ===============================================
echo.
pause
