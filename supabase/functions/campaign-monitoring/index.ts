import { adapters } from './adapters/index.ts'
import {
  AdapterError,
  SOURCE_URLS,
  STORE_SLUGS,
  type DetectedCampaign,
  type KnownCampaign,
  type SourceCoverage,
  type StoreSlug,
} from './_shared/types.ts'
import {
  campaignKeysToEnd,
  type ActiveCampaignIdentity,
} from './_shared/reconcile.ts'
import { verifyMonitorToken } from './_shared/auth.ts'
import {
  toPublicAvailability,
  type HealthStatus,
} from './_shared/availability.ts'
import { isSafeArtworkUrl } from './_shared/artwork.ts'
import {
  artworkPatch,
  campaignBaseRow,
  type ArtworkPatch,
} from './_shared/persistence.ts'

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }
const ADAPTER_VERSION = '11'

type MonitorRequest = Readonly<{
  mode?: 'probe' | 'persist'
  stores?: readonly string[]
  simulateFailure?: string
}>

type StoreOutcome = Readonly<{
  storeSlug: StoreSlug
  ok: boolean
  blocked: boolean
  campaignsDetected: number
  campaignsUpserted: number
  campaignsEnded: number
  coverage?: SourceCoverage
  sourceUrls?: readonly string[]
  campaigns: readonly Readonly<{
    sourceUid: string
    name: string
    state: DetectedCampaign['state']
    lifecycleBasis: DetectedCampaign['lifecycleBasis']
    starts?: DetectedCampaign['starts']
    ends?: DetectedCampaign['ends']
    officialUrl: string
    artworkUrl?: string
  }>[]
  errorCode?: string
  errorMessage?: string
}>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function adminKey(): string | null {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<
      string,
      unknown
    >
    const preferred = keys.default
    if (typeof preferred === 'string' && preferred) return preferred
    const available = Object.values(keys).find(
      (value): value is string => typeof value === 'string' && Boolean(value)
    )
    if (available) return available
  } catch {
    // Fall through to the platform legacy key when modern keys are unavailable.
  }

  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null
}

async function isAuthorized(request: Request): Promise<boolean> {
  const suppliedToken = request.headers.get('x-campaign-monitor-token')
  if (!suppliedToken) return false

  const configuredVerifier = Deno.env.get('CAMPAIGN_MONITOR_TOKEN')
  const expectedVerifier = configuredVerifier ?? (await monitorTokenVerifier())
  return verifyMonitorToken(suppliedToken, expectedVerifier)
}

function parseRequest(body: MonitorRequest): {
  mode: 'probe' | 'persist'
  stores: readonly StoreSlug[]
  simulateFailure?: StoreSlug
} {
  const mode = body.mode ?? 'probe'
  if (mode !== 'probe' && mode !== 'persist') {
    throw new AdapterError('INVALID_REQUEST', 'mode must be probe or persist')
  }

  const requested = body.stores ?? STORE_SLUGS
  if (!Array.isArray(requested) || requested.length === 0) {
    throw new AdapterError('INVALID_REQUEST', 'stores must be a non-empty array')
  }

  const stores = requested.map((slug) => {
    if (!STORE_SLUGS.includes(slug as StoreSlug)) {
      throw new AdapterError('INVALID_REQUEST', `Unknown store slug: ${slug}`)
    }
    return slug as StoreSlug
  })
  if (new Set(stores).size !== stores.length) {
    throw new AdapterError('INVALID_REQUEST', 'stores must not contain duplicates')
  }

  let simulateFailure: StoreSlug | undefined
  if (body.simulateFailure !== undefined) {
    if (mode !== 'probe') {
      throw new AdapterError(
        'INVALID_REQUEST',
        'simulateFailure is permitted only in probe mode'
      )
    }
    if (!STORE_SLUGS.includes(body.simulateFailure as StoreSlug)) {
      throw new AdapterError('INVALID_REQUEST', 'simulateFailure is not canonical')
    }
    simulateFailure = body.simulateFailure as StoreSlug
  }

  return { mode, stores, simulateFailure }
}

