const SCRIPT = String.raw`$ErrorActionPreference = "Stop"
$Repo = "jsserve-org/portglass"
$Tag = "cli-latest"

switch ($env:PROCESSOR_ARCHITECTURE) {
  "AMD64" { $Arch = "amd64" }
  "ARM64" { $Arch = "arm64" }
  default { throw "Unsupported CPU architecture: $env:PROCESSOR_ARCHITECTURE" }
}

$Asset = "portglass_windows_$Arch.zip"
$Base = "https://github.com/$Repo/releases/download/$Tag"
$Temp = Join-Path ([System.IO.Path]::GetTempPath()) ("portglass-" + [guid]::NewGuid())
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\Portglass"
New-Item -ItemType Directory -Force -Path $Temp, $InstallDir | Out-Null

try {
  Write-Host "Downloading Portglass CLI for windows/$Arch..."
  Invoke-WebRequest -UseBasicParsing "$Base/$Asset" -OutFile (Join-Path $Temp $Asset)
  Invoke-WebRequest -UseBasicParsing "$Base/checksums.txt" -OutFile (Join-Path $Temp "checksums.txt")
  $Expected = ((Get-Content (Join-Path $Temp "checksums.txt")) | Where-Object { $_ -match "  $([regex]::Escape($Asset))$" }).Split()[0]
  $Actual = (Get-FileHash -Algorithm SHA256 (Join-Path $Temp $Asset)).Hash.ToLowerInvariant()
  if (!$Expected -or $Expected.ToLowerInvariant() -ne $Actual) { throw "Checksum verification failed" }
  Expand-Archive -Force (Join-Path $Temp $Asset) $Temp
  Copy-Item -Force (Join-Path $Temp "portglass.exe") (Join-Path $InstallDir "portglass.exe")

  $UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if (($UserPath -split ';') -notcontains $InstallDir) {
    [Environment]::SetEnvironmentVariable("Path", (($UserPath.TrimEnd(';') + ";" + $InstallDir).TrimStart(';')), "User")
  }
  Write-Host "Installed Portglass CLI to $InstallDir\portglass.exe"
  Write-Host "Open a new terminal and run: portglass login"
} finally {
  Remove-Item -Recurse -Force $Temp -ErrorAction SilentlyContinue
}
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'inline; filename="install.ps1"',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
