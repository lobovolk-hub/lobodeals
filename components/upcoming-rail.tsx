'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

type UpcomingRailProps = {
  children: ReactNode
}

export function UpcomingRail({ children }: UpcomingRailProps) {
  const railRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateControls = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    const firstCard = rail.firstElementChild as HTMLElement | null
    const snappedStart = firstCard
      ? Math.max(0, firstCard.offsetLeft - rail.offsetLeft)
      : 0
    setCanScrollLeft(rail.scrollLeft > snappedStart + 2)
    setCanScrollRight(
      rail.scrollLeft + rail.clientWidth < rail.scrollWidth - 2
    )
  }, [])

  useEffect(() => {
    updateControls()
    window.addEventListener('resize', updateControls)
    return () => window.removeEventListener('resize', updateControls)
  }, [updateControls])

  const scroll = useCallback((direction: -1 | 1) => {
    const rail = railRef.current
    if (!rail) return
    rail.scrollBy({
      left: direction * Math.max(280, rail.clientWidth * 0.82),
      behavior: 'smooth',
    })
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    scroll(event.key === 'ArrowLeft' ? -1 : 1)
  }

  const handleControlKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    direction: -1 | 1
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    scroll(direction)
  }

  return (
    <div className="mt-5">
      <div className="mb-3 hidden justify-end gap-2 sm:flex">
        <button
          type="button"
          aria-label="Scroll upcoming sales left"
          disabled={!canScrollLeft}
          onClick={() => scroll(-1)}
          onKeyDown={(event) => handleControlKeyDown(event, -1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-lg text-white transition hover:border-white/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <span aria-hidden="true">←</span>
        </button>
        <button
          type="button"
          aria-label="Scroll upcoming sales right"
          disabled={!canScrollRight}
          onClick={() => scroll(1)}
          onKeyDown={(event) => handleControlKeyDown(event, 1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-lg text-white transition hover:border-white/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <div
        ref={railRef}
        role="region"
        aria-label="Upcoming official sale campaigns"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={updateControls}
        className="upcoming-preview -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f87171] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        {children}
      </div>
    </div>
  )
}
