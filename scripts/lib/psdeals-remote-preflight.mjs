import { evaluatePsdealsCycleMigrationFacts } from './psdeals-cycle-migration-contract.mjs'

export const PSDEALS_REMOTE_PREFLIGHT_VERSION = 2

export const PSDEALS_REMOTE_REQUIRED_CONTRACTS = Object.freeze({
  psdeals_stage_items: [
    'id', 'region_code', 'storefront', 'psdeals_id', 'psdeals_slug',
    'psdeals_url', 'title', 'platforms', 'content_type', 'item_type_label',
    'current_price_amount', 'original_price_amount', 'discount_percent',
    'listing_last_seen_at', 'detail_last_synced_at', 'raw_listing_json',
    'raw_detail_json', 'lobodeals_lowest_regular_price_amount',
    'lobodeals_lowest_regular_price_first_seen_at',
    'lobodeals_lowest_ps_plus_price_amount',
    'lobodeals_lowest_ps_plus_price_first_seen_at',
  ],
  psdeals_import_runs: [
    'id', 'source_kind', 'region_code', 'storefront', 'status', 'items_seen',
    'items_inserted', 'items_updated', 'items_failed', 'started_at', 'finished_at',
  ],
  price_refresh_cycles: [
    'id', 'region_code', 'storefront', 'cycle_date', 'status', 'started_at',
    'finished_at', 'listing_completed_at', 'details_completed_at',
    'ended_discounts_completed_at', 'monthly_games_checked_at',
    'validation_completed_at', 'validation_passed', 'items_seen',
    'items_updated', 'items_failed', 'new_items_detected',
    'ended_discounts_applied', 'failure_reason', 'metrics', 'certified_at',
  ],
  ps_plus_monthly_games: [
    'id', 'month_key', 'item_id', 'title', 'slug', 'source_url', 'active_from',
    'active_until', 'active_from_at', 'active_until_at', 'is_active', 'updated_at',
  ],
  catalog_public_cache: [
    'item_id', 'region_code', 'storefront', 'slug', 'title', 'platforms',
    'current_price_amount', 'original_price_amount', 'discount_percent',
    'ps_plus_price_amount', 'has_deal', 'has_ps_plus_deal',
    'is_ps_plus_monthly_game', 'updated_at',
  ],
  psdeals_stage_price_history: [
    'id', 'item_id', 'price_kind', 'observed_at', 'price_amount', 'currency_code',
  ],
})

const REQUIRED_FUNCTIONS = Object.freeze({
  certify_price_refresh_cycle: 'p_cycle_id uuid',
  refresh_catalog_public_cache_v15: '',
})

