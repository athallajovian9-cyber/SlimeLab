@echo off
setlocal EnableExtensions
title Slime Lab
cd /d "%~dp0"

echo.
echo   ============================================
echo    SLIME LAB
echo   ============================================
echo.

if not exist "slime_game.html" (
  echo   ERROR: slime_game.html is not in this folder.
  echo.
  echo   Keep LAUNCHER.bat next to slime_game.html.
  echo.
  pause
  exit /b 1
)

if exist "Slime Game.exe" (
  echo   Starting Slime Lab...
  start "" "Slime Game.exe"
  exit /b 0
)

set "BROWSER="
for %%P in (
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) do (
  if not defined BROWSER if exist "%%~P" set "BROWSER=%%~P"
)

set "HERE=%~dp0"
if defined BROWSER (
  echo   Browser: %BROWSER%
  set "PROFILE=%LocalAppData%\SlimeLab\profile"
  if not exist "%PROFILE%" mkdir "%PROFILE%" >nul 2>&1
  set "URL=file:///%HERE:\=/%slime_game.html"
  echo   Opening Slime Lab...
  start "" "%BROWSER%" --app="%URL%" --user-data-dir="%PROFILE%" --window-size=520,900 --no-first-run --no-default-browser-check
  exit /b 0
)

echo   No Chrome or Edge found - opening with the default browser.
start "" "%HERE%slime_game.html"
exit /b 0
