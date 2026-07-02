<#
  Gyeol MSIX packaging.
  - Default: unsigned .msix (for Microsoft Store upload; Store re-signs).
  - -Sign  : self-signed for LOCAL install/testing (.pfx/.cer + signtool).
  Prereq: release exe already built via `npx tauri build`. Windows SDK (makeappx/signtool).

  Usage:
    pwsh packaging/pack-msix.ps1                 # unsigned (Store upload)
    pwsh packaging/pack-msix.ps1 -Sign           # self-signed (local test)
    # Store submission (identity from Partner Center):
    pwsh packaging/pack-msix.ps1 -IdentityName "<Package Identity Name>" -Publisher "CN=<Publisher ID>" -PublisherDisplay "<Display>"

  (ASCII-only on purpose so it runs under both Windows PowerShell 5.1 and PowerShell 7.)
#>
[CmdletBinding()]
param(
  [string]$Publisher = "CN=Gyeol",
  [string]$IdentityName = "Gyeol.Gyeol",
  [string]$PublisherDisplay = "Gyeol",
  [switch]$Sign
)
$ErrorActionPreference = "Stop"

$root  = Split-Path -Parent $PSScriptRoot
$rel   = Join-Path $root "src\src-tauri\target\release"
$icons = Join-Path $root "src\src-tauri\icons"
$out   = Join-Path $PSScriptRoot "build"
$stage = Join-Path $out "stage"

# 1) locate app exe (Tauri builds as the Cargo bin name)
$exe = @("Gyeol.exe", "md-reader.exe") |
  ForEach-Object { Join-Path $rel $_ } |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { throw "Release exe not found. Run 'npx tauri build' first. ($rel)" }
$exeName = Split-Path $exe -Leaf

# 2) version (tauri.conf -> 4-part); read as UTF-8 (config contains non-ASCII)
$conf = [System.IO.File]::ReadAllText((Join-Path $root "src\src-tauri\tauri.conf.json"), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$ver3 = $conf.version
$ver4 = "$ver3.0"

# 3) locate SDK tools
$makeappx = (Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\makeappx.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1).FullName
if (-not $makeappx) { throw "makeappx.exe not found (install Windows SDK)." }
$signtool = Join-Path (Split-Path $makeappx) "signtool.exe"

# 4) stage
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $stage "Assets") | Out-Null
Copy-Item $exe (Join-Path $stage $exeName)
foreach ($n in @("StoreLogo.png","Square44x44Logo.png","Square71x71Logo.png","Square150x150Logo.png")) {
  Copy-Item (Join-Path $icons $n) (Join-Path $stage "Assets\$n")
}

# 5) render manifest (template is UTF-8)
$tpl = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot "msix\AppxManifest.template.xml"), [System.Text.Encoding]::UTF8)
$manifest = $tpl.Replace("@EXE@", $exeName).Replace("@VERSION@", $ver4).Replace("@PUBLISHER@", $Publisher).Replace("@IDENTITY_NAME@", $IdentityName).Replace("@PUBLISHER_DISPLAY@", $PublisherDisplay)
[System.IO.File]::WriteAllText((Join-Path $stage "AppxManifest.xml"), $manifest, (New-Object System.Text.UTF8Encoding($false)))

# 6) pack
$msix = Join-Path $out ("Gyeol_" + $ver3 + "_x64.msix")
& $makeappx pack /o /d $stage /p $msix
if ($LASTEXITCODE -ne 0) { throw "makeappx failed ($LASTEXITCODE)" }
Write-Host "MSIX created: $msix" -ForegroundColor Green
Write-Host "  exe=$exeName version=$ver4 identity=$IdentityName publisher=$Publisher"

# 7) optional: self-sign for local testing
if ($Sign) {
  $cert = New-SelfSignedCertificate -Type Custom -Subject $Publisher `
    -KeyUsage DigitalSignature -FriendlyName "Gyeol Dev Signing" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
  $pfx = Join-Path $out "gyeol-dev.pfx"
  $cer = Join-Path $out "gyeol-dev.cer"
  $pw  = ConvertTo-SecureString -String "gyeol" -Force -AsPlainText
  Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $pw | Out-Null
  Export-Certificate   -Cert $cert -FilePath $cer | Out-Null
  & $signtool sign /fd SHA256 /f $pfx /p "gyeol" $msix
  if ($LASTEXITCODE -ne 0) { throw "signtool failed ($LASTEXITCODE)" }
  Write-Host "Signed. To install locally, run in an ADMIN PowerShell:" -ForegroundColor Green
  Write-Host "  Import-Certificate -FilePath `"$cer`" -CertStoreLocation Cert:\LocalMachine\TrustedPeople"
  Write-Host "  Add-AppxPackage -Path `"$msix`""
}
