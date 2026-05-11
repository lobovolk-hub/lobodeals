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

Write-Host "[$stamp] Starting Edge live recently-added operational refresh."
Write-Host "Project root: $projectRoot"
Write-Host "Pages: $Pages"
Write-Host "Output prefix: $outputPrefix"
Write-Host "New TXT: $newTxt"
Write-Host ""

Write-Host "STEP 1/3 - Collect recently-added listing via Edge live."
node scripts\collect-psdeals-listing-edge-live-cdp.mjs `
  --url=$url `
  --pages=$Pages `
  --delay-ms=$DelayMs `
  --timeout-ms=$TimeoutMs `
  --output-prefix=$outputPrefix

if ($LASTEXITCODE -ne 0) {
  throw "Listing collection failed with exit code $LASTEXITCODE"
}

$json = Get-ChildItem data\import\$outputPrefix-*.json |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $json) {
  throw "Could not find generated JSON for prefix $outputPrefix"
}

$jsonPath = $json.FullName

Write-Host ""
Write-Host "STEP 2/3 - Analyze new items against DB."
Write-Host "JSON: $jsonPath"

node scripts\analyze-psdeals-listing-new-v2.mjs `
  --file="$jsonPath" `
  --page-size=36 `
  --output-txt="$newTxt"

if ($LASTEXITCODE -ne 0) {
  throw "New-items analyzer failed with exit code $LASTEXITCODE"
}

$newCount = (Get-Content $newTxt | Where-Object { $_.Trim() -ne "" }).Count

Write-Host ""
Write-Host "New URLs count: $newCount"

if ($newCount -le 0) {
  Write-Host "No new PSDeals items found. Finished without import."
  exit 0
}

Write-Host ""
Write-Host "STEP 3/3 - Import new item details via Edge live."
Write-Host "Import TXT: $newTxt"

node scripts\import-psdeals-detail-local.mjs `
  --file="$newTxt" `
  --delay-ms=$DelayMs `
  --timeout-ms=$TimeoutMs `
  --fetch-mode=edge-live `
  --price-history-mode=append `
  --relations-mode=replace `
  --debug-html-dir="$debugHtmlDir"

if ($LASTEXITCODE -ne 0) {
  throw "Detail import failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Recently-added Edge live operational refresh finished."
Write-Host ""
Write-Host "NEXT MANUAL SQL STEP:"
Write-Host "select public.refresh_catalog_public_cache_v15();"