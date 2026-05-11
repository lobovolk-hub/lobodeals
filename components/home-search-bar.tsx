'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

type HomeSearchBarProps = {
  totalLabel?: string
}

export function HomeSearchBar({ totalLabel }: HomeSearchBarProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuery = query.trim()

    if (!trimmedQuery) {
      router.push('/catalog?tab=all&letter=ALL&sort=title')
      return
    }

    const params = new URLSearchParams({
      tab: 'all',
      letter: 'ALL',
      sort: 'title',
      q: trimmedQuery,
    })

    router.push(`/catalog?${params.toString()}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-3 rounded-3xl border border-zinc-800 bg-zinc-900 p-3 shadow-2xl md:flex-row md:items-center"
    >
      <div className="flex min-h-12 flex-1 items-center rounded-2xl border border-zinc-800 bg-black px-4">
        <span className="mr-3 text-lg text-zinc-500" aria-hidden="true">
          ⌕
        </span>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-zinc-600"
          placeholder="Search PlayStation games..."
          aria-label="Search PlayStation games"
        />

        {totalLabel ? (
          <span className="ml-3 hidden shrink-0 text-xs font-bold text-zinc-500 sm:inline">
            {totalLabel}
          </span>
        ) : null}
      </div>

      <button
        type="submit"
        className="h-12 rounded-2xl bg-[#990303] px-6 text-sm font-black text-white transition hover:bg-red-700 md:w-auto"
      >
        Search
      </button>
    </form>
  )
}