param(
  [string]$Url = "https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc",
  [int]$Port = 9222,
  [int]$FallbackPortStart = 9223,
  [int]$FallbackPortEnd = 9232,
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
if ($Port -lt 1024 -or $Port -gt 65535) {
  throw "Port must be between 1024 and 65535."
}
if ($FallbackPortStart -lt 1024 -or $FallbackPortEnd -gt 65535 -or
    $FallbackPortStart -gt $FallbackPortEnd -or
    ($FallbackPortEnd - $FallbackPortStart) -gt 9) {
  throw "Fallback port range must contain at most ten ports between 1024 and 65535."
}
if ($StartupTimeoutMs -lt 1000 -or $StartupTimeoutMs -gt 120000) {
  throw "StartupTimeoutMs must be between 1000 and 120000."
}
if ($PortReleaseTimeoutMs -lt 0 -or $PortReleaseTimeoutMs -gt 30000) {
  throw "PortReleaseTimeoutMs must be between 0 and 30000."
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

function Get-PortListeners {
  param([int]$CandidatePort)
  return @(Get-NetTCPConnection -LocalPort $CandidatePort -State Listen -ErrorAction SilentlyContinue)
}

$diagnostics = @()
$candidatePorts = @($Port)
if ($Port -eq 9222) {
  $candidatePorts += @($FallbackPortStart..$FallbackPortEnd)
}
$selectedPort = $null
$reuseOwnedSession = $false
$ownedSessionProcessId = $null
foreach ($candidatePort in ($candidatePorts | Select-Object -Unique)) {
  $listeners = @(Get-PortListeners -CandidatePort $candidatePort)
  if ($listeners.Count -eq 0) {
    $selectedPort = $candidatePort
    break
  }
  $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -eq 1) {
    $existingOwner = Get-CimInstance Win32_Process -Filter "ProcessId=$($owners[0])" -ErrorAction SilentlyContinue
    $exactProfile = $existingOwner -and $existingOwner.CommandLine -and
      $existingOwner.CommandLine.IndexOf("--user-data-dir=$profilePath", [StringComparison]::OrdinalIgnoreCase) -ge 0
    $exactPort = $existingOwner -and $existingOwner.CommandLine -and
      $existingOwner.CommandLine.IndexOf("--remote-debugging-port=$candidatePort", [StringComparison]::OrdinalIgnoreCase) -ge 0
    $exactExecutable = $existingOwner -and $existingOwner.ExecutablePath -and
      [IO.Path]::GetFullPath($existingOwner.ExecutablePath) -eq $edgePath
    if ($exactProfile -and $exactPort -and $exactExecutable) {
      $selectedPort = $candidatePort
      $reuseOwnedSession = $true
      $ownedSessionProcessId = [int]$owners[0]
      $diagnostics += "Port=$candidatePort;PID=$($owners[0]);Name=$($existingOwner.Name);OperationalProfile=True;Reused=True"
      break
    }
  }
  $diagnostics += @($owners | ForEach-Object {
    $ownerPid = $_
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerPid" -ErrorAction SilentlyContinue
    $ownedProfile = $false
    if ($owner -and $owner.CommandLine) {
      $ownedProfile = $owner.CommandLine.IndexOf("--user-data-dir=$profilePath", [StringComparison]::OrdinalIgnoreCase) -ge 0
    }
    "Port=$candidatePort;PID=$ownerPid;Name=$($owner.Name);OperationalProfile=$ownedProfile"
  })
}
if ($null -eq $selectedPort) {
  throw "No free Edge CDP port is available in the configured range ($($diagnostics -join '|')). Refusing to attach to or terminate any existing process."
}
$Port = [int]$selectedPort

New-Item -ItemType Directory -Path $profilePath -Force | Out-Null
$arguments = @(
  "--remote-debugging-port=$Port",
  "--remote-debugging-address=127.0.0.1",
  "--remote-allow-origins=*",
  "--user-data-dir=$profilePath",
  "--no-first-run",
  "--no-default-browser-check",
  $Url
)
$process = if ($reuseOwnedSession) {
  Get-Process -Id $ownedSessionProcessId -ErrorAction Stop
} else {
  Start-Process -FilePath $edgePath -ArgumentList $arguments -PassThru
}

$deadline = [DateTimeOffset]::UtcNow.AddMilliseconds($StartupTimeoutMs)
$version = $null
$targets = $null
do {
  try {
    $version = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
    $rawTargets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
    $targets = @($rawTargets)
  } catch {
    $version = $null
    $targets = $null
    Start-Sleep -Milliseconds 250
  }
} while ((-not $version -or -not $targets) -and [DateTimeOffset]::UtcNow -lt $deadline)

if (-not $version -or -not $version.webSocketDebuggerUrl) {
  throw "Edge started but CDP did not become available before the timeout."
}

function Test-CanonicalTargetUrl {
  param([string]$CandidateUrl)
  try {
    $candidate = [Uri]$CandidateUrl
    $expected = [Uri]$Url
    if ($candidate.Scheme -ne "https" -or $candidate.Host -ne "psdeals.net" -or
        $candidate.AbsolutePath -ne $expected.AbsolutePath) {
      return $false
    }
    $queryParts = @($candidate.Query.TrimStart('?').Split('&') | ForEach-Object {
      [Uri]::UnescapeDataString($_)
    })
    return $queryParts -contains "platforms=ps5,ps4" -and
      $queryParts -contains "sort=recently-added" -and
      $queryParts -contains "contentType[]=games" -and
      $queryParts -contains "contentType[]=bundles" -and
      $queryParts -contains "contentType[]=dlc"
  } catch {
    return $false
  }
}

$canonicalTargets = @($targets | Where-Object {
  $_.type -eq "page" -and (Test-CanonicalTargetUrl -CandidateUrl $_.url)
})
while ($canonicalTargets.Count -lt 1 -and [DateTimeOffset]::UtcNow -lt $deadline) {
  Start-Sleep -Milliseconds 250
  try {
    $rawTargets = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
    $targets = @($rawTargets)
    $canonicalTargets = @($targets | Where-Object {
      $_.type -eq "page" -and (Test-CanonicalTargetUrl -CandidateUrl $_.url)
    })
  } catch {
    $targets = @()
    $canonicalTargets = @()
  }
}
if ($canonicalTargets.Count -lt 1) {
  throw "CDP became available but /json/list did not expose the canonical PSDeals tab before the startup timeout."
}

$cdpListeners = @(Get-PortListeners -CandidatePort $Port)
if ($cdpListeners.Count -ne 1) {
  throw "CDP became available but the port owner is ambiguous."
}
$cdpProcessId = $cdpListeners[0].OwningProcess
$cdpProcess = Get-Process -Id $cdpProcessId -ErrorAction Stop
if (-not $cdpProcess.Path -or [IO.Path]::GetFullPath($cdpProcess.Path) -ne $edgePath) {
  throw "CDP became available but the listener is not the exact Microsoft Edge executable."
}
$profileArgument = "--user-data-dir=$profilePath"
$portArgument = "--remote-debugging-port=$Port"
$compatibleProcesses = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" -ErrorAction Stop | Where-Object {
  $_.CommandLine -and
  $_.CommandLine.IndexOf($profileArgument, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
  $_.CommandLine.IndexOf($portArgument, [StringComparison]::OrdinalIgnoreCase) -ge 0
})
if ($compatibleProcesses.Count -lt 1) {
  throw "CDP became available but no Microsoft Edge process owns the exact operational profile and port."
}

