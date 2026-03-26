export const STORE_MAP: Record<string, string> = {
  '1': 'Steam',
  '2': 'GamersGate',
  '3': 'Green Man Gaming',
  '4': 'Amazon',
  '5': 'GameStop',
  '6': 'Direct2Drive',
  '7': 'GOG',
  '8': 'Origin',
  '9': 'Get Games',
  '10': 'Shiny Loot',
  '11': 'Humble Store',
  '12': 'Desura',
  '13': 'Uplay',
  '14': 'IndieGameStand',
  '15': 'Fanatical',
  '16': 'Gamesrocket',
  '17': 'Games Republic',
  '18': 'SilaGames',
  '19': 'Playfield',
  '20': 'ImperialGames',
  '21': 'WinGameStore',
  '22': 'FunStock Digital',
  '23': 'GameBillet',
  '24': 'Voidu',
  '25': 'Epic Games Store',
  '26': 'Razer Game Store',
  '27': 'Gamesplanet',
  '28': 'Gamesload',
  '29': '2Game',
  '30': 'IndieGala',
  '31': 'Blizzard Shop',
  '32': 'AllYouPlay',
  '33': 'DLGamer',
  '34': 'Noctre',
  '35': 'DreamGame',
}

export function getStoreName(storeID?: string) {
  if (!storeID) return 'Unknown store'
  return STORE_MAP[storeID] || `Store ${storeID}`
}

export const FEATURED_STORE_OPTIONS = [
  { value: 'all', label: 'All stores' },
  { value: '1', label: 'Steam' },
  { value: '7', label: 'GOG' },
  { value: '8', label: 'Origin' },
  { value: '13', label: 'Ubisoft Connect' },
  { value: '11', label: 'Humble Store' },
  { value: '15', label: 'Fanatical' },
  { value: '25', label: 'Epic Games Store' },
]