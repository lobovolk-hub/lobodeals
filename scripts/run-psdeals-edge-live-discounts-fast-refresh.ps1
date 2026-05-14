param(
  [int]$Pages = 1000,
  [int]$DelayMs = 1500,
  [int]$TimeoutMs = 180000,
  [int]$ImportDelayMs = 1200,
  [int]$RetryDelayMs = 3000,
  [int]$StaleHours = 24,
  [int]$StaleLimit = 500
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = "D:\Proyectos\lobodeals"
Set-Location $projectRoot

$stamp = Get-Date -Format "yyyy-MM-dd-HH-mm-ss"

$url = "https://psdeals.net/us-store/discounts?platforms=ps5%2Cps4&sort=best-new-deals&contentType%5B%5D=games&contentType%5B%5D=bundles&contentType%5B%5D=dlc"

$outputPrefix = "psdeals-edge-live-discounts-fast-refresh-$stamp"

$combinedTxt = "data\import\psdeals-discounts-fast-refresh-combined-$stamp.txt"
$mustTxt = "data\import\psdeals-discounts-fast-refresh-must-$stamp.txt"
$staleTxt = "data\import\psdeals-discounts-fast-refresh-stale-$stamp.txt"
$skippedTxt = "data\import\psdeals-discounts-fast-refresh-skipped-$stamp.txt"
$analyzerLog = "data\import\psdeals-discounts-fast-refresh-$stamp.log"

$importLog = "data\import\psdeals-discounts-fast-refresh-import-$stamp.log"
$retryTxt = "data\import\psdeals-discounts-fast-refresh-failed-retry-$stamp.txt"
$retryLog = "data\import\psdeals-discounts-fast-refresh-failed-retry-$stamp.log"

$debugHtmlDir = "logs\psdeals-detail-html-discounts-fast-refresh-$stamp"
$retryDebugHtmlDir = "logs\psdeals-detail-html-discounts-fast-refresh-failed-retry-$stamp"

function Get-EdgeEndpoint {
  try {
    $version = Invoke-RestMethod "http://127.0.0.1:9222/json/version"

    if (-not $version.webSocketDebuggerUrl) {
      throw "Missing webSocketDebuggerUrl from Edge /json/version response."
    }

    return $version.webSocketDebuggerUrl
  } catch {
    $devToolsFile = Join-Path $env:LOCALAPPDATA "Microsoft\Edge\User Data\DevToolsActivePort"

    if (-not (Test-Path $devToolsFile)) {
      throw "Could not read Edge endpoint from /json/version or DevToolsActivePort. Open Edge with remote debugging enabled and load PSDeals first. Details: $($_.Exception.Message)"
    }

    $lines = @(Get-Content $devToolsFile | Where-Object { $_.Trim() -ne "" })

    if ($lines.Count -lt 2) {
      throw "Invalid DevToolsActivePort file: $devToolsFile"
    }

    return "ws://127.0.0.1:$($lines[0])$($lines[1])"
  }
}

function Show-LogSummary {
  param(
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    Write-Host "Log not found: $Path"
    return
  }

  Select-String -Path $Path -Pattern `
    "Collected items:",
    "Unique psdeals ids:",
    "Existing in DB:",
    "New in DB:",
    "Must refresh:",
    "Stale selected:",
    "Combined refresh total:",
    "Skipped safe:",
    "current_price_mismatch:",
    "original_price_mismatch:",
    "discount_percent_mismatch:",
    "ps_plus_risk_listing_discount_without_regular_sale:",
    "ps_plus_risk_missing_raw_price:",
    "stale_hours:",
    "stale_limit:",
    "Import finished.",
    "Seen:",
    "Inserted:",
    "Updated:",
    "Failed:" |
    ForEach-Object { $_.Line }
}

Write-Host "[$stamp] Starting PSDeals discounts fast refresh."
Write-Host "Project root: $projectRoot"
Write-Host "Pages: $Pages"
Write-Host "Delay ms: $DelayMs"
Write-Host "Timeout ms: $TimeoutMs"
Write-Host "Import delay ms: $ImportDelayMs"
Write-Host "Retry delay ms: $RetryDelayMs"
Write-Host "Stale hours: $StaleHours"
Write-Host "Stale limit: $StaleLimit"
Write-Host "Output prefix: $outputPrefix"

$edgeEndpoint = Get-EdgeEndpoint

Write-Host ""
Write-Host "Active Edge endpoint:"
Write-Host $edgeEndpoint

Write-Host ""
Write-Host "STEP 1/5 - Collect PSDeals discounts listing via Edge live."

node scripts\collect-psdeals-listing-edge-live-cdp.mjs `
  --endpoint="$edgeEndpoint" `
  --url="$url" `
  --pages=$Pages `
  --delay-ms=$DelayMs `
  --timeout-ms=$TimeoutMs `
  --output-prefix="$outputPrefix"

if ($LASTEXITCODE -ne 0) {
  throw "Discounts listing collection failed with exit code $LASTEXITCODE"
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
Write-Host "Listing JSON:"
Write-Host $jsonPath

Write-Host ""
Write-Host "STEP 2/5 - Analyze fast refresh candidates."

node scripts\analyze-psdeals-discounts-fast-refresh-v1.mjs `
  --file="$jsonPath" `
  --output-txt="$combinedTxt" `
  --must-output-txt="$mustTxt" `
  --stale-output-txt="$staleTxt" `
  --skipped-output-txt="$skippedTxt" `
  --stale-hours=$StaleHours `
  --stale-limit=$StaleLimit *> $analyzerLog

if ($LASTEXITCODE -ne 0) {
  throw "Fast analyzer failed with exit code $LASTEXITCODE. Check log: $analyzerLog"
}

Write-Host ""
Write-Host "Analyzer summary:"
Show-LogSummary -Path $analyzerLog

if (-not (Test-Path $combinedTxt)) {
  throw "Analyzer did not create combined TXT: $combinedTxt"
}

$combinedUrls = @(Get-Content $combinedTxt | Where-Object { $_.Trim() -ne "" })
$combinedCount = $combinedUrls.Count

Write-Host ""
Write-Host "Combined refresh URLs: $combinedCount"
Write-Host "Combined TXT: $combinedTxt"
Write-Host "Must TXT: $mustTxt"
Write-Host "Stale TXT: $staleTxt"
Write-Host "Skipped TXT: $skippedTxt"
Write-Host "Analyzer log: $analyzerLog"

if ($combinedCount -eq 0) {
  Write-Host ""
  Write-Host "No detail URLs selected. Skipping import."
} else {
  Write-Host ""
  Write-Host "STEP 3/5 - Import selected detail URLs via Edge live."

  node scripts\import-psdeals-detail-local.mjs `
    --file="$combinedTxt" `
    --delay-ms=$ImportDelayMs `
    --timeout-ms=$TimeoutMs `
    --fetch-mode=edge-live `
    --edge-endpoint="$edgeEndpoint" `
    --debug-html-dir="$debugHtmlDir" *> $importLog

  Write-Host ""
  Write-Host "Import summary:"
  Show-LogSummary -Path $importLog

  Write-Host "Import log: $importLog"

  Write-Host ""
  Write-Host "STEP 4/5 - Retry failed URLs once."

  $failedUrls = @(
    Select-String -Path $importLog -Pattern "FAILED:\s+(https://\S+)" |
      ForEach-Object {
        if ($_.Line -match "FAILED:\s+(https://\S+)") {
          $matches[1].Trim()
        }
      } |
      Sort-Object -Unique
  )

  $failedUrls | Set-Content $retryTxt -Encoding UTF8

  Write-Host "Failed URLs count: $($failedUrls.Count)"
  Write-Host "Retry TXT: $retryTxt"

  if ($failedUrls.Count -gt 0) {
    node scripts\import-psdeals-detail-local.mjs `
      --file="$retryTxt" `
      --delay-ms=$RetryDelayMs `
      --timeout-ms=240000 `
      --fetch-mode=edge-live `
      --edge-endpoint="$edgeEndpoint" `
      --debug-html-dir="$retryDebugHtmlDir" *> $retryLog

    Write-Host ""
    Write-Host "Retry summary:"
    Show-LogSummary -Path $retryLog

    Write-Host "Retry log: $retryLog"
  } else {
    Write-Host "No failed URLs to retry."
  }
}

Write-Host ""
Write-Host "STEP 5/5 - Manual Supabase refresh required."
Write-Host ""
Write-Host "Run this in Supabase SQL Editor:"
Write-Host ""
Write-Host "set statement_timeout = '10min';"
Write-Host "select public.refresh_catalog_public_cache_v15();"
Write-Host ""
Write-Host "Then validate:"
Write-Host ""
Write-Host "select"
Write-Host "  count(*) as total_rows,"
Write-Host "  count(*) filter (where has_deal = true) as active_regular_deals,"
Write-Host "  count(*) filter (where has_ps_plus_deal = true) as active_ps_plus_deals,"
Write-Host "  count(*) filter (where is_ps_plus_monthly_game = true) as active_monthly_games,"
Write-Host "  count(*) filter ("
Write-Host "    where deal_ends_at is not null"
Write-Host "      and deal_ends_at <= now()"
Write-Host "      and (has_deal = true or has_ps_plus_deal = true)"
Write-Host "  ) as expired_deals_still_marked_active,"
Write-Host "  count(*) filter ("
Write-Host "    where discount_percent >= 100"
Write-Host "      and (has_deal = true or has_ps_plus_deal = true)"
Write-Host "  ) as deals_with_100_percent_or_more,"
Write-Host "  count(*) filter ("
Write-Host "    where best_price_amount is null"
Write-Host "  ) as null_best_price_amount"
Write-Host "from public.catalog_public_cache;"
Write-Host ""
Write-Host "PSDeals discounts fast refresh finished."