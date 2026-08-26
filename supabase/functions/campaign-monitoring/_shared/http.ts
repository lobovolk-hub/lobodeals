import { AdapterError } from './types.ts'

const REQUEST_TIMEOUT_MS = 15_000

export async function fetchOfficialText(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit = {}
): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetcher(url, {
      ...init,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'LoboDeals campaign monitor/1.0 (+https://lobodeals.com/about)',
        ...init.headers,
      },
    })

    if (!response.ok) {
      throw new AdapterError(
        `HTTP_${response.status}`,
        `Official source returned HTTP ${response.status}`,
        response.status === 401 || response.status === 403
      )
    }

    return await response.text()
  } catch (error) {
    if (error instanceof AdapterError) throw error

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AdapterError('SOURCE_TIMEOUT', 'Official source timed out')
    }

    throw new AdapterError(
      'SOURCE_FETCH_FAILED',
      error instanceof Error ? error.message : 'Official source fetch failed'
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchOfficialJson<T>(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const text = await fetchOfficialText(fetcher, url, {
    ...init,
    headers: { Accept: 'application/json', ...init.headers },
  })

  try {
    return JSON.parse(text) as T
  } catch {
    throw new AdapterError(
      'INVALID_OFFICIAL_RESPONSE',
      'Official source did not return valid JSON'
    )
  }
}
