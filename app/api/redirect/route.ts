import { createClient } from '@supabase/supabase-js'

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function buildSteamUrl(steamAppID?: string | null) {
  const cleanAppID = String(steamAppID || '').trim()
  if (!cleanAppID) return ''
  return `https://store.steampowered.com/app/${cleanAppID}/`
}

function getSupabaseForClicks() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }

  return createClient(url, anonKey)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const dealID = (searchParams.get('dealID') || '').trim()
    const title = (searchParams.get('title') || '').trim()
    const salePrice = (searchParams.get('salePrice') || '').trim()
    const normalPrice = (searchParams.get('normalPrice') || '').trim()
    const steamAppID = (searchParams.get('steamAppID') || '').trim()
    const steamUrl = (searchParams.get('steamUrl') || '').trim()

    const canonicalSlug = title ? slugify(title) : ''
    const canonicalUrl = canonicalSlug
      ? new URL(`/pc/${encodeURIComponent(canonicalSlug)}`, request.url).toString()
      : new URL('/pc', request.url).toString()

    const destinationUrl =
      steamUrl || buildSteamUrl(steamAppID) || canonicalUrl

    try {
      const supabase = getSupabaseForClicks()

      if (supabase && dealID) {
        await supabase.from('clicks').insert([
          {
            deal_id: dealID,
            title: title || 'Untitled',
            sale_price: salePrice || '0',
            normal_price: normalPrice || '0',
            click_type: destinationUrl.includes('steampowered.com')
              ? 'steam_direct'
              : 'canonical_fallback',
          },
        ])
      }
    } catch (clickError) {
      console.error('redirect click log error', clickError)
    }

    return Response.redirect(destinationUrl)
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Redirect error',
      },
      { status: 500 }
    )
  }
}