export const PLATFORMS = ['playstation', 'pc', 'nintendo', 'xbox'] as const

export type Platform = (typeof PLATFORMS)[number]

export type Store = Readonly<{
  slug: string
  name: string
  description: string
  platforms: readonly Platform[]
  digitalScope: string
  marketScope: string
  officialUrl: string
}>

export const platformLabels = {
  playstation: 'PlayStation',
  pc: 'PC',
  nintendo: 'Nintendo',
  xbox: 'Xbox',
} satisfies Record<Platform, string>

export const stores = [
  {
    slug: 'playstation-store',
    name: 'PlayStation Store',
    description:
      'Sony Interactive Entertainment’s official digital store for PlayStation.',
    platforms: ['playstation'],
    digitalScope:
      'Digital PlayStation games, editions, bundles, and add-on content.',
    marketScope:
      'LoboDeals follows the United States storefront and its official digital sale campaigns.',
    officialUrl: 'https://store.playstation.com/en-us/',
  },
  {
    slug: 'nintendo-eshop',
    name: 'Nintendo eShop',
    description:
      'Nintendo’s official digital store for downloadable Nintendo games and content.',
    platforms: ['nintendo'],
    digitalScope:
      'Digital Nintendo games, bundles, and eligible add-on content.',
    marketScope:
      'LoboDeals follows the United States storefront and its official digital sale campaigns.',
    officialUrl: 'https://www.nintendo.com/us/store/games/',
  },
  {
    slug: 'microsoft-store',
    name: 'Xbox Store',
    description:
      'Xbox’s official digital store for Xbox consoles and Windows PC.',
    platforms: ['pc', 'xbox'],
    digitalScope:
      'Digital Windows PC and Xbox games, editions, bundles, and add-on content.',
    marketScope:
      'LoboDeals follows the United States storefront and its official digital sale campaigns.',
    officialUrl: 'https://www.xbox.com/en-US/games',
  },
  {
    slug: 'steam',
    name: 'Steam',
    description:
      'Valve’s official digital PC store for games and downloadable content.',
    platforms: ['pc'],
    digitalScope:
      'Digital PC games, editions, bundles, and downloadable content for Steam.',
    marketScope:
      'LoboDeals follows United States availability and official Steam sale campaigns.',
    officialUrl: 'https://store.steampowered.com/',
  },
  {
    slug: 'epic-games-store',
    name: 'Epic Games Store',
    description:
      'Epic Games’ official digital PC store for games and add-on content.',
    platforms: ['pc'],
    digitalScope:
      'Digital PC games, editions, bundles, and add-on content for Epic Games accounts.',
    marketScope:
      'LoboDeals follows United States availability and official Epic Games Store sale campaigns.',
    officialUrl: 'https://store.epicgames.com/en-US/',
  },
  {
    slug: 'gog',
    name: 'GOG',
    description:
      'GOG’s digital PC store, with a focus on DRM-free games.',
    platforms: ['pc'],
    digitalScope:
      'Digital PC games, editions, bundles, and downloadable content, with many DRM-free releases.',
    marketScope:
      'LoboDeals follows United States availability and official GOG sale campaigns.',
    officialUrl: 'https://www.gog.com/en/',
  },
  {
    slug: 'ea-app',
    name: 'EA app',
    description:
      'Electronic Arts’ official PC app and destination for EA games.',
    platforms: ['pc'],
    digitalScope:
      'Digital EA PC games, editions, bundles, and downloadable content.',
    marketScope:
      'LoboDeals follows United States availability and official EA sale campaigns.',
    officialUrl: 'https://www.ea.com/games',
  },
  {
    slug: 'ubisoft-store',
    name: 'Ubisoft Store',
    description:
      'Ubisoft’s official digital PC store for its games and downloadable content.',
    platforms: ['pc'],
    digitalScope:
      'Digital Ubisoft PC games, editions, bundles, and downloadable content.',
    marketScope:
      'LoboDeals follows the United States storefront and its official sale campaigns.',
    officialUrl: 'https://store.ubisoft.com/us/home',
  },
  {
    slug: 'battle-net',
    name: 'Battle.net',
    description:
      'Blizzard’s official digital store for Battle.net games and expansions.',
    platforms: ['pc'],
    digitalScope:
      'Digital Battle.net games, expansions, bundles, and add-on content.',
    marketScope:
      'LoboDeals follows the United States storefront and its official sale campaigns.',
    officialUrl: 'https://us.shop.battle.net/en-us',
  },
  {
    slug: 'rockstar-store',
    name: 'Rockstar Store',
    description:
      'Rockstar Games’ official store for its PC games and related digital content.',
    platforms: ['pc'],
    digitalScope:
      'Digital Rockstar Games PC releases and related digital content.',
    marketScope:
      'LoboDeals follows the United States storefront and its official digital sale campaigns.',
    officialUrl: 'https://store.rockstargames.com/',
  },
] as const satisfies readonly Store[]

export type StoreSlug = (typeof stores)[number]['slug']

export const singleStoreCanonicalRoutes: Partial<Record<StoreSlug, string>> = {
  'playstation-store': '/playstation',
  'nintendo-eshop': '/nintendo',
  'microsoft-store': '/xbox',
}

const storesBySlug = new Map<string, Store>(
  stores.map((store) => [store.slug, store] as const)
)

export const storeStaticParams = stores.map(({ slug }) => ({ slug }))

export const storeProfileStaticParams = stores
  .filter(({ slug }) => !singleStoreCanonicalRoutes[slug])
  .map(({ slug }) => ({ slug }))

export function getStorePublicHref(store: Pick<Store, 'slug'>): string {
  return (
    singleStoreCanonicalRoutes[store.slug as StoreSlug] ??
    `/services/${store.slug}`
  )
}

export function getStoreBySlug(slug: string): Store | undefined {
  return storesBySlug.get(slug)
}

export function getStoresByPlatform(platform: Platform): readonly Store[] {
  return stores.filter((store) =>
    (store.platforms as readonly Platform[]).includes(platform)
  )
}
