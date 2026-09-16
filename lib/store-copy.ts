import type { Locale } from './locale'
import { t, type MessageKey } from './i18n'
import type { Store } from './stores'

const descriptionKeys: Record<string, MessageKey> = {
  "playstation-store": "Sony Interactive Entertainment’s official digital store for PlayStation.",
  "nintendo-eshop": "Nintendo’s official digital store for downloadable Nintendo games and content.",
  "microsoft-store": "Xbox’s official digital store for Xbox consoles and Windows PC.",
  "steam": "Valve’s official digital PC store for games and downloadable content.",
  "epic-games-store": "Epic Games’ official digital PC store for games and add-on content.",
  "gog": "GOG’s digital PC store, with a focus on DRM-free games.",
  "ea-app": "Electronic Arts’ official PC app and destination for EA games.",
  "ubisoft-store": "Ubisoft’s official digital PC store for its games and downloadable content.",
  "battle-net": "Blizzard’s official digital store for Battle.net games and expansions.",
  "rockstar-store": "Rockstar Games’ official store for its PC games and related digital content."
}

export function localizedStoreDescription(locale: Locale, store: Store): string {
  return t(locale, descriptionKeys[store.slug])
}
