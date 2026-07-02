<#
  Gyeol portable zip. Tauri bundles the frontend into the exe, so the exe runs standalone
  (requires system WebView2 runtime; preinstalled on Win11).
  Prereq: release exe already built via `npx tauri build`.
  (ASCII-only so it runs under both Windows PowerShell 5.1 and PowerShell 7.)
#>
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$rel  = Join-Path $root "src\src-tauri\target\release"
$out  = Join-Path $PSScriptRoot "build"
New-Item -ItemType Directory -Force -Path $out | Out-Null

$exe = @("Gyeol.exe", "md-reader.exe") |
  ForEach-Object { Join-Path $rel $_ } |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { throw "Release exe not found. Run 'npx tauri build' first. ($rel)" }

$conf = [System.IO.File]::ReadAllText((Join-Path $root "src\src-tauri\tauri.conf.json"), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$stage = Join-Path $out "zip-stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
Copy-Item $exe (Join-Path $stage "Gyeol.exe")
$readme = "Gyeol $($conf.version) - portable`r`nRun Gyeol.exe. Requires Windows 10/11 + WebView2 runtime (built into Win11).`r`n100% offline; no install needed."
[System.IO.File]::WriteAllText((Join-Path $stage "README.txt"), $readme, (New-Object System.Text.UTF8Encoding($false)))

$zip = Join-Path $out ("Gyeol_" + $conf.version + "_x64_portable.zip")
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip
Write-Host "ZIP created: $zip" -ForegroundColor Green
