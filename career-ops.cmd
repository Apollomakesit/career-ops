@echo off
REM Career Ops - one-click local launcher.
REM Double-click this file to start the dashboard, AI gateway, and runner
REM control on this machine, then open the dashboard in your browser.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0apps\job-dashboard\scripts\start-local.ps1" %*
if %ERRORLEVEL% neq 0 (
  echo.
  echo Launcher exited with an error. Review the messages above.
  pause
)
