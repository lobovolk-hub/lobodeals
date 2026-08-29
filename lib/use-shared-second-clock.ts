'use client'

import { useSyncExternalStore } from 'react'

const SECOND_MS = 1_000

let currentTime = 0
let interval: number | null = null
const listeners = new Set<() => void>()

function getSnapshot(): number {
  return currentTime
}

function getServerSnapshot(): number {
  return 0
}

function tick() {
  currentTime = Date.now()
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  const startsClock = listeners.size === 0
  listeners.add(listener)

  if (startsClock) {
    currentTime = Date.now()
    interval = window.setInterval(tick, SECOND_MS)
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && interval !== null) {
      window.clearInterval(interval)
      interval = null
      currentTime = 0
    }
  }
}

export function useSharedSecondClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
