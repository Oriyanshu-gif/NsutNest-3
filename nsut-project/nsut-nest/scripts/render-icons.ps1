Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

function New-Mark([int]$size, [bool]$maskable, [string]$file) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $accent = [System.Drawing.ColorTranslator]::FromHtml("#FF9ECB")
  $ink = [System.Drawing.Color]::FromArgb(255, 33, 11, 21)
  $s = $size / 48.0

  if ($maskable) {
    $brush = New-Object System.Drawing.SolidBrush($accent)
    $g.FillRectangle($brush, 0, 0, $size, $size)
    $brush.Dispose()
    $g.TranslateTransform([float]($size * 0.16), [float]($size * 0.16))
    $g.ScaleTransform([float]0.68, [float]0.68)
  } else {
    $r = [float](13 * $s); $x = [float](1 * $s); $y = [float](1 * $s)
    $w = [float](46 * $s); $h = [float](46 * $s); $d = $r * 2
    $badge = New-Object System.Drawing.Drawing2D.GraphicsPath
    $badge.AddArc($x, $y, $d, $d, 180, 90)
    $badge.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $badge.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $badge.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $badge.CloseFigure()
    $brush = New-Object System.Drawing.SolidBrush($accent)
    $g.FillPath($brush, $badge)
    $brush.Dispose()
    $badge.Dispose()
  }

  $glyph = New-Object System.Drawing.Pen($ink, [float](3.4 * $s))
  $glyph.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $glyph.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $glyph.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawLine($glyph, [float](16 * $s), [float](30.5 * $s), [float](16 * $s), [float](17 * $s))
  $g.DrawLine($glyph, [float](16 * $s), [float](17 * $s), [float](32 * $s), [float](30.5 * $s))
  $g.DrawLine($glyph, [float](32 * $s), [float](30.5 * $s), [float](32 * $s), [float](17 * $s))
  $glyph.Dispose()

  $nestPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(190, 33, 11, 21), [float](2.4 * $s))
  $nestPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $nestPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $nest = New-Object System.Drawing.Drawing2D.GraphicsPath
  $nest.AddBezier([float](13 * $s), [float](35 * $s), [float](17 * $s), [float](38 * $s), [float](31 * $s), [float](38 * $s), [float](35 * $s), [float](35 * $s))
  $g.DrawPath($nestPen, $nest)
  $nestPen.Dispose()
  $nest.Dispose()

  $g.Dispose()
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "$file done"
}

New-Mark 192 $false "public/icons/nsutnest-192.png"
New-Mark 512 $false "public/icons/nsutnest-512.png"
New-Mark 512 $true "public/icons/nsutnest-maskable-512.png"
