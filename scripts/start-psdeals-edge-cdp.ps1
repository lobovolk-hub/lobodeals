param(
  [string]$Url = "https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc",
  [int]$Port = 9222,
  [string]$UserDataDir,
  [int]$StartupTimeoutMs = 30000,
  [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $UserDataDir) {
  $UserDataDir = Join-Path $projectRoot "data\edge\recovery-profile"
}
$profilePath = [IO.Path]::GetFullPath($UserDataDir)
$rootPrefix = $projectRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $profilePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Edge operational profile must stay inside the project root."
}
if ($Port -ne 9222) {
  throw "The LoboDeals Edge CDP contract requires port 9222."
}
if ($StartupTimeoutMs -lt 1000 -or $StartupTimeoutMs -gt 120000) {
  throw "StartupTimeoutMs must be between 1000 and 120000."
}

$listeners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
  throw "Port $Port is already listening. Refusing to attach to or terminate an unverified process."
}

$edgeCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if ($edgeCandidates.Count -eq 0) {
  throw "Microsoft Edge executable was not found."
}
$edgePath = [IO.Path]::GetFullPath($edgeCandidates[0])

New-Item -ItemType Directory -Path $profilePath -Force | Out-Null
$arguments = @(
  "--remote-debugging-port=$Port",
  "--remote-allow-origins=*",
  "--user-data-dir=$profilePath",
  "--no-first-run",
  "--no-default-browser-check",
  $Url
)
$process = Start-Process -FilePath $edgePath -ArgumentList $arguments -PassThru

$deadline = [DateTimeOffset]::UtcNow.AddMilliseconds($StartupTimeoutMs)
$version = $null
do {
  if ($process.HasExited) {
    throw "The dedicated Edge process exited before CDP became available."
  }
  try {
    $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
  } catch {
    Start-Sleep -Milliseconds 250
  }
} while (-not $version -and [DateTimeOffset]::UtcNow -lt $deadline)

if (-not $version -or -not $version.webSocketDebuggerUrl) {
  throw "Edge started but CDP did not become available before the timeout."
}

$result = [ordered]@{
  launcher_version = 1
  state = "cdp_available"
  process_id = $process.Id
  edge_path = $edgePath
  port = $Port
  user_data_dir = $profilePath
  requested_url = $Url
  version_endpoint = "http://127.0.0.1:$Port/json/version"
  websocket_debugger_url = $version.webSocketDebuggerUrl
  visible = $true
  attached_to_existing_process = $false
  terminated_existing_process = $false
}

if ($Json) {
  $result | ConvertTo-Json -Compress
} else {
  $result | Format-List
}