$launchProcessExited = $process.HasExited
$launchExitCode = if ($launchProcessExited) { $process.ExitCode } else { $null }
$handoffObserved = -not $reuseOwnedSession -and ($launchProcessExited -or $process.Id -ne $cdpProcessId)
$warnings = @()
if ($launchProcessExited) {
  $warnings += "initial_launch_process_exited_after_handoff"
}

$result = [ordered]@{
  launcher_version = 2
  launch_method = "powershell_start_process"
  powershell = $true
  state = "cdp_available"
  process_id = $cdpProcessId
  launch_process_id = $process.Id
  launch_process_exited = $launchProcessExited
  launch_process_exit_code = $launchExitCode
  process_handoff_observed = $handoffObserved
  compatible_process_ids = @($compatibleProcesses | Select-Object -ExpandProperty ProcessId)
  edge_path = $edgePath
  port = $Port
  user_data_dir = $profilePath
  requested_url = $Url
  version_endpoint = "http://127.0.0.1:$Port/json/version"
  list_endpoint = "http://127.0.0.1:$Port/json/list"
  websocket_debugger_url = $version.webSocketDebuggerUrl
  canonical_tab_count = $canonicalTargets.Count
  canonical_tab_url = $canonicalTargets[0].url
  visible = $true
  operational_profile_verified = $true
  attached_to_existing_process = $reuseOwnedSession
  reused_owned_operational_session = $reuseOwnedSession
  terminated_existing_process = $false
  preferred_port = $candidatePorts[0]
  fallback_port_selected = $Port -ne $candidatePorts[0]
  occupied_port_diagnostics = $diagnostics
  waited_for_unverified_port_release = $false
  ownership_proof = if ($reuseOwnedSession) {
    "existing_exact_edge_executable+exact_profile_process+exact_port_argument+version_endpoint+canonical_list_target"
  } else {
    "free_port_before_launch+exact_edge_executable+exact_profile_process+version_endpoint+canonical_list_target"
  }
  warnings = $warnings
}

if ($Json) {
  $result | ConvertTo-Json -Compress
} else {
  $result | Format-List
}
