import { runBattleNetAdapter } from './battle-net.ts'
import { runEaAppAdapter } from './ea-app.ts'
import { runEpicGamesStoreAdapter } from './epic-games-store.ts'
import { runGogAdapter } from './gog.ts'
import { runMicrosoftStoreAdapter } from './microsoft-store.ts'
import { runNintendoEshopAdapter } from './nintendo-eshop.ts'
import { runPlayStationStoreAdapter } from './playstation-store.ts'
import { runRockstarStoreAdapter } from './rockstar-store.ts'
import { runSteamAdapter } from './steam.ts'
import { runUbisoftStoreAdapter } from './ubisoft-store.ts'
import type { StoreAdapter, StoreSlug } from '../_shared/types.ts'

export const adapters: Readonly<Record<StoreSlug, StoreAdapter>> = {
  'playstation-store': runPlayStationStoreAdapter,
  'nintendo-eshop': runNintendoEshopAdapter,
  'microsoft-store': runMicrosoftStoreAdapter,
  steam: runSteamAdapter,
  'epic-games-store': runEpicGamesStoreAdapter,
  gog: runGogAdapter,
  'ea-app': runEaAppAdapter,
  'ubisoft-store': runUbisoftStoreAdapter,
  'battle-net': runBattleNetAdapter,
  'rockstar-store': runRockstarStoreAdapter,
}
