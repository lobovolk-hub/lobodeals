import { createClient } from '@supabase/supabase-js'
import {
  getSafeDiscountPercent,
  makePcCanonicalKey,
  makePcCanonicalSlug,
  normalizeCanonicalTitle,
} from '@/lib/pcCanonical'

type ResolveCanonicalPcGameInput = {
  slug: string
  titleHint?: string
  steamAppIDHint?: string
}

type PcGameRow = {
  id: string
  steam_app_id?: string | null
  slug?: string | null
  steam_name?: string | null
  canonical_title?: string | null
  canonical_key?: string | null
  normalized_title?: string | null
  steam_type?: string | null
  is_free_to_play?: boolean | null
  is_active?: boolean | null
  is_catalog_ready?: boolean | null
  release_date?: string | null
  short_description?: string | null
  description?: string | null
  header_image?: string | null
  capsule_image?: string | null
  hero_image_url?: string | null
  clip_url?: string | null
  metacritic?: number | null
  rawg_description?: string | null
  rawg_genres?: string[] | null
  rawg_platforms?: string[] | null
}

type PcStoreOfferRow = {
  pc_game_id: string
  sale_price?: number | string | null
  normal_price?: number | string | null
  discount_percent?: number | string | null
  store_id?: string | null
  url?: string | null
  is_available?: boolean | null
}

type PcScreenshotRow = {
  image_url?: string | null
  sort_order?: number | null
}

type RawgMetaPayload = {
  name?: string
  description?: string
  background_image?: string
  background_image_additional?: string
  rating?: number
  metacritic?: number | null
  released?: string
  genres?: string[]
  platforms?: string[]
  screenshots?: string[]
  clip?: string | null
}

type DealsCacheRow = {
  cache_key?: string | null
  payload?: RawgMetaPayload | null
  updated_at?: string | null
}

export type CanonicalPcOfferLocal = {
  id: string
  source: 'steam'
  title: string
  normalizedTitle: string
  canonicalKey: string
  slug: string
  steamAppID?: string
  gameID?: string
  dealID?: string
  salePrice: string
  normalPrice: string
  savings: string
  thumb: string
  storeID: string
  url?: string
  metacriticScore?: string
}

export type CanonicalPcGameLocal = {
  id: string
  slug: string
  canonicalTitle: string
  normalizedTitle: string
  canonicalKey: string
  steamAppID?: string
  isFreeToPlay: boolean
  releaseDate: string | null
  shortDescription: string | null
  description: string | null
  headerImage: string | null
  capsuleImage: string | null
  screenshots: string[]
  rawgMeta: RawgMetaPayload | null
  offers: CanonicalPcOfferLocal[]
  heroOffer: CanonicalPcOfferLocal
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRole) {
    throw new Error('Missing Supabase env vars for canonical pc resolver')
  }

  return createClient(url, serviceRole)
}

function formatMoney(value?: number | string | null) {
  const amount = Number(value || 0)

  if (!Number.isFinite(amount) || amount <= 0) {
    return ''
  }

  return amount.toFixed(2)
}

function formatSavings(
  salePrice?: number | string | null,
  normalPrice?: number | string | null,
  discountPercent?: number | string | null
) {
  return String(
    getSafeDiscountPercent(salePrice, normalPrice, discountPercent || 0)
  )
}

function buildSteamStoreUrl(appId?: string | null) {
  const cleanAppId = String(appId || '').trim()
  if (!cleanAppId) return ''
  return `https://store.steampowered.com/app/${cleanAppId}/`
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  )
}

async function findGameRow(
  supabase: ReturnType<typeof getServiceSupabase>,
  input: ResolveCanonicalPcGameInput
) {
  const slug = makePcCanonicalSlug(input.slug)

  if (!slug) return null

  const selectFields =
    'id, steam_app_id, slug, steam_name, canonical_title, canonical_key, normalized_title, steam_type, is_free_to_play, is_active, is_catalog_ready, release_date, short_description, description, header_image, capsule_image, hero_image_url, clip_url, metacritic, rawg_description, rawg_genres, rawg_platforms'

  const { data: bySlug, error: slugError } = await supabase
    .from('pc_games')
    .select(selectFields)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (slugError) throw slugError
  if (bySlug) return bySlug as PcGameRow

  const steamAppIDHint = String(input.steamAppIDHint || '').trim()

  if (steamAppIDHint) {
    const { data: byApp, error: appError } = await supabase
      .from('pc_games')
      .select(selectFields)
      .eq('steam_app_id', steamAppIDHint)
      .eq('is_active', true)
      .maybeSingle()

    if (appError) throw appError
    if (byApp) return byApp as PcGameRow
  }

  const titleHint = String(input.titleHint || '').trim()
  if (titleHint) {
    const canonicalKey = makePcCanonicalKey(titleHint)

    const { data: byKey, error: keyError } = await supabase
      .from('pc_games')
      .select(selectFields)
      .eq('canonical_key', canonicalKey)
      .eq('is_active', true)
      .limit(1)

    if (keyError) throw keyError
    if (Array.isArray(byKey) && byKey.length > 0) {
      return byKey[0] as PcGameRow
    }
  }

  return null
}

