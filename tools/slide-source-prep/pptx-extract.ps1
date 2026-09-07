param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$RenderedPdfPath,
  [Parameter(Mandatory = $true)][string]$JsonPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-OleRgbToHex {
  param($Value)
  if ($null -eq $Value) { return $null }
  try {
    $number = [int64]$Value
    if ($number -lt 0) { return $null }
    $r = $number -band 0xFF
    $g = ($number -shr 8) -band 0xFF
    $b = ($number -shr 16) -band 0xFF
    return ('#{0:X2}{1:X2}{2:X2}' -f $r, $g, $b)
  } catch {
    return $null
  }
}

function Convert-MsoTriStateToBoolean {
  param($Value)
  try {
    $state = [int]$Value
    if ($state -eq -1) { return $true }
    if ($state -eq 0) { return $false }
  } catch {}
  # Mixed/unknown formatting is not safely representable as one boolean.
  return $null
}

function Get-ShapeText {
  param($Shape)
  try {
    if ($Shape.HasTextFrame -ne 0 -and $Shape.TextFrame.HasText -ne 0) {
      return [string]$Shape.TextFrame.TextRange.Text
    }
  } catch {}
  return $null
}

function Get-TableText {
  param($Shape)
  try {
    if ($Shape.HasTable -eq 0) { return $null }
    $rows = New-Object System.Collections.Generic.List[string]
    for ($row = 1; $row -le $Shape.Table.Rows.Count; $row++) {
      $cells = New-Object System.Collections.Generic.List[string]
      for ($column = 1; $column -le $Shape.Table.Columns.Count; $column++) {
        $cellText = ''
        try { $cellText = [string]$Shape.Table.Cell($row, $column).Shape.TextFrame.TextRange.Text } catch {}
        $cells.Add(($cellText -replace "`r`n?", "`n").Trim())
      }
      $rows.Add(($cells -join "`t"))
    }
    return ($rows -join "`n").Trim()
  } catch {
    return $null
  }
}

function Get-ShapeStyle {
  param($Shape)
  $fontSize = $null
  $color = $null
  $bold = $null
  $italic = $null

  try {
    if ($Shape.HasTextFrame -ne 0 -and $Shape.TextFrame.HasText -ne 0) {
      $font = $Shape.TextFrame.TextRange.Font
      try { $fontSize = [double]$font.Size } catch {}
      try { $bold = Convert-MsoTriStateToBoolean $font.Bold } catch {}
      try { $italic = Convert-MsoTriStateToBoolean $font.Italic } catch {}
      try { $color = Convert-OleRgbToHex $font.Color.RGB } catch {}
    }
  } catch {}

  return [ordered]@{
    fontSize = $fontSize
    color = $color
    bold = $bold
    italic = $italic
  }
}

function Add-ShapeBlocks {
  param(
    $Shape,
    [System.Collections.Generic.List[object]]$Blocks
  )

  # msoGroup = 6. Recurse into group members rather than emitting the group container.
  try {
    if ([int]$Shape.Type -eq 6) {
      for ($index = 1; $index -le $Shape.GroupItems.Count; $index++) {
        Add-ShapeBlocks -Shape $Shape.GroupItems.Item($index) -Blocks $Blocks
      }
      return
    }
  } catch {}

  $text = $null
  $type = 'text'
  try {
    if ($Shape.HasTable -ne 0) {
      $text = Get-TableText $Shape
      $type = 'table'
    }
  } catch {}

  if ([string]::IsNullOrWhiteSpace($text)) {
    $text = Get-ShapeText $Shape
    $type = 'text'
  }
  if ([string]::IsNullOrWhiteSpace($text)) { return }

  $style = Get-ShapeStyle $Shape
  $left = $null
  $top = $null
  $width = $null
  $height = $null
  try { $left = [double]$Shape.Left } catch {}
  try { $top = [double]$Shape.Top } catch {}
  try { $width = [double]$Shape.Width } catch {}
  try { $height = [double]$Shape.Height } catch {}

  $Blocks.Add([ordered]@{
    type = $type
    text = ([string]$text -replace "`r`n?", "`n").Trim()
    left = $left
    top = $top
    width = $width
    height = $height
    fontSize = $style.fontSize
    color = $style.color
    bold = $style.bold
    italic = $style.italic
  })
}

