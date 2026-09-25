# Generates the Sheetly PWA icons from a square source image into public/icons.
# Windows-only (uses System.Drawing). Re-run to regenerate at other sizes.
#
# The source is a white square with the logo in the middle. This script crops
# the white margins, then places the logo on a fresh white square per target
# size with controlled insets:
#   - app icons ("any"):       logo spans ~55% of the tile
#   - maskable icon:           logo spans ~42% of the tile. Chromium (Chrome/Brave)
#                              crops maskable icons ~1.5x, breaching the safe zone,
#                              so the logo needs extra padding to look normal there.
#   - favicons (16/32):        logo spans ~82% of the tile (stays legible)
#
# Usage:
#   powershell -File scripts/generate-icons.ps1 -Source "path\to\icon.png"
#
# -Source is required. The master logo is intentionally not committed (it is a
# large binary), so there is no sensible default to fall back to.
param(
  [Parameter(Mandatory = $true)]
  [string]$Source
)

Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\public\icons"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (-not (Test-Path -LiteralPath $Source)) {
  throw "Source image not found: $Source"
}
$img = [System.Drawing.Image]::FromFile($Source)
$bmp = New-Object System.Drawing.Bitmap $img

# 1) find the content bounding box (background is near-white)
$minX = $bmp.Width; $minY = $bmp.Height; $maxX = -1; $maxY = -1
for ($x = 0; $x -lt $bmp.Width; $x += 2) {
  for ($y = 0; $y -lt $bmp.Height; $y += 2) {
    $c = $bmp.GetPixel($x, $y)
    if ($c.R -lt 238 -or $c.G -lt 238 -or $c.B -lt 238) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
$cw = $maxX - $minX + 2
$ch = $maxY - $minY + 2
$content = New-Object System.Drawing.Bitmap($cw, $ch)
$g0 = [System.Drawing.Graphics]::FromImage($content)
$g0.DrawImage($bmp, -$minX, -$minY)
$g0.Dispose()
$bmp.Dispose(); $img.Dispose()

function New-Icon {
  param([int]$Size, [string]$Path, [double]$LogoWidthFraction)
  $canvas = New-Object System.Drawing.Bitmap($Size, $Size)
  $g = [System.Drawing.Graphics]::FromImage($canvas)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::White)
  $lw = [int][math]::Round($Size * $LogoWidthFraction)
  $lh = [int][math]::Round($lw * $ch / $cw)
  $x = [int](($Size - $lw) / 2.0)
  $y = [int](($Size - $lh) / 2.0)
  $g.DrawImage($content, $x, $y, $lw, $lh)
  $g.Dispose()
  $canvas.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $canvas.Dispose()
}

New-Icon -Size 512 -Path (Join-Path $outDir "icon-512.png")          -LogoWidthFraction 0.55
New-Icon -Size 512 -Path (Join-Path $outDir "icon-maskable-512.png") -LogoWidthFraction 0.42
New-Icon -Size 192 -Path (Join-Path $outDir "icon-192.png")          -LogoWidthFraction 0.55
New-Icon -Size 180 -Path (Join-Path $outDir "apple-touch-icon.png")  -LogoWidthFraction 0.55
New-Icon -Size 32  -Path (Join-Path $outDir "favicon-32x32.png")     -LogoWidthFraction 0.82
New-Icon -Size 16  -Path (Join-Path $outDir "favicon-16x16.png")     -LogoWidthFraction 0.82
$content.Dispose()

# SVG wrapper that embeds the 512 raster (browser-tab favicon + manifest "any" icon).
$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><image width="512" height="512" href="icon-512.png"/></svg>'
[System.IO.File]::WriteAllText((Join-Path $outDir "icon.svg"), $svg)

Write-Output "Generated icons in $outDir"
Get-ChildItem -Path $outDir | ForEach-Object { "  $($_.Name) ($($_.Length) bytes)" }
