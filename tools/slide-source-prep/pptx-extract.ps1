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
  } catch { return $null }
}

function Convert-MsoTriStateToBoolean {
  param($Value)
  try {
    $state = [int]$Value
    if ($state -eq -1) { return $true }
    if ($state -eq 0) { return $false }
  } catch {}
  return $null
}

function Test-ShapeVisible {
  param($Shape)
  try {
    # msoFalse = 0. Mixed/unknown states are preserved conservatively.
    if ([int]$Shape.Visible -eq 0) { return $false }
  } catch {}
  return $true
}

function Test-ShapeIntersectsSlide {
  param($Shape, [double]$SlideWidth, [double]$SlideHeight)
  try {
    $left = [double]$Shape.Left
    $top = [double]$Shape.Top
    $width = [double]$Shape.Width
    $height = [double]$Shape.Height
    if ($width -le 0 -or $height -le 0) { return $false }
    $right = $left + $width
    $bottom = $top + $height
    if ($right -le 0 -or $bottom -le 0 -or $left -ge $SlideWidth -or $top -ge $SlideHeight) {
      return $false
    }
  } catch {
    # If geometry cannot be established, preserve the shape rather than guessing it is off-slide.
    return $true
  }
  return $true
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
  } catch { return $null }
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
  return [ordered]@{ fontSize = $fontSize; color = $color; bold = $bold; italic = $italic }
}

function Add-ShapeBlocks {
  param(
    $Shape,
    [System.Collections.Generic.List[object]]$Blocks,
    [double]$SlideWidth,
    [double]$SlideHeight
  )

  # Respect visibility before group recursion so an invisible group cannot expose visible descendants.
  if (-not (Test-ShapeVisible $Shape)) { return }

  # msoGroup = 6. Recurse into members rather than emitting the group container.
  try {
    if ([int]$Shape.Type -eq 6) {
      for ($index = 1; $index -le $Shape.GroupItems.Count; $index++) {
        Add-ShapeBlocks -Shape $Shape.GroupItems.Item($index) -Blocks $Blocks -SlideWidth $SlideWidth -SlideHeight $SlideHeight
      }
      return
    }
  } catch {}

  if (-not (Test-ShapeIntersectsSlide -Shape $Shape -SlideWidth $SlideWidth -SlideHeight $SlideHeight)) { return }

  $text = $null
  $type = 'text'
  try {
    if ($Shape.HasTable -ne 0) { $text = Get-TableText $Shape; $type = 'table' }
  } catch {}
  if ([string]::IsNullOrWhiteSpace($text)) { $text = Get-ShapeText $Shape; $type = 'text' }
  if ([string]::IsNullOrWhiteSpace($text)) { return }

  $style = Get-ShapeStyle $Shape
  $left = $null; $top = $null; $width = $null; $height = $null
  try { $left = [double]$Shape.Left } catch {}
  try { $top = [double]$Shape.Top } catch {}
  try { $width = [double]$Shape.Width } catch {}
  try { $height = [double]$Shape.Height } catch {}

  $Blocks.Add([ordered]@{
    type = $type
    text = ([string]$text -replace "`r`n?", "`n").Trim()
    visible = $true
    left = $left; top = $top; width = $width; height = $height
    fontSize = $style.fontSize; color = $style.color; bold = $style.bold; italic = $style.italic
  })
}

function Get-SpeakerNotes {
  param($Slide)
  $notes = New-Object System.Collections.Generic.List[string]
  try {
    foreach ($shape in $Slide.NotesPage.Shapes) {
      $skip = $false
      try {
        if ($shape.Type -eq 14) {
          $placeholderType = [int]$shape.PlaceholderFormat.Type
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
  $presentation = $powerPoint.Presentations.Open($resolvedInput, $true, $false, $false)

  $slideWidth = [double]$presentation.PageSetup.SlideWidth
  $slideHeight = [double]$presentation.PageSetup.SlideHeight
  $pages = New-Object System.Collections.Generic.List[object]

  for ($slideNumber = 1; $slideNumber -le $presentation.Slides.Count; $slideNumber++) {
    $slide = $presentation.Slides.Item($slideNumber)
    $blocks = New-Object System.Collections.Generic.List[object]
    foreach ($shape in $slide.Shapes) {
      Add-ShapeBlocks -Shape $shape -Blocks $blocks -SlideWidth $SlideWidth -SlideHeight $slideHeight
    }
    # Hidden slides remain represented: page identity must stay aligned with PDF page identity.
    $pageRecord = [pscustomobject][ordered]@{
      number = $slideNumber; width = $slideWidth; height = $slideHeight
      blocks = $blocks.ToArray(); speakerNotes = Get-SpeakerNotes $slide
    }
    [void]$pages.Add([object]$pageRecord)
  }

  # Explicit all-slide range + IncludeDocProperties/KeepIRM defaults. Include hidden slides so
  # rendered PDF page N remains source slide N.
  $presentation.PrintOptions.Ranges.ClearAll()
  $printRange = $presentation.PrintOptions.Ranges.Add(1, $presentation.Slides.Count)
  $presentation.ExportAsFixedFormat($resolvedPdf, 2, 1, 0, 1, 1, -1, $printRange, 1)
  if (-not (Test-Path -LiteralPath $resolvedPdf)) {
    throw "PowerPoint returned from PDF export but no PDF exists at $resolvedPdf"
  }

  $raw = [ordered]@{
    filename = [System.IO.Path]::GetFileName($resolvedInput)
    type = 'pptx'
    pages = $pages.ToArray()
  }
  $json = $raw | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($resolvedJson, $json, (New-Object System.Text.UTF8Encoding($false)))
} finally {
  if ($null -ne $printRange) { try { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($printRange) } catch {} }
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