async function loadOffers(
  supabase: ReturnType<typeof getServiceSupabase>,
  pcGameId: string
) {
  const { data, error } = await supabase
    .from('pc_store_offers')
    .select(
      'pc_game_id, sale_price, normal_price, discount_percent, store_id, url, is_available'
    )
    .eq('pc_game_id', pcGameId)
    .eq('store_id', '1')
    .eq('is_available', true)

  if (error) throw error
  return Array.isArray(data) ? (data as PcStoreOfferRow[]) : []
}

async function loadScreenshots(
  supabase: ReturnType<typeof getServiceSupabase>,
  pcGameId: string
) {
  const { data, error } = await supabase
    .from('pc_game_screenshots')
    .select('image_url, sort_order')
    .eq('pc_game_id', pcGameId)
    .order('sort_order', { ascending: true })

  if (error) throw error

  return (Array.isArray(data) ? (data as PcScreenshotRow[]) : [])
    .map((row) => String(row.image_url || '').trim())
    .filter(Boolean)
}

async function loadFallbackRawgMeta(
  supabase: ReturnType<typeof getServiceSupabase>,
  candidates: string[]
) {
  const keys = dedupeStrings(
    candidates.map((value) => `rawg_meta::${String(value || '').toLowerCase().trim()}::1`)
  )

  if (keys.length === 0) return null

  const { data, error } = await supabase
    .from('deals_cache')
    .select('cache_key, payload, updated_at')
    .in('cache_key', keys)

  if (error) throw error

  const rows = Array.isArray(data) ? (data as DealsCacheRow[]) : []
  const validRows = rows.filter(
    (row) => row && row.payload && typeof row.payload === 'object'
  )

  if (!validRows.length) return null

  validRows.sort((a, b) => {
    const metaA = Number(a.payload?.metacritic || 0)
    const metaB = Number(b.payload?.metacritic || 0)

    if (metaB !== metaA) return metaB - metaA

    const timeA = new Date(String(a.updated_at || 0)).getTime()
    const timeB = new Date(String(b.updated_at || 0)).getTime()

    return timeB - timeA
  })

  return validRows[0].payload || null
}

function chooseHeroOffer(
  offers: CanonicalPcOfferLocal[],
  fallback: CanonicalPcOfferLocal
) {
  if (!offers.length) return fallback

  return [...offers].sort((a, b) => {
    const savingsA = Number(a.savings || 0)
    const savingsB = Number(b.savings || 0)

    if (savingsB !== savingsA) return savingsB - savingsA

    const saleA = Number(a.salePrice || 999999)
    const saleB = Number(b.salePrice || 999999)

    return saleA - saleB
  })[0]
}