function assertCampaign(campaign: DetectedCampaign, expectedStore: StoreSlug): void {
  if (campaign.storeSlug !== expectedStore) {
    throw new AdapterError('INVALID_ADAPTER_OUTPUT', 'Adapter returned another store')
  }
  if (!campaign.sourceUid || !campaign.name.trim()) {
    throw new AdapterError('INVALID_ADAPTER_OUTPUT', 'Campaign identity is incomplete')
  }
  for (const url of [campaign.officialUrl, campaign.sourceUrl]) {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new AdapterError('INVALID_ADAPTER_OUTPUT', 'Campaign URL is not safe HTTPS')
    }
  }
  if (
    campaign.artworkUrl !== undefined &&
    !isSafeArtworkUrl(campaign.artworkUrl)
  ) {
    throw new AdapterError(
      'INVALID_ADAPTER_OUTPUT',
      'Campaign artwork URL is not safe official HTTPS metadata'
    )
  }
  if (campaign.lifecycleBasis === 'exact-time') {
    if (
      campaign.starts?.precision !== 'datetime' ||
      campaign.ends?.precision !== 'datetime' ||
      Date.parse(campaign.ends.value) <= Date.parse(campaign.starts.value)
    ) {
      throw new AdapterError(
        'INVALID_ADAPTER_OUTPUT',
        'Exact-time lifecycle lacks ordered exact instants'
      )
    }
  }
}

async function campaignKey(campaign: DetectedCampaign): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${campaign.storeSlug}\u0000${campaign.sourceUid}`
  )
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24)
  return `${campaign.storeSlug}-${hash}`
}

function restHeaders(key: string): HeadersInit {
  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
  }
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`
  return headers
}

async function restRequest(
  path: string,
  init: RequestInit
): Promise<Response> {
  const baseUrl = Deno.env.get('SUPABASE_URL')
  const key = adminKey()
  if (!baseUrl || !key) {
    throw new AdapterError('BACKEND_CONFIGURATION', 'Supabase runtime is unavailable')
  }

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: { ...restHeaders(key), ...init.headers },
  })
  if (!response.ok) {
    throw new AdapterError(
      'BACKEND_WRITE_FAILED',
      `Sales backend returned HTTP ${response.status}`
    )
  }
  return response
}

async function monitorTokenVerifier(): Promise<string> {
  const response = await restRequest('rpc/campaign_monitor_token_verifier', {
    method: 'POST',
    body: '{}',
  })
  const verifier = (await response.json()) as unknown

  if (typeof verifier !== 'string' || !/^[a-f0-9]{64}$/.test(verifier)) {
    throw new AdapterError(
      'BACKEND_CONFIGURATION',
      'Campaign monitor token verifier is unavailable'
    )
  }

  return verifier
}

async function upsertCampaigns(
  campaigns: readonly DetectedCampaign[],
  confirmedAt: string
): Promise<number> {
  if (campaigns.length === 0) return 0
  const keyedCampaigns = await Promise.all(
    campaigns.map(async (entry) => ({
      entry,
      key: await campaignKey(entry),
    }))
  )
  const rows = keyedCampaigns.map(({ entry, key }) =>
    campaignBaseRow(entry, key, confirmedAt)
  )

  await restRequest('sales_campaigns?on_conflict=campaign_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  })

  const artworkUpdates = keyedCampaigns
    .map(({ entry, key }) => artworkPatch(entry, key))
    .filter((update): update is ArtworkPatch => update !== null)
  const artworkResults = await Promise.allSettled(
    artworkUpdates.map((update) =>
      restRequest(
        `sales_campaigns?campaign_key=eq.${encodeURIComponent(
          update.campaignKey
        )}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ artwork_url: update.artworkUrl }),
        }
      )
    )
  )
  artworkResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        JSON.stringify({
          event: 'campaign-monitoring.artwork-write-failed',
          campaignKey: artworkUpdates[index].campaignKey,
        })
      )
    }
  })
  return rows.length
}

async function activeCampaigns(
  storeSlug: StoreSlug
): Promise<readonly (ActiveCampaignIdentity & KnownCampaign)[]> {
  const response = await restRequest(
    `sales_campaigns?select=campaign_key,source_uid,name,state,official_url,source_url,ends_at&store_slug=eq.${encodeURIComponent(storeSlug)}&state=in.(live,upcoming)`,
    { method: 'GET' }
  )
  const rows = (await response.json()) as readonly {
    campaign_key: string
    source_uid: string
    name: string
    state: 'live' | 'upcoming'
    official_url: string
    source_url: string
    ends_at: string | null
  }[]
  return rows.map((row) => ({
    ...row,
    campaignKey: row.campaign_key,
    sourceUid: row.source_uid,
    officialUrl: row.official_url,
    sourceUrl: row.source_url,
    endsAt: row.ends_at ?? undefined,
  }))
}

async function endCampaigns(
  campaignKeys: readonly string[],
  confirmedAt: string
): Promise<number> {
  await Promise.all(
    campaignKeys.map((key) =>
      restRequest(`sales_campaigns?campaign_key=eq.${key}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ state: 'ended', updated_at: confirmedAt }),
      })
    )
  )
  return campaignKeys.length
}

