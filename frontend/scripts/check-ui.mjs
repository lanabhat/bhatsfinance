#!/usr/bin/env node
/**
 * UI consistency check (see UI-GUIDELINES.md).
 *
 *   npm run check:ui                  report + fail on regressions
 *   npm run check:ui -- --update      re-write the baseline after cleaning files up
 *   npm run check:ui -- --verbose     list every finding
 *
 * Files in STRICT must have zero findings (the shared library and every page already
 * moved onto it). Everything else is ratcheted: a file may not get *more* findings than
 * scripts/ui-check-baseline.json records, so old screens can only get cleaner.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const BASELINE = join(ROOT, 'scripts', 'ui-check-baseline.json')

/** Must be clean. Add a page here when it moves onto PageLayout. */
const STRICT = [
  'src/components/ui/',
  'src/components/charts/ChartCard.tsx',
  'src/components/layout/',
  'src/pages/HomePage.tsx',
  'src/components/home/ActionItemsCard.tsx',
  'src/components/home/AllocationCard.tsx',
  'src/components/home/MemberCards.tsx',
  'src/components/home/PortfolioSummaryCard.tsx',
  'src/pages/HoldingsPage.tsx',
  'src/pages/AccountsPage.tsx',
  'src/pages/ExpensePage.tsx',
  'src/pages/SpendTrendsPage.tsx',
  'src/pages/AnalyticsPage.tsx',
  'src/components/holdings/HoldingDetailDrawer.tsx',
  'src/components/holdings/HoldingsCardView.tsx',
  'src/components/accounts/',
  'src/components/analytics/dashboard/FactsTable.tsx',
  'src/components/analytics/ValuationTrendChart.tsx',
  'src/components/charts/NetWorthTrendChart.tsx',
  'src/components/charts/CashFlowChart.tsx',
  'src/components/home/MarketCapSplitCard.tsx',
]
/** The library itself may use raw <button>s and fine spacing — it's what implements the rules. */
const LIBRARY = ['src/components/ui/', 'src/components/charts/ChartCard.tsx', 'src/components/layout/MemberSwitcher.tsx']

const PALETTE = '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|primary|positive|negative)'
const RULES = [
  {
    id: 'raw-color',
    msg: 'Raw palette colour — use a token utility (text-ink, bg-surface, text-success, bg-danger-subtle…)',
    re: new RegExp(`\\b(?:bg|text|border|ring|divide|outline|fill|stroke|from|to|via|shadow|accent|placeholder)-${PALETTE}-\\d{2,3}\\b`, 'g'),
  },
  {
    id: 'hex-color',
    msg: 'Hard-coded hex colour — use a CSS variable / token (or lib/palette.ts for series colours)',
    re: /(?<![\w&])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b(?![\w-])/g,
    skip: (line) => /^\s*(\/\/|\*|\/\*)/.test(line) || /href=|#\/|`#|'#\//.test(line),
  },
  {
    id: 'tiny-text',
    msg: 'Font size below 12px — the minimum is text-xs (12px)',
    re: /\btext-\[(?:[0-9]|1[01])px\]|\btext-\[0\.(?:[0-6]\d*|7[0-4]\d*)rem\]/g,
  },
  {
    id: 'all-caps',
    msg: 'ALL-CAPS label — headings are sentence case (use <SectionHeader>)',
    re: /\buppercase\b/g,
  },
  {
    id: 'emoji',
    msg: 'Emoji in UI — use a lucide icon (lib/icons.ts)',
    re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{1F000}-\u{1F2FF}]/gu,
    skip: (line) => /^\s*(\/\/|\*|\/\*)/.test(line),
  },
  {
    id: 'one-off-button',
    msg: 'Styled <button>/<a> — use <Button>, <IconButton>, <Chip> or a RowMenu action',
    re: /<(?:button|a)\b[^>]*className="[^"]*\b(?:rounded|rounded-\w+)\b[^"]*\b(?:px-\d|py-\d|h-\d)[^"]*\b(?:bg-|border)/g,
    libraryOk: true,
  },
  {
    id: 'inline-format',
    msg: 'Inline date/number formatting — use <DateText>, <Amount>, <Delta> (or lib/fmt.ts)',
    re: /\.toLocaleDateString\(|\bfmtINR\(|\.toLocaleString\('en-IN'\)/g,
    libraryOk: true,
  },
  {
    id: 'off-scale-spacing',
    msg: 'Spacing off the 4/8/12/16/24/32 scale — use steps 1, 2, 3, 4, 6, 8',
    re: /\b(?:p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(?:0\.5|1\.5|2\.5|3\.5|5|7|9|10|11|14)\b/g,
    libraryOk: true,
  },
]

const args = new Set(process.argv.slice(2))
const update = args.has('--update')
const verbose = args.has('--verbose')

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p)
  }
  return out
}

const rel = (p) => relative(ROOT, p).split(sep).join('/')
const inList = (file, list) => list.some((entry) => (entry.endsWith('/') ? file.startsWith(entry) : file === entry))

const results = {}
for (const abs of walk(SRC)) {
  const file = rel(abs)
  const isLibrary = inList(file, LIBRARY)
  const lines = readFileSync(abs, 'utf8').split('\n')
  const findings = []
  lines.forEach((line, i) => {
    if (line.includes('ui-check-ignore')) return
    for (const rule of RULES) {
      if (rule.libraryOk && isLibrary) continue
      if (rule.skip?.(line)) continue
      rule.re.lastIndex = 0
      const hits = line.match(rule.re)
      if (hits) for (const h of hits) findings.push({ rule: rule.id, line: i + 1, text: h, msg: rule.msg })
    }
  })
  results[file] = findings
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {}
let failed = false
const report = []

for (const [file, findings] of Object.entries(results)) {
  const strict = inList(file, STRICT)
  const allowed = strict ? 0 : (baseline[file] ?? 0)
  if (findings.length > allowed) {
    failed = true
    report.push(`\n✗ ${file}: ${findings.length} finding(s)${strict ? ' (strict — must be 0)' : `, baseline ${allowed}`}`)
    for (const f of findings) report.push(`    ${f.line}: [${f.rule}] ${f.text} — ${f.msg}`)
  } else if (verbose && findings.length) {
    report.push(`\n· ${file}: ${findings.length}`)
    for (const f of findings) report.push(`    ${f.line}: [${f.rule}] ${f.text}`)
  }
}

const total = Object.values(results).reduce((s, f) => s + f.length, 0)
const strictFiles = Object.keys(results).filter((f) => inList(f, STRICT))
const strictTotal = strictFiles.reduce((s, f) => s + results[f].length, 0)

if (update) {
  const next = Object.fromEntries(Object.entries(results).filter(([f, v]) => v.length && !inList(f, STRICT)).map(([f, v]) => [f, v.length]).sort())
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n')
  console.log(`Baseline written: ${Object.keys(next).length} legacy files, ${total - strictTotal} findings.`)
}

console.log(report.join('\n'))
console.log(`\nUI check: ${strictFiles.length} strict files (${strictTotal} findings), ${total - strictTotal} legacy findings across ${Object.values(results).filter((f) => f.length).length - strictFiles.filter((f) => results[f].length).length} files.`)
if (failed && !update) {
  console.log('Failed. Fix the findings above (or, for a legacy file you made cleaner, run with --update).')
  process.exit(1)
}
