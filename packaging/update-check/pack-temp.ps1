<#
  Temp-identity MSIX for the "update while the agent bridge is running" check (roadmap-1.0 U6).
  NEVER the real identity/alias: Name=SlnU.README.md.UpdTest, alias readme-md-updtest.exe, display "README.md UpdTest".
  The exe must be built with the temp identifier com.readme.updtest (see README.md here) so the
  test never touches the real %APPDATA%\com.readme.app.

  -Thumbprint : a code-signing cert in Cert:\CurrentUser\My whose Subject equals -Publisher and which is
                trusted in Cert:\LocalMachine\TrustedPeople (Add-AppxPackage needs a trusted signature).

  (ASCII-only so it runs under Windows PowerShell 5.1.)
#>
param(
  [Parameter(Mandatory)][string]$Exe,
  [Parameter(Mandatory)][string]$Version,
  [Parameter(Mandatory)][string]$Out,
  [Parameter(Mandatory)][string]$Thumbprint,
  [string]$Publisher = "CN=1398342C-A2D7-4B4A-BFE2-34D8CCFD7FBA"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$stage = "$Out.stage"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force "$stage\Assets" | Out-Null
Copy-Item $Exe "$stage\md-reader.exe"
foreach ($n in "StoreLogo.png","Square44x44Logo.png","Square71x71Logo.png","Square150x150Logo.png") {
  Copy-Item "$repo\src\src-tauri\icons\$n" "$stage\Assets\$n"
}
$tpl = [IO.File]::ReadAllText("$repo\packaging\msix\AppxManifest.template.xml", [Text.Encoding]::UTF8)
$m = $tpl.Replace("@EXE@","md-reader.exe").Replace("@VERSION@",$Version).Replace("@PUBLISHER@",$Publisher).Replace("@IDENTITY_NAME@","SlnU.README.md.UpdTest").Replace("@PUBLISHER_DISPLAY@","UpdTest")
$m = $m.Replace('Alias="readme-md.exe"','Alias="readme-md-updtest.exe"').Replace('<DisplayName>README.md</DisplayName>','<DisplayName>README.md UpdTest</DisplayName>').Replace('DisplayName="README.md"','DisplayName="README.md UpdTest"')
# The real name or alias here would overwrite the user's Store install and its readme-md alias.
if ($m -match 'Alias="readme-md\.exe"' -or $m -match 'Name="SlnU\.README\.md"') { throw "real identity leaked into the temp manifest" }
[IO.File]::WriteAllText("$stage\AppxManifest.xml", $m, (New-Object Text.UTF8Encoding($false)))
$mk = (Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\makeappx.exe" | Sort-Object FullName -Descending | Select-Object -First 1).FullName
& $mk pack /o /d $stage /p $Out | Out-Null; if ($LASTEXITCODE) { throw "makeappx $LASTEXITCODE" }
& (Join-Path (Split-Path $mk) signtool.exe) sign /fd SHA256 /sha1 $Thumbprint $Out | Out-Null; if ($LASTEXITCODE) { throw "signtool $LASTEXITCODE" }
"packed $Out"