async function priorFailureCount(storeSlug: StoreSlug): Promise<number> {
  const response = await restRequest(
    `sales_source_health?select=consecutive_failures&store_slug=eq.${encodeURIComponent(storeSlug)}`,
    { method: 'GET' }
  )
  const rows = (await response.json()) as readonly { consecutive_failures?: number }[]
  return rows[0]?.consecutive_failures ?? 0
}

async function updateHealth(
  row: Record<string, unknown>
): Promise<void> {
  await restRequest('sales_source_health?on_conflict=store_slug', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  })
}

async function publicAvailability() {
  const response = await restRequest(
    'sales_source_health?select=store_slug,status',
    { method: 'GET' }
  )
  const rows = (await response.json()) as readonly {
    store_slug: StoreSlug
    status: HealthStatus
  }[]
  return toPublicAvailability(STORE_SLUGS, rows)
}

function safeError(error: unknown): {
  code: string
  message: string
  blocked: boolean
} {
  if (error instanceof AdapterError) {
    return {
      code: error.code.slice(0, 100),
      message: error.message.slice(0, 500),
      blocked: error.blocked,
    }
  }
  return {
    code: 'ADAPTER_FAILED',
    message: (error instanceof Error ? error.message : 'Adapter failed').slice(
      0,
      500
    ),
    blocked: false,
  }
}

