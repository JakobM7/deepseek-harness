@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22.19 or newer is required.
  exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
  echo pnpm is required. Enable Corepack or install pnpm 11.7.0.
  exit /b 1
)

echo Building DeepSeek Harness artifacts...
call pnpm run build
if errorlevel 1 exit /b %errorlevel%

echo Building dsh-window.exe...
node tools\dsh-window\build.mjs
if errorlevel 1 exit /b %errorlevel%

echo.
echo Ready: %CD%\dsh-window.exe
exit /b 0
