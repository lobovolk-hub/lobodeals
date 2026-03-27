'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useParams, useSearchParams } from 'next/navigation'
import { getStoreLogo, getStoreName } from '@/lib/storeMap'
import { getPlatformLabel } from '@/lib/platformMap'

type Game = {
  dealID: string
  title: string
  thumb: string
  salePrice: string
  normalPrice: string
  dealRating: string
  savings: string
  storeID?: string
  gameID?: string
}

type RawgMeta = {
  name: string
  description: string
  background_image: string
  rating: number
  metacritic: number | null
  released: string
  genres: string[]
  platforms: string[]
  screenshots: string[]
}

export default function GamePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const dealID = decodeURIComponent(params.dealID as string)

  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [isInWishlist, setIsInWishlist] = useState(false)
  const [hasAlert, setHasAlert] = useState(false)
  const [rawgMeta, setRawgMeta] = useState<RawgMeta | null>(null)
  const [rawgLoading, setRawgLoading] = useState(true)
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null)
  
  const [historicalLow, setHistoricalLow] = useState<string | null>(null)
const [historicalLowDate, setHistoricalLowDate] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const gameFromUrl: Game = {
          dealID,
          title: searchParams.get('title') || 'Game',
          thumb: searchParams.get('thumb') || '',
          salePrice: searchParams.get('salePrice') || '0',
          normalPrice: searchParams.get('normalPrice') || '0',
          dealRating: searchParams.get('dealRating') || '',
          savings: searchParams.get('savings') || '0',
          storeID: searchParams.get('storeID') || '',
          gameID: searchParams.get('gameID') || '',
        }

        setGame(gameFromUrl)

        if (gameFromUrl.gameID) {
          try {
            const pricingRes = await fetch(
              `/api/game-pricing?gameID=${encodeURIComponent(gameFromUrl.gameID)}`
            )

            if (pricingRes.ok) {
              const pricingData = await pricingRes.json()
              setHistoricalLow(pricingData.cheapestPriceEver)
              setHistoricalLowDate(pricingData.cheapestPriceEverDate)
            }
          } catch (error) {
            console.error('Historical low error:', error)
          }
        }

        try {
  const rawgRes = await fetch(
  `/api/rawg?dealID=${encodeURIComponent(gameFromUrl.dealID)}&title=${encodeURIComponent(gameFromUrl.title)}`
)

  if (rawgRes.ok) {
    const rawgData = await rawgRes.json()
    setRawgMeta(rawgData)
  }
} catch (error) {
  console.error('RAWG error:', error)
} finally {
  setRawgLoading(false)
}

        const {
          data: { session },
        } = await supabase.auth.getSession()

        const currentUserId = session?.user?.id ?? null
        setUserId(currentUserId)

        if (!currentUserId) {
          setLoading(false)
          return
        }

        const { data: wishlist } = await supabase
          .from('wishlist')
          .select('deal_id')
          .eq('user_id', currentUserId)
          .eq('deal_id', dealID)

        if (wishlist && wishlist.length > 0) {
          setIsInWishlist(true)
        }

        const { data: alerts } = await supabase
          .from('alerts')
          .select('deal_id')
          .eq('user_id', currentUserId)
          .eq('deal_id', dealID)

        if (alerts && alerts.length > 0) {
          setHasAlert(true)
        }
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [dealID, searchParams])

  if (loading) {
    return <div className="p-10 text-white">Loading...</div>
  }

  if (!game) {
    return <div className="p-10 text-white">Game not found</div>
  }

  const discount = Math.round(Number(game.savings))
  const savingsAmount =
    Number(game.normalPrice) - Number(game.salePrice)

  let dealLabel = ''
  let dealColor = ''

  if (discount >= 85) {
    dealLabel = '🔥 Brutal deal'
    dealColor = 'text-red-400'
  } else if (discount >= 70) {
    dealLabel = '💎 Great price'
    dealColor = 'text-emerald-400'
  } else if (discount >= 50) {
    dealLabel = '👍 Good discount'
    dealColor = 'text-cyan-400'
  } else {
    dealLabel = '📉 Average deal'
    dealColor = 'text-zinc-400'
  }

  return (
    <main className="relative min-h-screen text-zinc-100">
      <div className="absolute inset-0 overflow-hidden">
        <img
  src={rawgMeta?.background_image || game.thumb}
  alt={game.title}
  className="h-full w-full object-cover blur-2xl scale-110 opacity-30"
/>
        <div className="absolute inset-0 bg-zinc-950/80" />
      </div>

      <section className="relative mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6 backdrop-blur">
          
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
  {/* Cover */}
  <div>
    <img
      src={rawgMeta?.background_image || game.thumb}
      alt={game.title}
      className="h-[500px] w-full rounded-2xl object-cover shadow-xl"
    />
  </div>

  {/* Main info */}
  <div className="flex flex-col gap-5">
    <div>
      <h1 className="max-w-3xl text-3xl font-bold leading-tight">
        {game.title}
      </h1>

      <p className={`mt-2 text-sm font-medium ${dealColor}`}>
        {dealLabel}
      </p>

      <div className="mt-4 flex items-center gap-4">
        <span className="text-4xl font-bold text-emerald-400">
          ${game.salePrice}
        </span>
        <span className="text-lg text-zinc-400 line-through">
          ${game.normalPrice}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          -{discount}%
        </span>

        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
          You save ${savingsAmount.toFixed(2)}
        </span>

        {Number(game.dealRating) >= 9 && (
          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
            ⭐ Top deal
          </span>
        )}

        <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
  {getStoreLogo(game.storeID) && (
    <img
      src={getStoreLogo(game.storeID)!}
      alt={getStoreName(game.storeID)}
      className="h-4 w-4 object-contain"
    />
  )}
  <span>{getStoreName(game.storeID)}</span>
</span>

        <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
          {getPlatformLabel(game.storeID)}
        </span>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
  <p className="text-xs uppercase tracking-wider text-zinc-500">
    Historical low
  </p>
  <p className="mt-2 text-2xl font-bold text-pink-300">
    {historicalLow ? `$${historicalLow}` : 'N/A'}
  </p>
  {historicalLowDate && (
    <p className="mt-1 text-xs text-zinc-500">
      Source date: {historicalLowDate}
    </p>
  )}
</div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Discount
        </p>
        <p className="mt-2 text-2xl font-bold text-emerald-300">
          -{discount}%
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          Deal rating
        </p>
        <p className="mt-2 text-2xl font-bold text-cyan-300">
          {game.dealRating || 'N/A'}
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
        <p className="text-xs uppercase tracking-wider text-zinc-500">
          You save
        </p>
        <p className="mt-2 text-2xl font-bold text-yellow-300">
          ${savingsAmount.toFixed(2)}
        </p>
      </div>
    </div>

    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button
        onClick={async () => {
          if (!userId) return

          const res = await fetch('/api/wishlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dealID: game.dealID,
              title: game.title,
              salePrice: game.salePrice,
              normalPrice: game.normalPrice,
              thumb: game.thumb,
              userId,
            }),
          })

          const data = await res.json()

          if (data.action === 'added') setIsInWishlist(true)
          if (data.action === 'removed') setIsInWishlist(false)
        }}
        className={`rounded-xl px-4 py-3 text-sm font-medium transition active:scale-[0.98] ${
          isInWishlist
            ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
            : 'border border-zinc-700 hover:bg-zinc-800'
        }`}
      >
        {isInWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
      </button>

      <button
        onClick={async () => {
          if (!userId) return

          const targetPrice = game.salePrice

          const res = await fetch('/api/alerts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dealID: game.dealID,
              title: game.title,
              targetPrice,
              currentPrice: game.salePrice,
              userId,
            }),
          })

          const data = await res.json()

          if (data.action === 'added') setHasAlert(true)
          if (data.action === 'removed') setHasAlert(false)
        }}
        className={`rounded-xl px-4 py-3 text-sm font-medium transition active:scale-[0.98] ${
          hasAlert
            ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
            : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
        }`}
      >
        {hasAlert ? 'Remove alert' : 'Create alert'}
      </button>

      <a
        href={`/api/redirect?dealID=${encodeURIComponent(game.dealID)}&title=${encodeURIComponent(game.title)}&salePrice=${encodeURIComponent(game.salePrice)}&normalPrice=${encodeURIComponent(game.normalPrice)}`}
        target="_blank"
        className="rounded-xl bg-white px-5 py-3 text-center text-sm font-bold text-black transition active:scale-[0.98] hover:opacity-90"
      >
        Go to best deal — ${game.salePrice}
      </a>
    </div>

    {/* Screenshots preview */}
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3">
      {rawgLoading ? (
        <p className="text-sm text-zinc-400">Loading screenshots...</p>
      ) : rawgMeta?.screenshots && rawgMeta.screenshots.length > 0 ? (
        
        <div className="grid grid-cols-4 gap-3">
  {rawgMeta.screenshots.slice(0, 4).map((shot, index) => (
    <button
      key={`${shot}-${index}`}
      type="button"
      onClick={() => setSelectedScreenshot(shot)}
      className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition hover:opacity-90 active:scale-[0.98]"
    >
      <img
        src={shot}
        alt={`${game.title} screenshot ${index + 1}`}
        className="h-30 w-full object-cover"
      />
    </button>
  ))}
</div>
        
      ) : (
        <p className="text-sm text-zinc-400">
          No screenshots were found for this game.
        </p>
      )}
    </div>
  </div>
