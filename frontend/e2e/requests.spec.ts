import { expect, test } from '@playwright/test'

// Request budget for Home, and the cache doing its job: going to another page and
// back must not refetch the dashboard.
test('Home request count, and no refetch when coming back', async ({ page }) => {
  const api: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/')) api.push(new URL(r.url()).pathname) })

  await page.goto('/#/home', { waitUntil: 'networkidle' })
  const firstLoad = api.length
  console.log(`Home first load: ${firstLoad} API requests\n  ${[...api].sort().join('\n  ')}`)

  await page.goto('/#/holdings', { waitUntil: 'networkidle' })
  api.length = 0
  await page.goto('/#/home', { waitUntil: 'networkidle' })
  console.log(`Back to Home: ${api.length} API requests ${api.join(', ')}`)

  // 29 today (dashboard alone is 11 calls + one per member); the backend API review should fold
  // these into a few aggregate endpoints, then lower this budget.
  expect(firstLoad).toBeLessThanOrEqual(30)
  expect(api.filter((p) => p.startsWith('/api/networth') || p.startsWith('/api/allocation'))).toEqual([])
})
