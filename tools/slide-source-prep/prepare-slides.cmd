@echo off
setlocal

set "PICKER_MODE=0"
pushd "%~dp0\..\.."
if "%~1"=="" (
  set "PICKER_MODE=1"
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-slides.ps1" -Pick
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-slides.ps1" -SourcePath "%~1"
)
set "EXIT_CODE=%ERRORLEVEL%"
popd

if "%PICKER_MODE%"=="1" if "%EXIT_CODE%"=="2" (
  exit /b 0
)

echo.
if not "%EXIT_CODE%"=="0" (
  echo Slide preparation failed.
)

pause
exit /b %EXIT_CODE%
