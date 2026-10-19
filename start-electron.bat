@echo off
rem Surrogate Manager launcher (Windows / Electron desktop window)
rem  To stop: close the app window, then close the "backend" window.
rem ASCII only on purpose: cmd.exe misreads UTF-8 Japanese text in .bat files
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

call "%ROOT%scripts\_check.bat" || goto :fail
call "%ROOT%scripts\_backend.bat" || goto :fail

cd /d "%ROOT%frontend"
call npm run electron
exit /b 0

:fail
echo.
pause
exit /b 1
