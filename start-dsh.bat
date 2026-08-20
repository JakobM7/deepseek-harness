@echo off
setlocal
cd /d "%~dp0"

call pnpm dsh web %*
exit /b %errorlevel%
