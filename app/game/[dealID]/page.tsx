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

export default function LegacyGameRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()

  const dealID = decodeURIComponent((params.dealID as string) || '')

  useEffect(() => {
    const title = searchParams.get('title') || 'game'
    const thumb = searchParams.get('thumb') || ''
    const salePrice = searchParams.get('salePrice') || ''
    const normalPrice = searchParams.get('normalPrice') || ''
    const savings = searchParams.get('savings') || ''
    const storeID = searchParams.get('storeID') || '1'
    const steamAppID = searchParams.get('steamAppID') || ''
    const steamUrl = searchParams.get('steamUrl') || ''
    const source = searchParams.get('source') || ''

    const slug = slugify(title || dealID || 'game')

    const target = new URLSearchParams()

    if (steamAppID) target.set('steamAppID', steamAppID)
    if (title) target.set('title', title)
    if (thumb) target.set('thumb', thumb)
    if (salePrice) target.set('salePrice', salePrice)
    if (normalPrice) target.set('normalPrice', normalPrice)
    if (savings) target.set('savings', savings)
    if (storeID) target.set('storeID', storeID)
    if (steamUrl) target.set('steamUrl', steamUrl)
    if (source) target.set('source', source)

    // Incluso si no vino steamAppID, por ahora toda experiencia PC va a
    // converger a la ruta canónica /pc/[slug]. La ficha canónica puede
    // reconstruirse con el título y los demás datos de query.
    const nextHref = `/pc/${encodeURIComponent(slug)}${
      target.toString() ? `?${target.toString()}` : ''
    }`

    router.replace(nextHref)
  }, [dealID, router, searchParams])

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">
            Redirecting
          </p>
          <h1 className="mt-2 text-2xl font-bold">Opening canonical PC page…</h1>
          <p className="mt-3 text-sm text-zinc-400">
            We are moving this game to the unified PC route so the experience stays
            consistent.
          </p>
        </div>
      </section>
    </main>
  )
}