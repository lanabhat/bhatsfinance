import { useCallback } from 'react'
import { useToast } from '../components/ui/Toast'
import { normalizeApiError } from './errorUtils'

/**
 * A `.catch` handler that tells the user what failed, instead of silently leaving a
 * list empty or a save unsaved: `.catch(errorToast('Couldn’t load accounts'))` shows
 * "Couldn’t load accounts: <server message>". Aborted requests stay quiet. Stable, so
 * it's safe in effect dependencies.
 */
export function useErrorToast() {
  const toast = useToast()
  return useCallback((what: string) => (e: unknown) => {
    if (e instanceof DOMException && e.name === 'AbortError') return
    toast.error(`${what}: ${normalizeApiError(e)}`)
  }, [toast])
}
