'use client'

import { useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function LegacyCatalogRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  const gameID = decodeURIComponent((params.gameID as string) || '')

  useEffect(() => {
    const title = searchParams.get('title') || gameID || 'game'
    const thumb = searchParams.get('thumb') || ''
    const steamAppID = searchParams.get('steamAppID') || ''
    const salePrice = searchParams.get('salePrice') || ''
    const normalPrice = searchParams.get('normalPrice') || ''
    const savings = searchParams.get('savings') || ''
    const storeID = searchParams.get('storeID') || '1'
    const steamUrl = searchParams.get('steamUrl') || ''

    const slug = slugify(title)

    const nextParams = new URLSearchParams()

    if (title) nextParams.set('title', title)
    if (thumb) nextParams.set('thumb', thumb)
    if (steamAppID) nextParams.set('steamAppID', steamAppID)
    if (salePrice) nextParams.set('salePrice', salePrice)
    if (normalPrice) nextParams.set('normalPrice', normalPrice)
    if (savings) nextParams.set('savings', savings)
    if (storeID) nextParams.set('storeID', storeID)
    if (steamUrl) nextParams.set('steamUrl', steamUrl)

    const href = `/pc/${encodeURIComponent(slug)}${
      nextParams.toString() ? `?${nextParams.toString()}` : ''
    }`

    router.replace(href)
  }, [gameID, router, searchParams])

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Redirecting
          </p>
          <h1 className="mt-2 text-2xl font-bold">Opening canonical PC page…</h1>
          <p className="mt-3 text-sm text-zinc-400">
            This catalog route now converges into the unified PC page so the game
            always has a single main destination.
          </p>
        </div>
      </section>
    </main>
  )
}