const LEGACY_FUNCTION_SHA256 = Object.freeze({
  certify_price_refresh_cycle:
    '3dfa2232903c014039f070f48d4044ffe0b329e38cb86615b9bdbc20c4f9aa88',
  refresh_catalog_public_cache_v15:
    '1c6e71d26e6554e6f8fdf2e6ed0388db959419db4ee64132d8ddd5761b3996dc',
})

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}
function timestamp(value) {
  if (!nonEmpty(value)) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function unique(values) {
  return [...new Set(values)]
}

function issue(code, path, detail = null) {
  return { code, path, detail }
}

function objectColumns(object) {
  return new Set(Array.isArray(object?.columns) ? object.columns : [])
}

export function evaluatePsdealsRemotePreflight(factsInput, { now } = {}) {
  const facts = factsInput && typeof factsInput === 'object' ? factsInput : {}
  const errors = []
  const blockers = []
  const warnings = []
  const verifiedContracts = []
  const incompatibleContracts = []
  const missingObjects = []
  const permissionsMissing = []
  const checkedAt = timestamp(facts.checked_at)
  const nowDate = timestamp(now || facts.checked_at)

  if (facts.preflight_version !== PSDEALS_REMOTE_PREFLIGHT_VERSION) {
    errors.push(issue('PREFLIGHT_VERSION_INVALID', 'preflight_version'))
  }
  if (facts.collection_mode !== 'supabase_mcp_readonly') {
    errors.push(issue('PREFLIGHT_COLLECTION_MODE_NOT_READ_ONLY', 'collection_mode'))
  }
  if (facts.mutations_executed !== 0 || facts.rpcs_executed !== 0) {
    errors.push(issue('PREFLIGHT_MUTATION_REPORTED', 'mutations_executed'))
  }
  if (!checkedAt || !nowDate || checkedAt > nowDate) {
    errors.push(issue('PREFLIGHT_CHECKED_AT_INVALID', 'checked_at'))
  }
  if (facts.project?.id !== 'vlxkoprpobfevxefizwr') {
    blockers.push(issue('PREFLIGHT_PROJECT_MISMATCH', 'project.id'))
  }
  if (facts.project?.region !== 'us-east-2') {
    blockers.push(issue('PREFLIGHT_PROJECT_REGION_MISMATCH', 'project.region'))
  }
  if (facts.project?.status !== 'ACTIVE_HEALTHY') {
    blockers.push(issue('PREFLIGHT_PROJECT_NOT_HEALTHY', 'project.status'))
  }
  if (facts.credentials?.values_redacted !== true) {
    errors.push(issue('PREFLIGHT_CREDENTIALS_NOT_REDACTED', 'credentials'))
  }
  for (const key of ['url_configured', 'publishable_key_configured', 'secret_key_configured']) {
    if (facts.credentials?.[key] !== true) {
      permissionsMissing.push(issue('PREFLIGHT_CREDENTIAL_CONFIGURATION_MISSING', `credentials.${key}`))
    }
  }

  for (const [name, requiredColumns] of Object.entries(PSDEALS_REMOTE_REQUIRED_CONTRACTS)) {
    const object = facts.objects?.[name]
    if (!object?.exists) {
      missingObjects.push(name)
      blockers.push(issue('PREFLIGHT_REQUIRED_OBJECT_MISSING', `objects.${name}`))
      continue
    }
    if (object.object_type !== 'table') {
      incompatibleContracts.push(name)
      blockers.push(issue('PREFLIGHT_OBJECT_TYPE_MISMATCH', `objects.${name}.object_type`))
      continue
    }
    const columns = objectColumns(object)
    const missingColumns = requiredColumns.filter((column) => !columns.has(column))
    if (missingColumns.length > 0) {
      incompatibleContracts.push(name)
      blockers.push(issue('PREFLIGHT_REQUIRED_COLUMNS_MISSING', `objects.${name}.columns`, missingColumns))
    } else {
      verifiedContracts.push(name)
    }
    if (object.can_select !== true) {
      permissionsMissing.push(issue('PREFLIGHT_SELECT_PERMISSION_MISSING', `objects.${name}.can_select`))
    }
    if (!Number.isSafeInteger(object.exact_rows) || object.exact_rows < 0) {
      warnings.push(issue('PREFLIGHT_EXACT_ROW_COUNT_MISSING', `objects.${name}.exact_rows`))
    }
  }

  const functions = facts.functions || {}
  for (const [name, argumentsValue] of Object.entries(REQUIRED_FUNCTIONS)) {
    const fn = functions[name]
    if (!fn?.exists) {
      blockers.push(issue('PREFLIGHT_REQUIRED_FUNCTION_MISSING', `functions.${name}`))
      missingObjects.push(`function:${name}`)
      continue
    }
    if (
      fn.identity_arguments !== argumentsValue ||
      fn.definition_verified !== true ||
      fn.definition_sha256 !== LEGACY_FUNCTION_SHA256[name]
    ) {
      blockers.push(issue('PREFLIGHT_FUNCTION_CONTRACT_MISMATCH', `functions.${name}`))
      incompatibleContracts.push(`function:${name}`)
    } else {
      verifiedContracts.push(`function:${name}`)
    }
  }

  const stage = facts.objects?.psdeals_stage_items
  if (!stage?.indexes?.includes('psdeals_stage_items_unique_psdeals')) {
    blockers.push(issue('PREFLIGHT_STAGE_CONFLICT_INDEX_MISSING', 'objects.psdeals_stage_items.indexes'))
  }

  const migration = evaluatePsdealsCycleMigrationFacts(facts)
  if (!migration.ready) {
    blockers.push(issue(
      `PREFLIGHT_${migration.migration_status}`,
      'migration',
      migration.missing
    ))
  }
  if (facts.objects?.item_price_snapshots?.exists !== true) {
    warnings.push(issue('PREFLIGHT_LEGACY_ITEM_PRICE_SNAPSHOTS_ABSENT', 'objects.item_price_snapshots'))
  }
  if ((facts.history_dependencies?.direct_consumers || []).length > 0) {
    blockers.push(issue('PREFLIGHT_HISTORY_DIRECT_CONSUMERS_FOUND', 'history_dependencies.direct_consumers'))
  }
  if ((facts.measurements?.price_refresh_cycles || 0) !== 0) {
    warnings.push(issue('PREFLIGHT_REMOTE_CYCLES_ALREADY_EXIST', 'measurements.price_refresh_cycles'))
  }
  if ((facts.measurements?.certified_regular_low_rows || 0) !== 0 ||
      (facts.measurements?.certified_ps_plus_low_rows || 0) !== 0) {
    warnings.push(issue('PREFLIGHT_CERTIFIED_LOWS_ALREADY_EXIST', 'measurements'))
  }

  const allBlockers = [...blockers, ...permissionsMissing, ...migration.blockers]
  const valid = errors.length === 0
  const ready = valid && allBlockers.length === 0
  return {
    preflight_version: PSDEALS_REMOTE_PREFLIGHT_VERSION,
    valid,
    ready,
    classification: !valid
      ? 'NOT_READY'
      : ready
        ? migration.migration_status
        : migration.migration_status === 'MIGRATION_READY'
          ? 'NOT_READY'
          : migration.migration_status,
    migration_status: migration.migration_status,
    migration,
    read_only_verified:
      facts.collection_mode === 'supabase_mcp_readonly' &&
      facts.mutations_executed === 0 && facts.rpcs_executed === 0,
    checked_at: facts.checked_at || null,
    code_revision: facts.code_revision || null,
    errors,
    blockers: allBlockers,
    warnings,
    reason_codes: unique([...errors, ...allBlockers].map((entry) => entry.code)),
    verified_contracts: unique(verifiedContracts),
    incompatible_contracts: unique(incompatibleContracts),
    missing_objects: unique(missingObjects),
    permissions_missing: permissionsMissing,
    measurements: facts.measurements || {},
  }
}
