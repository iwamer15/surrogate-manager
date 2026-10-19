@echo off
rem Surrogate Manager launcher (Windows / browser)
rem  Double click this file. First run installs packages automatically.
rem  To stop: close the "backend" and "frontend" windows.
rem ASCII only on purpose: cmd.exe misreads UTF-8 Japanese text in .bat files
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

call "%ROOT%scripts\_check.bat" || goto :fail
call "%ROOT%scripts\_backend.bat" || goto :fail

start "Surrogate Manager - frontend (close to stop)" /d "%ROOT%frontend" cmd /k npm run dev
echo [wait] Starting frontend ...
for /l %%i in (1,1,60) do (
  curl -s -o nul http://localhost:5173 && goto :open
  ping -n 2 127.0.0.1 >nul
)
echo [ERROR] Frontend did not start within 60 seconds. Check the "frontend" window.
goto :fail

:open
start "" http://localhost:5173
echo.
echo Surrogate Manager is running:  http://localhost:5173
echo To stop, close the "backend" and "frontend" windows.
ping -n 6 127.0.0.1 >nul
exit /b 0

:fail
echo.
pause
exit /b 1
