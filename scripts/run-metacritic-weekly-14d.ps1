cd D:\Proyectos\lobodeals

$from = (Get-Date).AddDays(-14).ToString("yyyy-MM-dd")
$to = (Get-Date).ToString("yyyy-MM-dd")
$stamp = Get-Date -Format "yyyy-MM-dd-HH-mm-ss"
$log = "data\import\metacritic-weekly-14d-apply-$stamp.log"

node scripts/backfill-metacritic-score-v2.mjs --from=$from --to=$to --browse-pages=30 --dry-run=false --only-missing=true --refresh-cache=true *> $log
