import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

/** `value`, updated only after it has stopped changing for `ms`. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

/**
 * Run an import as a dry run (applied and rolled back on the server) to show what it
 * would change. Re-runs half a second after the inputs (`key`) stop changing.
 */
export function useChangePreview<T>(key: unknown, enabled: boolean, run: () => Promise<T>) {
  const settledKey = useDebouncedValue(JSON.stringify(key), 500)
  return useQuery({
    queryKey: ['import-preview', settledKey],
    queryFn: run,
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })
}
