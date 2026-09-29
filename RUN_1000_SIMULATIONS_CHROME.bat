@echo off
title ModCon HR - 1000 Live Enterprise Simulations in Chrome
cd /d "%~dp0"
cls
echo ========================================================================
echo   MODCON HR - 1,000 ENTERPRISE SIMULATIONS LIVE IN GOOGLE CHROME
echo   Standard: Single Window Clean Display (No chaotic parallel tabs!)
echo   Target: qazeroorg.test - September 2026 Regularized Attendance and Payroll
echo ========================================================================
echo.
echo Launching Google Chrome... Please watch your screen!
echo.
node scripts\simulate-1000-live-chrome.mjs
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Script exited with code %errorlevel%.
)
echo.
pause