export async function resolveCanonicalPcGame({
  slug,
  titleHint,
  steamAppIDHint,
}: ResolveCanonicalPcGameInput): Promise<CanonicalPcGameLocal | null> {
  const supabase = getServiceSupabase()

  const game = await findGameRow(supabase, {
    slug,
    titleHint,
    steamAppIDHint,
  })

  if (!game) {
    return null
  }

  const canonicalTitle = String(
    game.steam_name || game.canonical_title || ''
  ).trim()

  if (!canonicalTitle) {
    return null
  }

  const canonicalSlug = String(game.slug || makePcCanonicalSlug(canonicalTitle)).trim()
  const normalizedTitle = normalizeCanonicalTitle(canonicalTitle)
  const canonicalKey = String(
    game.canonical_key || makePcCanonicalKey(canonicalTitle)
  ).trim()

  const [offerRows, screenshotRows, fallbackRawgMeta] = await Promise.all([
    loadOffers(supabase, String(game.id)),
    loadScreenshots(supabase, String(game.id)),
    loadFallbackRawgMeta(supabase, [
      canonicalTitle,
      String(game.canonical_title || ''),
      String(titleHint || ''),
      canonicalSlug.replace(/-/g, ' '),
      normalizedTitle,
    ]),
  ])

  const rawgMeta: RawgMetaPayload | null = {
    name: canonicalTitle,
    description:
      String(game.rawg_description || '').trim() ||
      String(fallbackRawgMeta?.description || '').trim() ||
      '',
    background_image:
      String(game.hero_image_url || '').trim() ||
      String(fallbackRawgMeta?.background_image || '').trim() ||
      '',
    metacritic:
      Number(game.metacritic || 0) > 0
        ? Number(game.metacritic)
        : Number(fallbackRawgMeta?.metacritic || 0) > 0
        ? Number(fallbackRawgMeta?.metacritic)
        : null,
    released:
      String(game.release_date || '').trim() ||
      String(fallbackRawgMeta?.released || '').trim() ||
      '',
    genres: Array.isArray(game.rawg_genres) ? game.rawg_genres : [],
    platforms: Array.isArray(game.rawg_platforms) ? game.rawg_platforms : ['PC'],
    screenshots: [],
    clip:
      String(game.clip_url || '').trim() ||
      String(fallbackRawgMeta?.clip || '').trim() ||
      '',
  }

  const localOffers: CanonicalPcOfferLocal[] = offerRows.map((offer, index) => ({
    id: `steam-${game.steam_app_id || canonicalKey}-${index}`,
    source: 'steam',
    title: canonicalTitle,
    normalizedTitle,
    canonicalKey,
    slug: canonicalSlug,
    steamAppID: String(game.steam_app_id || '').trim(),
    gameID: '',
    dealID: `steam-${game.steam_app_id || canonicalKey}`,
    salePrice: formatMoney(offer.sale_price),
    normalPrice: formatMoney(offer.normal_price),
    savings: formatSavings(
      offer.sale_price,
      offer.normal_price,
      offer.discount_percent
    ),
    thumb:
      String(game.hero_image_url || '').trim() ||
      String(game.header_image || '').trim() ||
      String(game.capsule_image || '').trim(),
    storeID: String(offer.store_id || '1').trim(),
    url: String(offer.url || '').trim() || buildSteamStoreUrl(game.steam_app_id),
    metacriticScore:
      rawgMeta && typeof rawgMeta.metacritic === 'number'
        ? String(rawgMeta.metacritic)
        : '',
  }))

  const fallbackOffer: CanonicalPcOfferLocal = {
    id: `steam-${game.steam_app_id || canonicalKey}`,
    source: 'steam',
    title: canonicalTitle,
    normalizedTitle,
    canonicalKey,
    slug: canonicalSlug,
    steamAppID: String(game.steam_app_id || '').trim(),
    gameID: '',
    dealID: `steam-${game.steam_app_id || canonicalKey}`,
    salePrice: '',
    normalPrice: '',
    savings: '0',
    thumb:
      String(game.hero_image_url || '').trim() ||
      String(game.header_image || '').trim() ||
      String(game.capsule_image || '').trim(),
    storeID: '1',
    url: buildSteamStoreUrl(game.steam_app_id),
    metacriticScore:
      rawgMeta && typeof rawgMeta.metacritic === 'number'
        ? String(rawgMeta.metacritic)
        : '',
  }

  const heroOffer = chooseHeroOffer(localOffers, fallbackOffer)
  const screenshots = dedupeStrings([
    ...screenshotRows,
    String(game.hero_image_url || ''),
    String(game.header_image || ''),
    String(game.capsule_image || ''),
  ])

  rawgMeta.screenshots = screenshots

  return {
    id: String(game.id),
    slug: canonicalSlug,
    canonicalTitle,
    normalizedTitle,
    canonicalKey,
    steamAppID: String(game.steam_app_id || '').trim(),
    isFreeToPlay: Boolean(game.is_free_to_play),
    releaseDate: String(game.release_date || '').trim() || rawgMeta?.released || null,
    shortDescription: String(game.short_description || '').trim() || null,
    description:
      String(game.description || '').trim() ||
      String(game.rawg_description || '').trim() ||
      null,
    headerImage:
      String(game.hero_image_url || '').trim() ||
      String(game.header_image || '').trim() ||
      null,
    capsuleImage: String(game.capsule_image || '').trim() || null,
    screenshots,
    rawgMeta: rawgMeta || null,
    offers: localOffers.length > 0 ? localOffers : [fallbackOffer],
    heroOffer,
  }
}