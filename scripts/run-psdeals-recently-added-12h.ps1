$ErrorActionPreference = "Stop"

$projectRoot = "D:\Proyectos\lobodeals"
Set-Location $projectRoot

$stamp = Get-Date -Format "yyyy-MM-dd-HH-mm-ss"

$logDir = "logs\psdeals-recently-added"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$log = Join-Path $logDir "psdeals-recently-added-12h-$stamp.log"

function Write-Step {
  param([string]$Message)

  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $log -Value $line
}

function Run-Node {
  param(
    [string[]]$NodeArgs,
    [string]$StepName
  )

  Write-Step $StepName
  Write-Step ("node " + ($NodeArgs -join " "))

  & node @NodeArgs 2>&1 | Tee-Object -FilePath $log -Append

  if ($LASTEXITCODE -ne 0) {
    throw "Node command failed during: $StepName"
  }
}

$url = "https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc"

$listingPrefix = "psdeals-recently-added-12h-$stamp"
$newTxt = "data\import\psdeals-recently-added-12h-new-$stamp.txt"

Write-Step "Starting PSDeals recently-added 12h refresh."
Write-Step "Project root: $projectRoot"
Write-Step "Log: $log"
Write-Step "New TXT: $newTxt"

Run-Node -StepName "Collect recently-added listing, max 5 pages." -NodeArgs @(
  "scripts/collect-psdeals-listing-local.mjs",
  "--url=$url",
  "--pages=5",
  "--delay-ms=2500",
  "--timeout-ms=90000",
  "--headless=false",
  "--retries=2",
  "--retry-delay-ms=5000",
  "--partial-every=1",
  "--output-prefix=$listingPrefix"
)

$json = Get-ChildItem "data\import\$listingPrefix-*.json" |
  Where-Object { $_.Name -notlike "*.partial.json" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $json) {
  throw "No final JSON generated for prefix: $listingPrefix"
}

$jsonPath = $json.FullName

Write-Step "Listing JSON: $jsonPath"

Run-Node -StepName "Analyze listing against psdeals_stage_items." -NodeArgs @(
  "scripts/analyze-psdeals-listing-new-v2.mjs",
  "--file=$jsonPath",
  "--page-size=36",
  "--output-txt=$newTxt"
)

if (-not (Test-Path $newTxt)) {
  throw "Analyzer did not create expected TXT: $newTxt"
}

$missingUrls = Get-Content $newTxt | Where-Object { $_.Trim() -ne "" }
$missingCount = $missingUrls.Count

Write-Step "Missing URLs count: $missingCount"

if ($missingCount -eq 0) {
  Write-Step "No new PSDeals items found. Finished without import."
  exit 0
}

if ($missingCount -gt 200) {
  throw "Too many missing URLs detected ($missingCount). Stop and review before importing."
}

Write-Step "New URLs detected:"
$missingUrls | Tee-Object -FilePath $log -Append

Run-Node -StepName "Import detail for new recently-added items." -NodeArgs @(
  "scripts/import-psdeals-detail-local.mjs",
  "--file=$newTxt",
  "--delay-ms=1500",
  "--timeout-ms=90000",
  "--headless=false",
  "--debug-html-dir=logs/psdeals-detail-html-recently-added-12h-$stamp"
)

Run-Node -StepName "Refresh catalog_public_cache." -NodeArgs @(
  "scripts/refresh-catalog-public-cache-v15.mjs"
)

Write-Step "Finished PSDeals recently-added 12h refresh."