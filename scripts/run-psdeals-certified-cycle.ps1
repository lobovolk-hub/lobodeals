[CmdletBinding()]
param(
  [ValidateSet('Plan', 'Preflight', 'Status', 'Resume')]
  [string]$Mode = 'Plan',

  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,

  [string]$Workspace,

  [string]$FactsPath,

  [string]$LogDirectory
)

$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath $ProjectRoot).Path
$entrypoint = Join-Path $projectPath 'scripts\run-psdeals-cycle.mjs'

if (-not (Test-Path -LiteralPath $entrypoint -PathType Leaf)) {
  throw "Runner entrypoint not found: $entrypoint"
}

$nodeCommand = Get-Command node -ErrorAction Stop
$nodePath = $nodeCommand.Source

if ([string]::IsNullOrWhiteSpace($LogDirectory)) {
  $LogDirectory = Join-Path $projectPath 'data\cycles\runner-logs'
}

$candidateLogPath = [System.IO.Path]::GetFullPath($LogDirectory, $projectPath)
$relativeLogPath = [System.IO.Path]::GetRelativePath($projectPath, $candidateLogPath)
if ($relativeLogPath -eq '..' -or $relativeLogPath.StartsWith("..$([System.IO.Path]::DirectorySeparatorChar)")) {
  throw 'LogDirectory must remain inside ProjectRoot.'
}

$resolvedLogParent = Split-Path -Parent $candidateLogPath
if (-not (Test-Path -LiteralPath $resolvedLogParent -PathType Container)) {
  New-Item -ItemType Directory -Path $resolvedLogParent -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $candidateLogPath -PathType Container)) {
  New-Item -ItemType Directory -Path $candidateLogPath | Out-Null
}
$logPath = (Resolve-Path -LiteralPath $candidateLogPath).Path

$mutexName = 'Local\LoboDeals-PSDeals-Certified-Cycle-Runner'
$mutex = [System.Threading.Mutex]::new($false, $mutexName)
$acquired = $false

try {
  $acquired = $mutex.WaitOne(0)
  if (-not $acquired) {
    Write-Error 'Another certified-cycle wrapper instance is already active.'
    exit 8
  }

  $runnerArgs = @($entrypoint)
  switch ($Mode) {
    'Plan' {
      if ([string]::IsNullOrWhiteSpace($Workspace)) { throw 'Workspace is required for Plan.' }
      $runnerArgs += @('plan', "--workspace=$Workspace")
    }
    'Preflight' {
      if ([string]::IsNullOrWhiteSpace($FactsPath)) { throw 'FactsPath is required for Preflight.' }
      $runnerArgs += @('preflight', "--facts=$FactsPath")
    }
    'Status' {
      if ([string]::IsNullOrWhiteSpace($Workspace)) { throw 'Workspace is required for Status.' }
      $runnerArgs += @('status', "--workspace=$Workspace")
    }
    'Resume' {
      if ([string]::IsNullOrWhiteSpace($Workspace)) { throw 'Workspace is required for Resume.' }
      $runnerArgs += @('resume', "--workspace=$Workspace")
    }
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $logFile = Join-Path $logPath "psdeals-certified-$($Mode.ToLowerInvariant())-$stamp.log"
  Write-Host "Executing: $nodePath $($runnerArgs -join ' ')"
  Write-Host 'Effect: invokes one local runner entrypoint; operational mode and write authorizations are unavailable in this wrapper.'

  & $nodePath @runnerArgs 2>&1 | Tee-Object -LiteralPath $logFile
  $exitCode = $LASTEXITCODE
  if ($exitCode -lt 0 -or $exitCode -gt 8) { exit 1 }
  exit $exitCode
}
finally {
  if ($acquired) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
