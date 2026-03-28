import { supabase } from '@/lib/supabaseClient'

export type CacheRecord<T = unknown> = {
  cache_key: string
  payload: T
  updated_at: string
}

export async function getCachedPayload<T = unknown>(cacheKey: string) {
  const { data, error } = await supabase
    .from('deals_cache')
    .select('cache_key, payload, updated_at')
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (error || !data) return null

  return data as CacheRecord<T>
}

export async function setCachedPayload<T = unknown>(
  cacheKey: string,
  payload: T
) {
  const { error } = await supabase.from('deals_cache').upsert(
    {
      cache_key: cacheKey,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'cache_key' }
  )

  if (error) {
    throw error
  }
}

export function isCacheFresh(updatedAt: string, maxAgeMs: number) {
  const age = Date.now() - new Date(updatedAt).getTime()
  return age <= maxAgeMs
}