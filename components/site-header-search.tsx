'use client'

import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

export function SiteHeaderSearch() {
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
      className="hidden min-w-[280px] max-w-[520px] flex-1 items-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 lg:flex"
    >
      <span className="pl-4 pr-2 text-zinc-500" aria-hidden="true">
        ⌕
      </span>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        type="search"
        placeholder="Search PlayStation games..."
        className="min-w-0 flex-1 bg-transparent py-3 text-sm font-semibold text-white outline-none placeholder:text-zinc-600"
        aria-label="Search PlayStation games"
      />

      <button
        type="submit"
        className="shrink-0 bg-[#990303] px-5 py-3 text-sm font-black text-white transition hover:bg-red-700"
      >
        Search
      </button>
    </form>
  )
}