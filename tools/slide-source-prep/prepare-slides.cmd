@echo off
setlocal

pushd "%~dp0\..\.."
if "%~1"=="" (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-slides.ps1" -Pick
) else (
  powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0prepare-slides.ps1" -SourcePath "%~1"
)
set "EXIT_CODE=%ERRORLEVEL%"
popd

echo.
if not "%EXIT_CODE%"=="0" (
  echo Slide preparation failed.
)

pause
exit /b %EXIT_CODE%
