@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "PROJECT_ROOT=D:\Proyectos\lobodeals"

if not exist "%PROJECT_ROOT%\package.json" (
  echo ERROR: No se encontro el proyecto en %PROJECT_ROOT%
  pause
  exit /b 1
)

cd /d "%PROJECT_ROOT%"
echo ============================================================
echo LOBODEALS - DAILY RUNNER V2.2F
echo Recently Added + Discounts + detalles selectivos + Monthly
echo Ended + certificacion + cache + postchecks
echo Reanuda un run incompleto o crea uno nuevo si el anterior termino
echo ============================================================
echo.

node scripts\lobodeals-daily-operator-v1.mjs --execute=EXECUTE_LOBODEALS_DAILY_V2 --project-root="%PROJECT_ROOT%"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo DAILY RUNNER TERMINADO CORRECTAMENTE.
) else (
  echo EL DAILY RUNNER SE DETUVO CON CODIGO %EXIT_CODE%.
  echo El progreso confirmado permanece en los checkpoints.
  echo No lo relances a ciegas si el error no es transitorio.
)
echo.
pause
exit /b %EXIT_CODE%
