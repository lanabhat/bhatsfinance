/** A copy of `set` with `item` added if it was absent, removed if present — for toggling
 *  expanded/selected rows in React state: `setOpen(prev => toggled(prev, key))`. */
export function toggled<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set)
  if (next.has(item)) next.delete(item)
  else next.add(item)
  return next
}
