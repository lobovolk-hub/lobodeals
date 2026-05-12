param(
  [int]$Pages = 5,
  [int]$DelayMs = 1500,
  [int]$TimeoutMs = 180000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = "D:\Proyectos\lobodeals"
Set-Location $projectRoot

$stamp = Get-Date -Format "yyyy-MM-dd-HH-mm-ss"

$url = "https://psdeals.net/us-store/all-games?platforms=ps5%2Cps4&sort=recently-added&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc"

$outputPrefix = "psdeals-edge-live-recently-added-ops-$stamp"
$newTxt = "data\import\psdeals-edge-live-recently-added-ops-new-$stamp.txt"
$debugHtmlDir = "logs\psdeals-detail-html-edge-live-recently-added-ops-$stamp"

function Get-EdgeEndpoint {
  try {
    $version = Invoke-RestMethod "http://127.0.0.1:9222/json/version"

    if (-not $version.webSocketDebuggerUrl) {
      throw "Missing webSocketDebuggerUrl from Edge /json/version response."
    }

    return $version.webSocketDebuggerUrl
  } catch {
    throw "Could not read active Edge endpoint from http://127.0.0.1:9222/json/version. Open Edge with remote debugging enabled and load PSDeals first. Details: $($_.Exception.Message)"
  }
}

Write-Host "[$stamp] Starting Edge live recently-added operational refresh."
Write-Host "Project root: $projectRoot"
Write-Host "Pages: $Pages"
Write-Host "Delay ms: $DelayMs"
Write-Host "Timeout ms: $TimeoutMs"
Write-Host "Output prefix: $outputPrefix"
Write-Host "New TXT: $newTxt"

$edgeEndpoint = Get-EdgeEndpoint

Write-Host "Active Edge endpoint:"
Write-Host $edgeEndpoint
Write-Host ""

Write-Host "STEP 1/4 - Collect recently-added listing via Edge live."

node scripts\collect-psdeals-listing-edge-live-cdp.mjs `
  --endpoint="$edgeEndpoint" `
  --url="$url" `
  --pages=$Pages `
  --delay-ms=$DelayMs `
  --timeout-ms=$TimeoutMs `
  --output-prefix="$outputPrefix"

if ($LASTEXITCODE -ne 0) {
  throw "Listing collection failed with exit code $LASTEXITCODE"
}

$json = Get-ChildItem "data\import\$outputPrefix-*.json" |
  Where-Object { $_.Name -notlike "*.partial.json" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $json) {
  throw "No final JSON generated for prefix: $outputPrefix"
}

$jsonPath = $json.FullName

Write-Host ""
Write-Host "Listing JSON: $jsonPath"

Write-Host ""
Write-Host "STEP 2/4 - Analyze new items against DB."

node scripts\analyze-psdeals-listing-new-v2.mjs `
  --file="$jsonPath" `
  --page-size=36 `
  --output-txt="$newTxt"

if ($LASTEXITCODE -ne 0) {
  throw "Listing analysis failed with exit code $LASTEXITCODE"
}

if (-not (Test-Path $newTxt)) {
  throw "Analyzer did not create expected TXT: $newTxt"
}

$missingUrls = @(Get-Content $newTxt | Where-Object { $_.Trim() -ne "" })
$missingCount = $missingUrls.Count

Write-Host ""
Write-Host "New URLs count: $missingCount"

if ($missingCount -eq 0) {
  Write-Host "No new PSDeals items found. Finished without detail import."
  Write-Host ""
  Write-Host "STEP 3/3 - Refresh catalog_public_cache."

  node scripts\refresh-catalog-public-cache-v15.mjs

  if ($LASTEXITCODE -ne 0) {
    throw "Cache refresh failed with exit code $LASTEXITCODE"
  }

  Write-Host ""
  Write-Host "Recently-added Edge live operational refresh finished."
  exit 0
}

if ($missingCount -gt 200) {
  throw "Too many missing URLs detected ($missingCount). Stop and review before importing."
}

Write-Host ""
Write-Host "New URLs detected:"
$missingUrls | ForEach-Object { Write-Host $_ }

Write-Host ""
Write-Host "STEP 3/4 - Import new item details via Edge live."

node scripts\import-psdeals-detail-local.mjs `
  --file="$newTxt" `
  --delay-ms=$DelayMs `
  --timeout-ms=$TimeoutMs `
  --fetch-mode=edge-live `
  --edge-endpoint="$edgeEndpoint" `
  --debug-html-dir="$debugHtmlDir"

if ($LASTEXITCODE -ne 0) {
  throw "Detail import failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "STEP 4/4 - Refresh catalog_public_cache."

node scripts\refresh-catalog-public-cache-v15.mjs

if ($LASTEXITCODE -ne 0) {
  throw "Cache refresh failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Recently-added Edge live operational refresh finished."