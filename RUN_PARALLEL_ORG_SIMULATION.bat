@echo off
title ModCon HR - Live Parallel Organization Simulation
cd /d "%~dp0"
cls
echo ========================================================================
echo   MODCON HR - REAL-TIME PARALLEL ORGANIZATION SIMULATION
echo   Target: https://modcon-hr.vercel.app
echo   Organization: qazeroorg.test
echo   Engine: Google Chrome (6 Isolated Personas Parallel Sessions)
echo ========================================================================
echo.
echo Launching 6 concurrent employee workflows in Google Chrome...
echo Please look at your screen!
echo.
node scripts\simulate-live-parallel.mjs
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Simulation script exited with code %errorlevel%.
)
echo.
pause
