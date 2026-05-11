'use client'

import { useEffect } from 'react'

function closeOpenDetails() {
  document.querySelectorAll('details[open]').forEach((details) => {
    details.removeAttribute('open')
  })
}

export function DetailsAutoClose() {
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      if (!(target instanceof Element)) return

      const openDetails = Array.from(
        document.querySelectorAll('details[open]')
      )

      if (openDetails.length === 0) return

      const clickedInsideOpenDetails = openDetails.some((details) =>
        details.contains(target)
      )

      if (!clickedInsideOpenDetails) {
        closeOpenDetails()
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeOpenDetails()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return null
}