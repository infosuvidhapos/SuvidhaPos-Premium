param(
  [string]$SvgPath = (Join-Path $PSScriptRoot '..\src\SuvidhaPOS-Premium\wwwroot\img\suvidha-pos-logo.svg'),
  [string]$OutputIco = (Join-Path $PSScriptRoot '..\src\SuvidhaPOS-Premium\suvidha-pos.ico')
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing

$svg=Get-Content $SvgPath -Raw -Encoding UTF8
$m=[regex]::Match($svg,'data:image/png;base64,(?<data>[^"]+)')
if(-not $m.Success){throw 'Original SuvidhaPOS embedded PNG was not found in logo SVG.'}
$raw=[Convert]::FromBase64String($m.Groups['data'].Value)
$input=New-Object IO.MemoryStream(,$raw)
$source=[Drawing.Bitmap]::FromStream($input)

$crop=New-Object Drawing.Rectangle(
  [int][Math]::Round($source.Width * 40 / 360.0),
  [int][Math]::Round($source.Height * 15 / 240.0),
  [int][Math]::Round($source.Width * 280 / 360.0),
  [int][Math]::Round($source.Height * 150 / 240.0)
)
$sizes=@(16,24,32,48,64,128,256)
$pngs=New-Object System.Collections.Generic.List[byte[]]
try{
  foreach($size in $sizes){
    $bmp=New-Object Drawing.Bitmap($size,$size,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try{
      $g=[Drawing.Graphics]::FromImage($bmp)
      try{
        $g.Clear([Drawing.Color]::FromArgb(255,7,18,31))
        $g.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.PixelOffsetMode=[Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $pad=[Math]::Max(1,[int][Math]::Round($size*0.055))
        $avail=$size-($pad*2)
        $scale=[Math]::Min($avail/$crop.Width,$avail/$crop.Height)
        $dw=[int][Math]::Round($crop.Width*$scale)
        $dh=[int][Math]::Round($crop.Height*$scale)
        $dx=[int](($size-$dw)/2)
        $dy=[int](($size-$dh)/2)
        $dest=New-Object Drawing.Rectangle($dx,$dy,$dw,$dh)
        $g.DrawImage($source,$dest,$crop,[Drawing.GraphicsUnit]::Pixel)
        if($size -ge 32){
          $pen=New-Object Drawing.Pen([Drawing.Color]::FromArgb(210,38,132,206),[Math]::Max(1,$size/128))
          try{$g.DrawRectangle($pen,0,0,$size-1,$size-1)}finally{$pen.Dispose()}
        }
      }finally{$g.Dispose()}
      $ms=New-Object IO.MemoryStream
      try{
        $bmp.Save($ms,[Drawing.Imaging.ImageFormat]::Png)
        $pngs.Add($ms.ToArray())
      }finally{$ms.Dispose()}
    }finally{$bmp.Dispose()}
  }

  $out=New-Object IO.MemoryStream
  $bw=New-Object IO.BinaryWriter($out)
  try{
    $bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$sizes.Count)
    $offset=6+(16*$sizes.Count)
    for($i=0;$i -lt $sizes.Count;$i++){
      $s=$sizes[$i]; $data=$pngs[$i]
      if($s -eq 256){$w=[byte]0;$h=[byte]0}else{$w=[byte]$s;$h=[byte]$s}
      $bw.Write($w); $bw.Write($h); $bw.Write([byte]0); $bw.Write([byte]0)
      $bw.Write([UInt16]1); $bw.Write([UInt16]32)
      $bw.Write([UInt32]$data.Length); $bw.Write([UInt32]$offset)
      $offset += $data.Length
    }
    foreach($data in $pngs){$bw.Write($data)}
    $bw.Flush()
    [IO.File]::WriteAllBytes($OutputIco,$out.ToArray())
  }finally{$bw.Dispose();$out.Dispose()}
}finally{
  $source.Dispose()
  $input.Dispose()
}
$ico=Get-Item $OutputIco
if($ico.Length -lt 5000){throw "Generated icon is unexpectedly small: $($ico.Length) bytes"}
Write-Host "Generated branded multi-size icon: $OutputIco ($($ico.Length) bytes)"
