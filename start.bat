@echo off
title Vimicx Dev Server
echo ========================================
echo   VIMICX - Starting Local Dev Server
echo ========================================
echo.

:: Open browser after a short delay (gives server time to start)
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://127.0.0.1:8080"

:: Start the server (this blocks until Ctrl+C)
echo Server running at http://127.0.0.1:8080
echo Press Ctrl+C to stop.
echo.
npx.cmd -y http-server . --port 8080 -c-1