</div>

<div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
  <h2 className="text-lg font-semibold">Deal Summary</h2>

  <p className="mt-3 text-sm leading-6 text-zinc-300">
    {discount >= 85
      ? 'This game is a BRUTAL deal and clearly falls into the recommended purchase category if you were already interested.'
      : discount >= 70
      ? 'It\'s a strong and quite attractive discount. It\'s well worth considering if it was on your radar.'
      : discount >= 50
      ? 'It has a good discount, although it doesn\'t necessarily seem like a historic steal. It\'s still an interesting purchase.'
      : 'It has a discount, but doesn\'t seem like one of the strongest deals in the catalog. Worth tracking and waiting for a better drop.'}
  </p>

  <div className="mt-4 flex flex-wrap gap-2">
    <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
      Current price: ${game.salePrice}
    </span>

    <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
      Regular price: ${game.normalPrice}
    </span>

    <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
      Savings: ${savingsAmount.toFixed(2)}
    </span>
  </div>
</div>

<div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
  <h2 className="text-lg font-semibold">Game Information</h2>

  {rawgLoading ? (
    <p className="mt-3 text-sm text-zinc-400">Loading metadata...</p>
  ) : rawgMeta ? (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            Rating RAWG
          </p>
          <p className="mt-2 text-2xl font-bold text-cyan-300">
            {rawgMeta.rating ?? 'N/A'}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            Metacritic
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-300">
            {rawgMeta.metacritic ?? 'N/A'}
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            Release Date
          </p>
          <p className="mt-2 text-sm font-bold text-zinc-200">
            {rawgMeta.released || 'N/A'}
          </p>
        </div>
      </div>

      {rawgMeta.genres?.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
            Genres
          </p>
          <div className="flex flex-wrap gap-2">
            {rawgMeta.genres.map((genre) => (
              <span
                key={genre}
                className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
              >
                {genre}
              </span>
            ))}
          </div>
        </div>
      )}

      {rawgMeta.platforms?.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
            Platforms
          </p>
          <div className="flex flex-wrap gap-2">
            {rawgMeta.platforms.map((platform) => (
              <span
                key={platform}
                className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
              >
                {platform}
              </span>
            ))}
          </div>
        </div>
      )}

      {rawgMeta.description && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
            Description
          </p>
          <p className="text-sm leading-6 text-zinc-300">
            {rawgMeta.description}
          </p>
        </div>
      )}
    </>
  ) : (
    <p className="mt-3 text-sm text-zinc-400">
      No additional metadata found for this game.
    </p>
  )}
