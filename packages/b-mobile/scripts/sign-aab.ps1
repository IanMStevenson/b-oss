# Signs a b-mobile release bundle (AAB) with the Play upload key. Run on the machine that holds the
# key (Windows). Needs a JDK on the PATH (jarsigner, keytool). See docs/RELEASING-android.md.
#
#   .\sign-aab.ps1 -Aab C:\path\to\app-release.aab -Keystore C:\keys\b-mobile-upload.jks
#
# Writes <name>-signed.aab next to the input, leaving the original untouched. jarsigner asks for the
# keystore and key passwords itself; they are never passed on the command line.
param(
  [Parameter(Mandatory = $true)][string]$Aab,
  [Parameter(Mandatory = $true)][string]$Keystore,
  [string]$Alias = 'upload'
)

$ErrorActionPreference = 'Stop'

foreach ($tool in 'jarsigner', 'keytool') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool not found on PATH. Install a JDK (e.g. winget install EclipseAdoptium.Temurin.21.JDK) and reopen the terminal."
  }
}
if (-not (Test-Path $Aab)) { throw "Bundle not found: $Aab" }
if (-not (Test-Path $Keystore)) { throw "Keystore not found: $Keystore" }

$out = [System.IO.Path]::ChangeExtension($Aab, $null).TrimEnd('.') + '-signed.aab'
Copy-Item -LiteralPath $Aab -Destination $out -Force

# SHA-256 is required for the signature; Play ignores timestamps for AABs.
& jarsigner -keystore $Keystore -sigalg SHA256withRSA -digestalg SHA-256 $out $Alias
if ($LASTEXITCODE -ne 0) { throw 'jarsigner failed' }

& jarsigner -verify $out
if ($LASTEXITCODE -ne 0) { throw 'signature did not verify' }

Write-Host ''
Write-Host "Signed bundle: $out"
Write-Host 'Signing certificate (the first upload registers this as the upload key; keep the SHA-256 line):'
& keytool -printcert -jarfile $out | Select-String -Pattern 'Owner|SHA256|Valid'
