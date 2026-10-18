import { expect, test } from '@playwright/test'

// Every top-level route renders without a console error or an uncaught exception.
const ROUTES = [
  'home', 'holdings', 'accounts', 'allocation', 'diversification', 'fund-performance', 'expenses',
  'spend-trends', 'analytics', 'settings', 'instruments', 'ledger', 'alerts', 'tax', 'valuation',
  'insurance', 'reports', 'help', 'import', 'household', 'maintenance', 'admin', 'gmail', 'sms',
]

// GETs that answer 404 for "nothing generated yet" (AI explanations/classifications); the
// page shows a Generate button. (API review: these should become 200 with an empty body.)
const EXPECTED_404 = [/\/api\/ai\//]

for (const route of ROUTES) {
  test(`#/${route} renders cleanly`, async ({ page }) => {
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(`exception: ${e.message}`))
    page.on('console', (m) => {
      if (m.type() !== 'error') return
      if (m.text().startsWith('Failed to load resource') && EXPECTED_404.some((re) => re.test(m.location().url))) return
      problems.push(`console: ${m.text()}`)
    })
    page.on('response', (r) => {
      if (!r.url().includes('/api/') || r.status() < 400) return
      if (r.status() === 404 && EXPECTED_404.some((re) => re.test(r.url()))) return
      problems.push(`${r.status()} ${r.url()}`)
    })

    await page.goto(`/#/${route}`, { waitUntil: 'networkidle' })
    await expect(page.locator('main')).toBeVisible()
    expect(problems, problems.join('\n')).toEqual([])
  })
}

test('Import history tab renders cleanly', async ({ page }) => {
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`exception: ${e.message}`))
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) problems.push(`${r.status()} ${r.url()}`) })
  await page.goto('/#/import', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'History', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Import history' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(problems, problems.join('\n')).toEqual([])
})