</div>


          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={async () => {
                if (!userId) return

                const res = await fetch('/api/wishlist', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    dealID: game.dealID,
                    title: game.title,
                    salePrice: game.salePrice,
                    normalPrice: game.normalPrice,
                    thumb: game.thumb,
                    userId,
                  }),
                })

                const data = await res.json()

                if (data.action === 'added') setIsInWishlist(true)
                if (data.action === 'removed') setIsInWishlist(false)
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] ${
                isInWishlist
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                  : 'border border-zinc-700 hover:bg-zinc-800'
              }`}
            >
              {isInWishlist ? 'Remove from wishlist' : 'Add to wishlist'}
            </button>

            <button
              onClick={async () => {
                if (!userId) return

                const targetPrice = prompt('Target price?')

                const res = await fetch('/api/alerts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    dealID: game.dealID,
                    title: game.title,
                    targetPrice,
                    currentPrice: game.salePrice,
                    userId,
                  }),
                })

                const data = await res.json()

                if (data.action === 'added') setHasAlert(true)
                if (data.action === 'removed') setHasAlert(false)
              }}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.98] ${
                hasAlert
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                  : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
              }`}
            >
              {hasAlert ? 'Remove alert' : 'Create alert'}
            </button>

            <a
  href={`/api/redirect?dealID=${encodeURIComponent(game.dealID)}&title=${encodeURIComponent(game.title)}&salePrice=${encodeURIComponent(game.salePrice)}&normalPrice=${encodeURIComponent(game.normalPrice)}`}
  target="_blank"
  className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-black transition active:scale-[0.98] hover:opacity-90"
>
  Go to best deal — ${game.salePrice}
</a>
          </div>
        </div>
      </section>

{selectedScreenshot && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
    onClick={() => setSelectedScreenshot(null)}
  >
    <button
      type="button"
      onClick={() => setSelectedScreenshot(null)}
      className="absolute right-6 top-6 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 transition hover:bg-zinc-800"
    >
      Close
    </button>

    <img
      src={selectedScreenshot}
      alt="Selected screenshot"
      className="max-h-[85vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    />
  </div>
)}

    </main>

    
  )
}