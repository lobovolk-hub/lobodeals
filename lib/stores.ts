export const PLATFORMS = ['playstation', 'pc', 'nintendo', 'xbox'] as const

export type Platform = (typeof PLATFORMS)[number]

export type StoreLogo = Readonly<{
  src: string
  width: number
  height: number
  surface: 'light' | 'dark'
}>

export type Store = Readonly<{
  slug: string
  name: string
  description: string
  platforms: readonly Platform[]
  digitalScope: string
  marketScope: string
  officialUrl: string
  logo: StoreLogo | null
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
    logo: {
      src: '/services/playstation-store/logo.png',
      width: 800,
      height: 800,
      surface: 'light',
    },
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
    logo: {
      src: '/services/nintendo-eshop/logo.png',
      width: 512,
      height: 512,
      surface: 'light',
    },
  },
  {
    slug: 'microsoft-store',
    name: 'Microsoft / Xbox Store',
    description:
      'Microsoft’s single canonical store identity for digital Windows PC and Xbox games.',
    platforms: ['pc', 'xbox'],
    digitalScope:
      'Digital Windows PC and Xbox games, editions, bundles, and add-on content.',
    marketScope:
      'LoboDeals follows the United States storefront and its official digital sale campaigns.',
    officialUrl: 'https://apps.microsoft.com/games?hl=en-US&gl=US',
    logo: {
      src: '/services/microsoft-store/logo.png',
      width: 256,
      height: 256,
      surface: 'light',
    },
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
    logo: {
      src: '/services/steam/logo.png',
      width: 744,
      height: 171,
      surface: 'dark',
    },
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
    logo: {
      src: '/services/epic-games-store/logo.png',
      width: 1360,
      height: 1360,
      surface: 'light',
    },
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
    logo: {
      src: '/services/gog/logo.png',
      width: 1920,
      height: 1819,
      surface: 'light',
    },
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
    officialUrl: 'https://www.ea.com/ea-app',
    logo: {
      src: '/services/ea-app/logo.png',
      width: 60,
      height: 60,
      surface: 'dark',
    },
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
    logo: {
      src: '/services/ubisoft-store/logo.svg',
      width: 722,
      height: 316,
      surface: 'dark',
    },
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
    logo: {
      src: '/services/battle-net/logo.svg',
      width: 1200,
      height: 717,
      surface: 'dark',
    },
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
    logo: null,
  },
] as const satisfies readonly Store[]

export type StoreSlug = (typeof stores)[number]['slug']

const storesBySlug = new Map<string, Store>(
  stores.map((store) => [store.slug, store] as const)
)

export const storeStaticParams = stores.map(({ slug }) => ({ slug }))

export function getStoreBySlug(slug: string): Store | undefined {
  return storesBySlug.get(slug)
}

export function getStoresByPlatform(platform: Platform): readonly Store[] {
  return stores.filter((store) =>
    (store.platforms as readonly Platform[]).includes(platform)
  )
}
