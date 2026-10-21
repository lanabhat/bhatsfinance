import { useSyncExternalStore } from 'react'

/** Live match for a media query (SSR/jsdom-safe: false when matchMedia is missing). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches),
    () => false,
  )
}

/** Below the md breakpoint (768px): bottom tab bar, card-list tables, filter sheet. */
export const useIsMobile = () => useMediaQuery('(max-width: 767.98px)')
