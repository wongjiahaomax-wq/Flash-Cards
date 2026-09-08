[CmdletBinding()]
param(
  [Parameter(ParameterSetName = 'Picker')]
  [switch]$Pick,

  [Parameter(ParameterSetName = 'Source', Mandatory = $true, Position = 0)]
  [string]$SourcePath
)

$ErrorActionPreference = 'Stop'

try {
  $toolDirectory = Split-Path -Parent $MyInvocation.MyCommand.Definition
  $repositoryRoot = (Resolve-Path (Join-Path $toolDirectory '..\..')).Path
  Set-Location -LiteralPath $repositoryRoot

  if ($Pick) {
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    try {
      $dialog.Title = 'Choose a slide source'
      $dialog.Filter = 'PowerPoint or PDF (*.pptx;*.pdf)|*.pptx;*.pdf|PowerPoint (*.pptx)|*.pptx|PDF (*.pdf)|*.pdf'
      $dialog.FilterIndex = 1
      $dialog.Multiselect = $false
      $dialog.CheckFileExists = $true
      $dialog.CheckPathExists = $true

      if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
        exit 0
      }

      $SourcePath = $dialog.FileName
    } finally {
      $dialog.Dispose()
    }
  }

  if ([string]::IsNullOrWhiteSpace($SourcePath)) {
    exit 0
  }

  $resolvedSourcePath = [System.IO.Path]::GetFullPath($SourcePath)
  $cliPath = Join-Path $repositoryRoot 'tools\slide-source-prep\cli.mjs'
  & node $cliPath $resolvedSourcePath
  $cliExitCode = $LASTEXITCODE

  if ($cliExitCode -ne 0) {
    exit $cliExitCode
  }

  $sourceDirectory = [System.IO.Path]::GetDirectoryName($resolvedSourcePath)
  $sourceStem = [System.IO.Path]::GetFileNameWithoutExtension($resolvedSourcePath)
  $preparedDirectory = Join-Path $sourceDirectory ($sourceStem + '-prepared')

  if (-not (Test-Path -LiteralPath $preparedDirectory -PathType Container)) {
    Write-Error "Preparation succeeded but the expected output directory was not found: $preparedDirectory"
    exit 1
  }

  $explorerArgument = '"' + $preparedDirectory + '"'
  Start-Process -FilePath 'explorer.exe' -ArgumentList @($explorerArgument) | Out-Null
  exit 0
} catch {
  Write-Error $_
  exit 1
}