async function runStore(
  storeSlug: StoreSlug,
  mode: 'probe' | 'persist',
  now: Date,
  simulateFailure?: StoreSlug
): Promise<StoreOutcome> {
  const startedAt = new Date().toISOString()

  try {
    if (simulateFailure === storeSlug) {
      throw new AdapterError('SIMULATED_FAILURE', 'Controlled isolation probe')
    }
    const activeBeforeRun = await activeCampaigns(storeSlug)
    const result = await adapters[storeSlug]({
      now,
      fetch,
      knownCampaigns: activeBeforeRun,
    })
    if (result.storeSlug !== storeSlug) {
      throw new AdapterError('INVALID_ADAPTER_OUTPUT', 'Adapter identity mismatch')
    }
    if (
      result.coverage !== 'partial' &&
      result.coverage !== 'authoritative-complete-current-set'
    ) {
      throw new AdapterError('INVALID_ADAPTER_OUTPUT', 'Coverage declaration is invalid')
    }
    if (result.sourceUrls.length === 0 || !result.sourceUrls.includes(result.sourceUrl)) {
      throw new AdapterError(
        'INVALID_ADAPTER_OUTPUT',
        'Primary source must be included in source URLs'
      )
    }
    for (const sourceUrl of result.sourceUrls) {
      const parsed = new URL(sourceUrl)
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw new AdapterError('INVALID_ADAPTER_OUTPUT', 'Source URL is not safe HTTPS')
      }
    }
    const sourceUids = new Set<string>()
    for (const entry of result.campaigns) {
      assertCampaign(entry, storeSlug)
      if (sourceUids.has(entry.sourceUid)) {
        throw new AdapterError('INVALID_ADAPTER_OUTPUT', 'Duplicate campaign source UID')
      }
      sourceUids.add(entry.sourceUid)
    }
    const knownSourceUids = new Set(
      activeBeforeRun.map(({ source_uid }) => source_uid)
    )
    if (
      result.explicitlyEndedSourceUids.some(
        (sourceUid) => !knownSourceUids.has(sourceUid)
      )
    ) {
      throw new AdapterError(
        'INVALID_ADAPTER_OUTPUT',
        'Explicitly ended campaign was not previously known'
      )
    }

    const finishedAt = new Date().toISOString()
    let campaignsUpserted = 0
    let campaignsEnded = 0
    if (mode === 'persist') {
      campaignsUpserted = await upsertCampaigns(result.campaigns, finishedAt)
      campaignsEnded = await endCampaigns(
        campaignKeysToEnd({
          sourceSucceeded: true,
          coverage: result.coverage,
          activeCampaigns: activeBeforeRun,
          detectedCampaigns: result.campaigns,
          explicitlyEndedSourceUids: result.explicitlyEndedSourceUids,
          now,
        }),
        finishedAt
      )
    }
    if (mode === 'persist') {
      await updateHealth({
        store_slug: storeSlug,
        source_url: result.sourceUrl,
        adapter_version: ADAPTER_VERSION,
        status: 'healthy',
        last_started_at: startedAt,
        last_finished_at: finishedAt,
        last_succeeded_at: finishedAt,
        campaigns_detected: result.campaigns.length,
        campaigns_upserted: campaignsUpserted,
        consecutive_failures: 0,
        last_error_code: null,
        last_error_message: null,
        updated_at: finishedAt,
      })
    }

    return {
      storeSlug,
      ok: true,
      blocked: false,
      campaignsDetected: result.campaigns.length,
      campaignsUpserted,
      campaignsEnded,
      coverage: result.coverage,
      sourceUrls: result.sourceUrls,
      campaigns: result.campaigns.map((entry) => ({
        sourceUid: entry.sourceUid,
        name: entry.name,
        state: entry.state,
        lifecycleBasis: entry.lifecycleBasis,
        starts: entry.starts,
        ends: entry.ends,
        officialUrl: entry.officialUrl,
        artworkUrl: entry.artworkUrl,
      })),
    }
  } catch (error) {
    const failure = safeError(error)
    if (mode === 'persist') {
      try {
        const finishedAt = new Date().toISOString()
        const failures = (await priorFailureCount(storeSlug)) + 1
        await updateHealth({
          store_slug: storeSlug,
          source_url: SOURCE_URLS[storeSlug],
          adapter_version: ADAPTER_VERSION,
          status: failure.blocked ? 'blocked' : 'error',
          last_started_at: startedAt,
          last_finished_at: finishedAt,
          campaigns_detected: 0,
          campaigns_upserted: 0,
          consecutive_failures: failures,
          last_error_code: failure.code,
          last_error_message: failure.message,
          updated_at: finishedAt,
        })
      } catch {
        console.error(
          JSON.stringify({
            event: 'campaign-monitoring.health-write-failed',
            storeSlug,
          })
        )
      }
    }
    return {
      storeSlug,
      ok: false,
      blocked: failure.blocked,
      campaignsDetected: 0,
      campaignsUpserted: 0,
      campaignsEnded: 0,
      campaigns: [],
      errorCode: failure.code,
      errorMessage: failure.message,
    }
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'GET') {
    try {
      return jsonResponse(await publicAvailability())
    } catch {
      return jsonResponse({ error: 'Sales availability is temporarily unavailable' }, 503)
    }
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }
  try {
    if (!(await isAuthorized(request))) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
  } catch {
    return jsonResponse({ error: 'Monitor authentication is unavailable' }, 503)
  }

  try {
    const body = (await request.json().catch(() => ({}))) as MonitorRequest
    const parsed = parseRequest(body)
    const now = new Date()
    const outcomes = await Promise.all(
      parsed.stores.map((storeSlug) =>
        runStore(storeSlug, parsed.mode, now, parsed.simulateFailure)
      )
    )
    const response = {
      mode: parsed.mode,
      startedAt: now.toISOString(),
      finishedAt: new Date().toISOString(),
      requestedStores: parsed.stores.length,
      succeeded: outcomes.filter((outcome) => outcome.ok).length,
      failed: outcomes.filter((outcome) => !outcome.ok).length,
      outcomes,
    }
    console.log(
      JSON.stringify({
        event: 'campaign-monitoring.complete',
        mode: response.mode,
        requestedStores: response.requestedStores,
        succeeded: response.succeeded,
        failed: response.failed,
      })
    )
    return jsonResponse(response)
  } catch (error) {
    const failure = safeError(error)
    return jsonResponse(
      { error: failure.code, message: failure.message },
      failure.code === 'INVALID_REQUEST' ? 400 : 500
    )
  }
})
