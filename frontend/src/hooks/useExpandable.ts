import { useCallback, useState } from 'react'

export function useExpandable<T extends string | number>() {
  const [expanded, setExpanded] = useState<Set<T>>(new Set())

  const toggle = useCallback((id: T) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const isExpanded = useCallback((id: T) => expanded.has(id), [expanded])

  return { isExpanded, toggle }
}
