/** The list of SMS the user is reviewing, carried from the Messages page to the
 *  full-page review (#/sms/<id>) so Previous/Next and "approve & next" follow
 *  the same order. Lives in sessionStorage: survives a reload, not a new tab. */
const KEY = 'sms:review-queue'

export function setReviewQueue(ids: number[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* storage unavailable */ }
}

export function getReviewQueue(): number[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'number') : []
  } catch {
    return []
  }
}

/** Drop a handled message and return the id to show next (the one after it, else before it). */
export function removeFromReviewQueue(id: number): number | null {
  const queue = getReviewQueue()
  const idx = queue.indexOf(id)
  const rest = queue.filter((n) => n !== id)
  setReviewQueue(rest)
  if (rest.length === 0) return null
  return rest[Math.min(Math.max(idx, 0), rest.length - 1)]
}

export function openReview(id: number, queue?: number[]) {
  if (queue) setReviewQueue(queue)
  window.location.hash = `/sms/${id}`
}
