import { NextResponse, type NextRequest } from 'next/server'
import { localeFromPath } from './lib/locale'
import { englishPath, isPublicPath } from './lib/localized-routes'
import { LANGUAGE_COOKIE, LANGUAGE_MAX_AGE, resolveLanguage, shouldNegotiate } from './lib/language-preference'

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const headers = new Headers(request.headers)
  // Overwrite any caller-supplied value, including for unknown Spanish routes/404s.
  headers.set('x-lobodeals-locale', localeFromPath(pathname))
  // Reject invalid profiles before Next streams the dynamic segment's error shell.
  // This is an internal rewrite to an unmatched 404, never a public redirect or alias.
  if (/^\/services\/[^/]+$/.test(englishPath(pathname)) && !isPublicPath(pathname)) {
    const notFound = request.nextUrl.clone()
    notFound.pathname = localeFromPath(pathname) === 'es' ? '/es/404' : '/404'
    notFound.search = ''
    return NextResponse.rewrite(notFound, { status: 404, request: { headers } })
  }
  const decision = isPublicPath(pathname) && shouldNegotiate(request.method, request.headers, request.nextUrl.search)
    ? resolveLanguage(pathname, request.cookies.get(LANGUAGE_COOKIE)?.value, request.headers.get('accept-language'))
    : null
  const destination = request.nextUrl.clone()
  if (decision) destination.pathname = decision.pathname
  const response = decision && destination.pathname !== pathname
    ? NextResponse.redirect(destination, 307)
    : NextResponse.next({ request: { headers } })
  if (decision) {
    response.cookies.set(LANGUAGE_COOKIE, decision.locale, {
      path: '/', maxAge: LANGUAGE_MAX_AGE, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:',
    })
    response.headers.set('Cache-Control', 'private, no-store')
  }
  return response
}

export const config = {
  matcher: ['/((?!api(?:/|$)|_next(?:/|$)|sitemap\\.xml$|robots\\.txt$|favicon\\.ico$|icon\\.png$|apple-icon\\.png$|og(?:/|$)|platforms(?:/|$)).*)'],
}
