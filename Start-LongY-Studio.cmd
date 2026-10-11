@echo off
setlocal
cd /d "%~dp0"
python main.py --web
if errorlevel 1 pause
