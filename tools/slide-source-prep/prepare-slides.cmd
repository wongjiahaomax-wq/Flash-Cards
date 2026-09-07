@echo off
setlocal

set "SOURCE=%~1"
if "%SOURCE%"=="" (
  echo Drag a .pptx or .pdf onto this file, or paste the source path below.
  set /p "SOURCE=Source path: "
)

if "%SOURCE%"=="" (
  echo No source path provided.
  exit /b 1
)

pushd "%~dp0\..\.."
node tools\slide-source-prep\cli.mjs "%SOURCE%"
set "EXIT_CODE=%ERRORLEVEL%"
popd

echo.
if not "%EXIT_CODE%"=="0" (
  echo Slide preparation failed.
) else (
  echo Slide preparation complete.
)

if not "%~1"=="" pause
exit /b %EXIT_CODE%
