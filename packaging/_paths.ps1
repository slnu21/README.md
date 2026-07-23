<#
  Shared helpers for the packaging scripts.
  (ASCII-only on purpose so it runs under both Windows PowerShell 5.1 and PowerShell 7.)
#>

# Cargo can redirect build output away from src-tauri\target (CARGO_TARGET_DIR env var, or
# build.target-dir in .cargo\config.toml -- this repo points it at D: on some machines).
# Resolve it the way cargo does; otherwise a leftover exe from an older build gets packaged
# under the new version number.
function Get-CargoReleaseDir {
  param([Parameter(Mandatory = $true)][string]$TauriDir)

  $targetDir = $env:CARGO_TARGET_DIR
  if (-not $targetDir) {
    foreach ($name in @("config.toml", "config")) {
      $cfg = Join-Path $TauriDir ".cargo\$name"
      if (Test-Path $cfg) {
        $m = [regex]::Match((Get-Content $cfg -Raw), '(?m)^\s*target-dir\s*=\s*"([^"]+)"')
        if ($m.Success) { $targetDir = $m.Groups[1].Value; break }
      }
    }
  }
  if (-not $targetDir) { $targetDir = Join-Path $TauriDir "target" }
  # A relative target-dir is relative to the directory holding .cargo (= src-tauri).
  if (-not [System.IO.Path]::IsPathRooted($targetDir)) { $targetDir = Join-Path $TauriDir $targetDir }
  return (Join-Path $targetDir "release")
}

# Refuse to package an exe left over from a previous version.
function Assert-ExeVersion {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(Mandatory = $true)][string]$Expected
  )
  $fv = (Get-Item $Exe).VersionInfo.FileVersion
  if (-not $fv) { return }
  $norm = ($fv -replace "[, ]", ".")
  if ($norm -notmatch ("^" + [regex]::Escape($Expected) + "(\.|$)")) {
    throw "Release exe is version '$fv' but tauri.conf.json says '$Expected'. Rebuild with 'npx tauri build'. ($Exe)"
  }
}
