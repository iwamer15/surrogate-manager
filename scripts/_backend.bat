@echo off
rem Start the backend in its own window and wait until /health responds
start "Surrogate Manager - backend (close to stop)" /d "%ROOT%backend" cmd /k uv run uvicorn api.main:app --app-dir . --host 127.0.0.1 --port 8000
echo [wait] Starting backend ...
for /l %%i in (1,1,60) do (
  curl -s -o nul http://127.0.0.1:8000/health && exit /b 0
  ping -n 2 127.0.0.1 >nul
)
echo [ERROR] Backend did not start within 60 seconds. Check the "backend" window.
exit /b 1
