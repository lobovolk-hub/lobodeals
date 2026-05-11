$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\Proyectos\lobodeals"
$LogsDir = Join-Path $ProjectRoot "logs"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$LogFile = Join-Path $LogsDir "metacritic-monthly-$Timestamp.log"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}

Set-Location $ProjectRoot

function Write-Log {
    param([string]$Message)
    $Line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | $Message"
    $Line | Tee-Object -FilePath $LogFile -Append
}

Write-Log "=== START METACRITIC MONTHLY RUN ==="

Write-Log "Step 1: reseeding queue"
node scripts/metacritic-monthly-reseed.mjs 2>&1 | Tee-Object -FilePath $LogFile -Append

Write-Log "Step 2: draining queue in batches"

for ($i = 1; $i -le 40; $i++) {
    Write-Log "Backfill run $i starting"

    $Output = node scripts/backfill-metacritic-local.mjs --limit=500 --browse-pages=133 2>&1
    $Output | Tee-Object -FilePath $LogFile -Append

    if ($Output -match "No pending Metacritic rows found.") {
        Write-Log "No pending rows left. Stopping early."
        break
    }
}

Write-Log "=== END METACRITIC MONTHLY RUN ==="