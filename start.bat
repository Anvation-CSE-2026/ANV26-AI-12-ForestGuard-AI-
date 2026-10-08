@echo off
title FORESTGUARD AI - System Launcher
echo ====================================================================
echo  FORESTGUARD AI - Live Forest Fire Detection & Mapping System
echo ====================================================================
echo.
echo Starting Python FastAPI AI Vision Service on port 8000...
start "ForestGuard AI Vision Engine" cmd /k "python ai_service.py"

timeout /t 2 /nobreak >nul

echo Starting Node.js Command Server & Socket.IO on port 3000...
start "ForestGuard Command Server" cmd /k "node server.js"

timeout /t 2 /nobreak >nul

echo.
echo ====================================================================
echo All services launched! Opening Admin Command Center...
echo ====================================================================
start http://localhost:3000/admin.html
pause