function Get-SpeakerNotes {
  param($Slide)
  $notes = New-Object System.Collections.Generic.List[string]
  try {
    foreach ($shape in $Slide.NotesPage.Shapes) {
      $skip = $false
      try {
        if ($shape.Type -eq 14) { # msoPlaceholder
          $placeholderType = [int]$shape.PlaceholderFormat.Type
          # Slide number/header/footer/date placeholders are metadata, not speaker notes.
          if ($placeholderType -in @(13, 14, 15, 16)) { $skip = $true }
        }
      } catch {}
      if ($skip) { continue }

      $text = Get-ShapeText $shape
      if (-not [string]::IsNullOrWhiteSpace($text)) {
        $normalized = ([string]$text -replace "`r`n?", "`n").Trim()
        if (-not [string]::IsNullOrWhiteSpace($normalized)) { $notes.Add($normalized) }
      }
    }
  } catch {}
  return ($notes -join "`n").Trim()
}

$powerPoint = $null
$presentation = $null
$printRange = $null
try {
  $resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
  $resolvedPdf = [System.IO.Path]::GetFullPath($RenderedPdfPath)
  $resolvedJson = [System.IO.Path]::GetFullPath($JsonPath)

  $powerPoint = New-Object -ComObject PowerPoint.Application
  # Open(FileName, ReadOnly, Untitled, WithWindow)
  $presentation = $powerPoint.Presentations.Open($resolvedInput, $true, $false, $false)

  $slideWidth = [double]$presentation.PageSetup.SlideWidth
  $slideHeight = [double]$presentation.PageSetup.SlideHeight
  $pages = New-Object System.Collections.Generic.List[object]

  for ($slideNumber = 1; $slideNumber -le $presentation.Slides.Count; $slideNumber++) {
    $slide = $presentation.Slides.Item($slideNumber)
    $blocks = New-Object System.Collections.Generic.List[object]
    foreach ($shape in $slide.Shapes) {
      Add-ShapeBlocks -Shape $shape -Blocks $blocks
    }

    $pages.Add([ordered]@{
      number = $slideNumber
      width = $slideWidth
      height = $slideHeight
      blocks = @($blocks)
      speakerNotes = Get-SpeakerNotes $slide
    })
  }

  # PowerShell COM binding is more reliable with an explicit PrintRange object.
  # Values: PDF=2, screen intent=1, frame=false, output slides=1,
  # hidden slides=true, range type all=1. Including hidden slides preserves the
  # invariant that rendered PDF page N is source slide N.
  $presentation.PrintOptions.Ranges.ClearAll()
  $printRange = $presentation.PrintOptions.Ranges.Add(1, $presentation.Slides.Count)
  $presentation.ExportAsFixedFormat($resolvedPdf, 2, 1, 0, 1, 1, -1, $printRange, 1)
  if (-not (Test-Path -LiteralPath $resolvedPdf)) {
    throw "PowerPoint returned from PDF export but no PDF exists at $resolvedPdf"
  }

  $raw = [ordered]@{
    filename = [System.IO.Path]::GetFileName($resolvedInput)
    type = 'pptx'
    pages = @($pages)
  }
  $json = $raw | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($resolvedJson, $json, (New-Object System.Text.UTF8Encoding($false)))
} finally {
  if ($null -ne $printRange) {
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($printRange) } catch {}
  }
  if ($null -ne $presentation) {
    try { $presentation.Close() } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($presentation) } catch {}
  }
  if ($null -ne $powerPoint) {
    try { $powerPoint.Quit() } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($powerPoint) } catch {}
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
