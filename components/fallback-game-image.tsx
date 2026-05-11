'use client'

import { useMemo, useState } from 'react'

type FallbackGameImageProps = {
  src: string | null | undefined
  alt: string
  className?: string
  placeholderClassName?: string
  loading?: 'eager' | 'lazy'
}

function buildFallbackCandidates(src: string | null | undefined) {
  if (!src) return []

  const candidates: string[] = []
  const add = (value: string | null | undefined) => {
    if (value && !candidates.includes(value)) {
      candidates.push(value)
    }
  }

  add(src)

  try {
    const url = new URL(src)

    const width = url.searchParams.get('w')
    const height = url.searchParams.get('h')

    if (width || height) {
      const size336 = new URL(url.toString())
      size336.searchParams.set('w', '336')
      size336.searchParams.set('h', '336')
      add(size336.toString())

      const size512 = new URL(url.toString())
      size512.searchParams.set('w', '512')
      size512.searchParams.set('h', '512')
      add(size512.toString())

      const noSize = new URL(url.toString())
      noSize.searchParams.delete('w')
      noSize.searchParams.delete('h')
      add(noSize.toString())
    }
  } catch {
    // If src is not a valid absolute URL, keep only the original value.
  }

  return candidates
}

export function FallbackGameImage({
  src,
  alt,
  className,
  placeholderClassName,
  loading = 'lazy',
}: FallbackGameImageProps) {
  const candidates = useMemo(() => buildFallbackCandidates(src), [src])
  const [candidateIndex, setCandidateIndex] = useState(0)
  const currentSrc = candidates[candidateIndex]

  if (!currentSrc) {
    return (
      <div
        className={
          placeholderClassName ||
          className ||
          'flex h-full w-full items-center justify-center bg-zinc-900 text-xs text-zinc-500'
        }
        aria-label={alt}
      >
        <span>No image</span>
      </div>
    )
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      loading={loading}
      onError={() => {
        setCandidateIndex((current) => {
          const next = current + 1
          return next < candidates.length ? next : candidates.length
        })
      }}
    />
  )
}