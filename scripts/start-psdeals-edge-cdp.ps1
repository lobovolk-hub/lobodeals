param(
  [string]$Url = "https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc",
  [int]$Port = 9222,
  [string]$UserDataDir,
  [int]$StartupTimeoutMs = 30000,
  [int]$PortReleaseTimeoutMs = 15000,
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
if ($PortReleaseTimeoutMs -lt 0 -or $PortReleaseTimeoutMs -gt 30000) {
  throw "PortReleaseTimeoutMs must be between 0 and 30000."
}

$diagnostics = @()
$listeners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
  $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
  $diagnostics = @($owners | ForEach-Object {
    $ownerPid = $_
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
    $ownedProfile = $false
    if ($owner -and $owner.CommandLine) {
      $ownedProfile = $owner.CommandLine.IndexOf("--user-data-dir=$profilePath", [StringComparison]::OrdinalIgnoreCase) -ge 0
    }
    "PID=$ownerPid;Name=$($owner.Name);OperationalProfile=$ownedProfile"
  })
  $releaseDeadline = [DateTimeOffset]::UtcNow.AddMilliseconds($PortReleaseTimeoutMs)
  do {
    Start-Sleep -Milliseconds 250
    $listeners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  } while ($listeners.Count -gt 0 -and [DateTimeOffset]::UtcNow -lt $releaseDeadline)
  if ($listeners.Count -gt 0) {
    throw "Port $Port is already listening ($($diagnostics -join '|')). Refusing to attach to or terminate an unverified process."
  }
}

$edgeCandidates = @(@(
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) })
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
  try {
    $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
  } catch {
    Start-Sleep -Milliseconds 250
  }
} while (-not $version -and [DateTimeOffset]::UtcNow -lt $deadline)

if (-not $version -or -not $version.webSocketDebuggerUrl) {
  throw "Edge started but CDP did not become available before the timeout."
}

$cdpListeners = @(Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction Stop)
if ($cdpListeners.Count -ne 1) {
  throw "CDP became available but the port owner is ambiguous."
}
$cdpProcessId = $cdpListeners[0].OwningProcess
$cdpProcess = Get-Process -Id $cdpProcessId -ErrorAction Stop
if (-not $cdpProcess.Path -or [IO.Path]::GetFullPath($cdpProcess.Path) -ne $edgePath) {
  throw "CDP became available but the listener is not the exact Microsoft Edge executable."
}
$cdpProcessDetails = Get-CimInstance Win32_Process -Filter "ProcessId=$cdpProcessId" -ErrorAction Stop
$profileArgument = "--user-data-dir=$profilePath"
$portArgument = "--remote-debugging-port=$Port"
if (-not $cdpProcessDetails.CommandLine -or
    $cdpProcessDetails.CommandLine.IndexOf($profileArgument, [StringComparison]::OrdinalIgnoreCase) -lt 0 -or
    $cdpProcessDetails.CommandLine.IndexOf($portArgument, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
  throw "CDP became available but the listener does not own the exact operational profile and port."
}

$result = [ordered]@{
  launcher_version = 1
  launch_method = "powershell_start_process"
  powershell = $true
  state = "cdp_available"
  process_id = $cdpProcessId
  launch_process_id = $process.Id
  process_handoff_observed = $process.Id -ne $cdpProcessId
  edge_path = $edgePath
  port = $Port
  user_data_dir = $profilePath
  requested_url = $Url
  version_endpoint = "http://127.0.0.1:$Port/json/version"
  websocket_debugger_url = $version.webSocketDebuggerUrl
  visible = $true
  operational_profile_verified = $true
  attached_to_existing_process = $false
  terminated_existing_process = $false
  waited_for_unverified_port_release = $diagnostics.Count -gt 0
}

if ($Json) {
  $result | ConvertTo-Json -Compress
} else {
  $result | Format-List
}
