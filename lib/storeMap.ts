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
  '13': 'Ubisoft Connect',
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

export const ALLOWED_STORE_IDS = new Set([
  '1',  // Steam
  '3',  // Green Man Gaming
  '7',  // GOG
  '8',  // Origin / EA App
  '11', // Humble Store
  '13', // Ubisoft Connect
  '15', // Fanatical
  '25', // Epic Games Store
])

export function isAllowedStore(storeID?: string) {
  if (!storeID) return false
  return ALLOWED_STORE_IDS.has(storeID)
}

export const FEATURED_STORE_OPTIONS = [
  { value: 'all', label: 'All stores' },
  { value: '1', label: 'Steam' },
  { value: '7', label: 'GOG' },
  { value: '8', label: 'EA / Origin' },
  { value: '13', label: 'Ubisoft Connect' },
  { value: '11', label: 'Humble Store' },
  { value: '15', label: 'Fanatical' },
  { value: '3', label: 'Green Man Gaming' },
  { value: '25', label: 'Epic Games Store' },
]

export function getStoreLogo(storeID?: string) {
  switch (storeID) {
    case '1':
      return 'https://cdn.simpleicons.org/steam/ffffff'
    case '3':
      return 'https://cdn.simpleicons.org/greenhouse/ffffff'
    case '7':
      return 'https://cdn.simpleicons.org/gogdotcom/ffffff'
    case '8':
      return 'https://cdn.simpleicons.org/ea/ffffff'
    case '11':
      return 'https://cdn.simpleicons.org/humblebundle/ffffff'
    case '13':
      return 'https://cdn.simpleicons.org/ubisoft/ffffff'
    case '15':
      return 'https://cdn.simpleicons.org/fanatical/ffffff'
    case '25':
      return 'https://cdn.simpleicons.org/epicgames/ffffff'
    default:
      return null
  }
}