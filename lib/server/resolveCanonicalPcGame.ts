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
  steam_genres?: string[] | null
  steam_developers?: string[] | null
  steam_publishers?: string[] | null
  steam_movie_url?: string | null
}

type PcStoreOfferRow = {
  pc_game_id: string
  sale_price?: number | string | null
  normal_price?: number | string | null
  discount_percent?: number | string | null
  store_id?: string | null
  url?: string | null
  is_available?: boolean | null
  region_code?: string | null
  currency_code?: string | null
  price_source?: string | null
  price_last_synced_at?: string | null
  final_formatted?: string | null
  initial_formatted?: string | null
}

type PcScreenshotRow = {
  image_url?: string | null
  sort_order?: number | null
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
  heroImage: string | null
  screenshots: string[]
  metacritic: number | null
  offers: CanonicalPcOfferLocal[]
  heroOffer: CanonicalPcOfferLocal
  steamGenres: string[]
  steamDevelopers: string[]
  steamPublishers: string[]
  steamMovieUrl: string | null
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
    'id, steam_app_id, slug, steam_name, canonical_title, canonical_key, normalized_title, steam_type, is_free_to_play, is_active, is_catalog_ready, release_date, short_description, description, header_image, capsule_image, hero_image_url, clip_url, metacritic, steam_genres, steam_developers, steam_publishers, steam_movie_url'

  const { data: bySlug, error: slugError } = await supabase
    .from('pc_games')
    .select(selectFields)
    .eq('slug', slug)
    .eq('is_catalog_ready', true)
    .maybeSingle()

  if (slugError) throw slugError
  if (bySlug) return bySlug as PcGameRow

  const steamAppIDHint = String(input.steamAppIDHint || '').trim()

  if (steamAppIDHint) {
    const { data: byApp, error: appError } = await supabase
      .from('pc_games')
      .select(selectFields)
      .eq('steam_app_id', steamAppIDHint)
      .eq('is_catalog_ready', true)
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
      .eq('is_catalog_ready', true)
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
      'pc_game_id, sale_price, normal_price, discount_percent, store_id, url, is_available, region_code, currency_code, price_source, price_last_synced_at, final_formatted, initial_formatted'
    )
    .eq('pc_game_id', pcGameId)
    .eq('store_id', '1')
    .eq('region_code', 'us')
    .eq('is_available', true)

  if (error) throw error

  const offers = Array.isArray(data) ? (data as PcStoreOfferRow[]) : []

  return offers.sort((a, b) => {
    const aModern =
      a.region_code === 'us' &&
      a.price_source === 'steam_appdetails_us' &&
      !!String(a.price_last_synced_at || '').trim()

    const bModern =
      b.region_code === 'us' &&
      b.price_source === 'steam_appdetails_us' &&
      !!String(b.price_last_synced_at || '').trim()

    if (aModern !== bModern) {
      return Number(bModern) - Number(aModern)
    }

    const aDiscount = Number(a.discount_percent || 0)
    const bDiscount = Number(b.discount_percent || 0)

    if (bDiscount !== aDiscount) {
      return bDiscount - aDiscount
    }

    const aSale = Number(a.sale_price || 999999)
    const bSale = Number(b.sale_price || 999999)

    return aSale - bSale
  })
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

  return Array.isArray(data) ? (data as PcScreenshotRow[]) : []
}

export async function resolveCanonicalPcGame(
  input: ResolveCanonicalPcGameInput
): Promise<CanonicalPcGameLocal | null> {
  const supabase = getServiceSupabase()

  const game = await findGameRow(supabase, input)
  if (!game) return null

  const offers = await loadOffers(supabase, game.id)
  if (offers.length === 0) return null

  const screenshotsRows = await loadScreenshots(supabase, game.id)

  const canonicalTitle =
    String(game.canonical_title || '').trim() ||
    String(game.steam_name || '').trim()

  const normalizedTitle =
    String(game.normalized_title || '').trim() ||
    normalizeCanonicalTitle(canonicalTitle)

  const canonicalKey =
    String(game.canonical_key || '').trim() ||
    makePcCanonicalKey(canonicalTitle)

  const slug =
    String(game.slug || '').trim() ||
    makePcCanonicalSlug(canonicalTitle)

  const metacritic =
    Number(game.metacritic || 0) > 0 ? Number(game.metacritic) : null

  const mappedOffers: CanonicalPcOfferLocal[] = offers.map((offer) => ({
    id: `${game.id}-${offer.store_id || '1'}-us`,
    source: 'steam',
    title: canonicalTitle,
    normalizedTitle,
    canonicalKey,
    slug,
    steamAppID: String(game.steam_app_id || '').trim() || undefined,
    salePrice: formatMoney(offer.sale_price),
    normalPrice: formatMoney(offer.normal_price),
    savings: formatSavings(
      offer.sale_price,
      offer.normal_price,
      offer.discount_percent
    ),
    thumb:
      String(game.header_image || '').trim() ||
      String(game.capsule_image || '').trim() ||
      String(game.hero_image_url || '').trim(),
    storeID: String(offer.store_id || '1').trim(),
    url: String(offer.url || '').trim() || buildSteamStoreUrl(game.steam_app_id),
    metacriticScore:
      typeof metacritic === 'number' ? String(metacritic) : undefined,
  }))

  const heroOffer =
    mappedOffers[0] ||
    ({
      id: `${game.id}-steam-us`,
      source: 'steam',
      title: canonicalTitle,
      normalizedTitle,
      canonicalKey,
      slug,
      steamAppID: String(game.steam_app_id || '').trim() || undefined,
      salePrice: '',
      normalPrice: '',
      savings: '0',
      thumb:
        String(game.header_image || '').trim() ||
        String(game.capsule_image || '').trim() ||
        String(game.hero_image_url || '').trim(),
      storeID: '1',
      url: buildSteamStoreUrl(game.steam_app_id),
      metacriticScore:
        typeof metacritic === 'number' ? String(metacritic) : undefined,
    } satisfies CanonicalPcOfferLocal)

  const screenshots = dedupeStrings(
    screenshotsRows.map((row) => String(row.image_url || '').trim())
  )

  return {
    id: game.id,
    slug,
    canonicalTitle,
    normalizedTitle,
    canonicalKey,
    steamAppID: String(game.steam_app_id || '').trim() || undefined,
    isFreeToPlay: Boolean(game.is_free_to_play),
    releaseDate: String(game.release_date || '').trim() || null,
    shortDescription: String(game.short_description || '').trim() || null,
    description: String(game.description || '').trim() || null,
    headerImage: String(game.header_image || '').trim() || null,
    capsuleImage: String(game.capsule_image || '').trim() || null,
    heroImage: String(game.hero_image_url || '').trim() || null,
    screenshots,
    metacritic,
    offers: mappedOffers,
    heroOffer,
    steamGenres: Array.isArray(game.steam_genres) ? dedupeStrings(game.steam_genres) : [],
    steamDevelopers: Array.isArray(game.steam_developers) ? dedupeStrings(game.steam_developers) : [],
    steamPublishers: Array.isArray(game.steam_publishers) ? dedupeStrings(game.steam_publishers) : [],
    steamMovieUrl:
      String(game.steam_movie_url || '').trim() ||
      String(game.clip_url || '').trim() ||
      null,
  }
}