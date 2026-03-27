export function getPlatformLabel(storeID?: string) {
  switch (storeID) {
    case '1': // Steam
    case '3': // Green Man Gaming
    case '7': // GOG
    case '8': // Origin / EA App
    case '11': // Humble Store
    case '13': // Ubisoft Connect
    case '15': // Fanatical
    case '25': // Epic Games Store
      return 'PC'
    default:
      return 'PC'
  }
}