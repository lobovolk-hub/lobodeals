const PUBLIC_ROUTES = Object.freeze(['/', '/catalog', '/deals'])

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && value.trim()))]
}
export function buildPsdealsPublicValidationPlan({
  base_url = 'https://lobodeals.com',
  detail_slugs = [],
  timeout_ms = 15000,
} = {}) {
  const base = new URL(base_url)
  if (base.protocol !== 'https:') throw new Error('PUBLIC_VALIDATION_HTTPS_REQUIRED')
  if (!Number.isSafeInteger(timeout_ms) || timeout_ms < 1000 || timeout_ms > 60000) {
    throw new Error('PUBLIC_VALIDATION_TIMEOUT_INVALID')
  }
  const slugs = uniqueStrings(detail_slugs).slice(0, 5)
  const requests = [
    ...PUBLIC_ROUTES.map((route) => ({
      role: route === '/' ? 'home' : route.slice(1),
      url: new URL(route, base).href,
      expected_status: 200,
      required_markers: route === '/deals' ? ['deals'] : [],
    })),
    ...slugs.map((slug, index) => ({
      role: `detail_${index + 1}`,
      url: new URL(`/us/playstation/${encodeURIComponent(slug)}`, base).href,
      expected_status: 200,
      required_markers: [],
    })),
  ]
  return {
    public_validation_version: 1,
    mode: 'read_only_http',
    requests,
    timeout_ms,
    max_body_bytes: 2 * 1024 * 1024,
    follows_redirects: false,
    executes_requests: false,
  }
}

export async function executePsdealsPublicValidation(plan, { fetch_page } = {}) {
  if (typeof fetch_page !== 'function') throw new Error('PUBLIC_VALIDATION_HTTP_PORT_REQUIRED')
  const results = []
  for (const request of plan.requests) {
    try {
      const response = await fetch_page({
        url: request.url,
        timeout_ms: plan.timeout_ms,
        max_body_bytes: plan.max_body_bytes,
        follows_redirects: plan.follows_redirects,
      })
      const body = typeof response?.body === 'string' ? response.body : ''
      const errors = []
      if (response?.status !== request.expected_status) errors.push('public_status_mismatch')
      if (Number(response?.body_bytes || Buffer.byteLength(body)) > plan.max_body_bytes) {
        errors.push('public_body_limit_exceeded')
      }
      for (const marker of request.required_markers) {
        if (!body.toLowerCase().includes(marker.toLowerCase())) errors.push('public_marker_missing')
      }
      results.push({ role: request.role, url: request.url, valid: errors.length === 0, errors })
    } catch (error) {
      results.push({
        role: request.role,
        url: request.url,
        valid: false,
        errors: ['public_request_failed'],
        diagnostic: error instanceof Error ? error.message : String(error),
      })
    }
  }
  const failed = results.filter((result) => !result.valid)
  return {
    valid: failed.length === 0,
    status: failed.length === 0 ? 'succeeded' : 'failed',
    attempted: results.length,
    succeeded: results.length - failed.length,
    failed: failed.length,
    results,
    external_action_performed: false,
    read_only_requests_performed: true,
  }
}
