'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type KeyboardEvent } from 'react'

const navigation = [
  { href: '/playstation', label: 'PlayStation' },
  { href: '/pc', label: 'PC' },
  { href: '/nintendo', label: 'Nintendo' },
  { href: '/xbox', label: 'Xbox' },
  { href: '/sales', label: 'Sales' },
] as const

function isCurrentRoute(pathname: string, href: string): boolean {
  if (pathname === href) return true

  return href === '/pc' && pathname.startsWith('/services/')
}

type NavigationLinksProps = {
  pathname: string
  mobile?: boolean
  onNavigate?: () => void
}

function NavigationLinks({
  pathname,
  mobile = false,
  onNavigate,
}: NavigationLinksProps) {
  return navigation.map((item) => {
    const active = isCurrentRoute(pathname, item.href)

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        className={
          mobile
            ? `flex min-h-11 items-center justify-between rounded-md px-3 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-white/[0.07] text-white'
                  : 'text-[#aaa8a4] hover:bg-white/[0.045] hover:text-white'
              }`
            : `relative inline-flex min-h-11 items-center px-3 text-sm font-semibold transition-colors ${
                active
                  ? 'text-white'
                  : 'text-[#aaa8a4] hover:text-white'
              }`
        }
      >
        <span>{item.label}</span>

        {mobile && active ? (
          <span
            className="h-1.5 w-1.5 rounded-full bg-[#c84b4b]"
            aria-hidden="true"
          />
        ) : null}

        {!mobile && active ? (
          <span
            className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#990303]"
            aria-hidden="true"
          />
        ) : null}
      </Link>
    )
  })
}

export function SiteNavigation() {
  const pathname = usePathname()
  const [menuState, setMenuState] = useState<{
    pathname: string
    open: boolean
  }>({
    pathname: '',
    open: false,
  })

  const menuOpen = menuState.pathname === pathname && menuState.open

  const closeMenu = () => {
    setMenuState({ pathname, open: false })
  }

  const toggleMenu = () => {
    setMenuState({
      pathname,
      open: !menuOpen,
    })
  }

  const handleMobileKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !menuOpen) return

    event.preventDefault()
    closeMenu()
  }

  return (
    <>
      <nav
        aria-label="Primary navigation"
        className="hidden items-stretch md:flex"
      >
        <NavigationLinks pathname={pathname} />
      </nav>

      <div
        className="relative md:hidden"
        onKeyDown={handleMobileKeyDown}
      >
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls="mobile-primary-navigation"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={toggleMenu}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-white/10 bg-white/[0.025] text-white transition-colors hover:border-white/20 hover:bg-white/[0.055]"
        >
          {menuOpen ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
            >
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
            >
              <path
                d="M5 7h14M5 12h14M5 17h14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        {menuOpen ? (
          <nav
            id="mobile-primary-navigation"
            aria-label="Mobile primary navigation"
            className="absolute right-0 top-[calc(100%+0.55rem)] z-50 w-56 rounded-lg border border-white/10 bg-[#151515] p-2 shadow-[0_20px_55px_rgba(0,0,0,0.48)]"
          >
            <NavigationLinks
              pathname={pathname}
              mobile
              onNavigate={closeMenu}
            />
          </nav>
        ) : null}
      </div>
    </>
  )
}
