@echo off
cd /d "%~dp0"
echo Starting EmpireForge Gemini Agent...
docker compose -f docker-compose.agent.yml up --build --force-recreate
pause
