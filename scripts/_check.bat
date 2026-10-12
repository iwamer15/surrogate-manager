@echo off
rem Common checks and first-time setup (called from start.bat / start-electron.bat)
rem ASCII only on purpose: cmd.exe misreads UTF-8 Japanese text in .bat files

where uv >nul 2>nul
if errorlevel 1 (
  echo [ERROR] uv is not installed.
  echo   Install:  winget install --id=astral-sh.uv -e
  echo   Then close this window and run again.
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo   Install:  winget install OpenJS.NodeJS.LTS
  echo   Then close this window and run again.
  exit /b 1
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"
if errorlevel 1 (
  for /f %%v in ('node --version') do echo [ERROR] Node.js 22.12 or later is required. Current: %%v
  echo   Update:  winget upgrade OpenJS.NodeJS.LTS
  exit /b 1
)

if not exist "%ROOT%backend\.venv" (
  echo [setup] Installing Python packages ^(first time only^) ...
  pushd "%ROOT%backend"
  uv sync
  if errorlevel 1 ( popd & echo [ERROR] uv sync failed. See docs\WINDOWS.md & exit /b 1 )
  popd
)
if not exist "%ROOT%frontend\node_modules" (
  echo [setup] Installing Node packages ^(first time only, a few minutes^) ...
  pushd "%ROOT%frontend"
  call npm install
  if errorlevel 1 ( popd & echo [ERROR] npm install failed. See docs\WINDOWS.md & exit /b 1 )
  popd
)
exit /b 0
