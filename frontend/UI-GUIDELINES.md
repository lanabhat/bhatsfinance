# UI guidelines

Every page is built from the same layout and the same shared components, so the app reads as one
product. If a page needs something new, add it to `src/components/ui/` first, then use it.
`npm run check:ui` enforces the mechanical parts (see [Checks](#checks)).

## The page pattern

```tsx
<PageLayout
  title="Investments"                       // the only title — the app bar hides its own
  primaryAction={{ label: 'Add holding', onClick }}   // at most one primary button per page
  moreActions={[{ label: 'Export CSV', href, download }, …]}  // everything else: "More" menu
  summary={<>{2–4 <StatCard>s}</>}
  notices={<Notice tone="warning" title="…" action={…} />}
  toolbar={<FilterBar … />}
>
  {/* <Card>s and/or a <DataTable> */}
</PageLayout>
```

Order is fixed: **header → summary strip → notices → toolbar → content**, 24px apart (`gap-6`).
Pages that only show data (Trends, Analytics) may omit the primary action.

**MemberSwitcher** lives in the app header. Read the selection with `useMemberScope()` and
scope the page's figures to it (Home and Investments use the member's share, Accounts shows
accounts they own, Transactions passes them as the member filter). It is remembered per household.

## Components (`src/components/ui/`)

| Need | Use | Notes |
|---|---|---|
| Page shell | `PageLayout`, `PageHeader` | |
| Summary figure | `StatCard` in the strip | label above, value, optional `delta`/`subtitle` |
| Section title | `SectionHeader` (+ `SectionLink` for "View all →") | **sentence case**, never ALL CAPS |
| Surface | `Card` | fixed padding 16/24, `flush` for edge-to-edge tables; never tinted |
| Page-level message | `Notice` | neutral surface + semantic icon, not a yellow/red box |
| Toolbar | `FilterBar` | search → filter dropdowns → extras (date/amount range) → Group by / View / Sort; active filters as removable chips with "Clear all"; a bottom sheet on phones |
| Selects in the toolbar | `ToolbarSelect` | "Group by ▾", "View ▾", "Sort ▾", "Range ▾" |
| Date / amount filters | `DateRangePicker`, `AmountRangeInput` | add their `extraChips` to the FilterBar |
| List / table | `DataTable` | see below |
| Row actions | `RowMenu` (DataTable `rowActions`) | order is always **View → Edit → domain actions → Delete** |
| Detail view | `DetailDrawer` | right panel on desktop, full screen on phones: header (name, owner, amount) → facts → history → actions |
| Card view | `EntityCard` | same anatomy as a phone table row |
| Clickable card | `ClickHint` (+ `relative group/click` on the card) | small pointer icon top-right; `StatCard` adds it when it has `onClick` |
| Buttons | `Button` (`primary` / `secondary` / `ghost`; `destructive` only in menus and dialogs), `IconButton` | heights come from `--control-h` |
| Filters / toggles | `Chip` | outline; filled (accent-subtle) when selected |
| Status / tags | `Badge` | `neutral`, `accent`, `success`, `warning`, `danger`, `info`; always with words |
| Tabs, range tabs | `Tabs` (= `SegmentedControl`) | |
| Form fields | `Field` + `Input` / `Select` | label above, same height as buttons |
| Money | `Amount` | `format="full"` in tables (₹12,34,567), `"compact"` in summaries (₹1.2 Cr); `signed` + `tone="gain"` for gains, `debit`/`credit` for flows |
| Change | `Delta` | sign + arrow + colour; `invert` where up is bad (spend) |
| Date | `DateText` | 18 Oct 2026 · `short` 18 Oct · `month` Oct 2026 |
| Person | `MemberAvatar` | "A, B" shows the first + "+1" |
| Type icon | `EntityIcon kind="asset" \| "account" \| "spend"` | the one icon map (`lib/icons.ts`, lucide) |
| Chart | `ChartCard` + `useChartTheme()` axis props + `ChartTooltip` | legend under the plot, range tabs 1M · 3M · 6M · 1Y · All |
| States | `EmptyState`, `ErrorState`, `Skeleton` | on every card and table |
| Undo | `useUndoable()` | destructive actions: hide now, Undo toast, commit after 5s |
| Drill-through link | `holdingsLink()` / `accountsLink()` (`lib/deepLinks.ts`) | `#/holdings?type=FD&owner=…&open=inv:12` — values are the filter labels; the page replaces its filters with them (shown as chips) and `open` opens that row's DetailDrawer |

Never format inline (`toLocaleDateString`, `fmtINR(...)` in JSX, `'₹' + n`): go through
`Amount` / `Delta` / `DateText`, or `lib/fmt.ts` for text-only contexts (chart ticks, CSV).

### DataTable

- Numbers are `align: 'right'` (tabular numerals are automatic).
- `groupBy` with `aggregate` gives group rows with count + subtotals; `sticky: true` pins them (dates).
  Use `hideWhenGroupedBy` to drop the column you're grouping by.
- `subRows` nests rows (a fund held in several folios); `onRowClick` opens the `DetailDrawer`.
- `sort` makes sorting server-side; `footer` is the sticky count + total.
- `mobile: 'title' | 'subtitle' | 'value' | 'meta' | 'hide'` decides the phone card layout
  (title + subtitle left, value + meta right). Rows swipe left for their actions.
- Put `<DensityToggle />` in the FilterBar controls; the setting is shared by every table.
- Don't draw filled bars behind numbers. `dataBar` draws a thin underline at most; flag outliers
  with a Badge (Investments: gains over 1,000% → "Check cost basis").

## Tokens (`src/index.css`)

- **Colour:** use the semantic utilities — `bg-canvas`, `bg-surface(-2/-3)`, `border-line(-strong)`,
  `text-ink`, `text-ink-2`, `text-ink-muted`, `bg-accent`, `text-accent`, `bg-accent-subtle`,
  `text-success|warning|danger|info` and their `-subtle` backgrounds. One accent (blue). No raw
  Tailwind palette colours (`text-rose-600`, `bg-amber-50`) and no hex in components.
- **Series colours:** `lib/palette.ts` maps asset types (8 families), spend categories, money
  flows and cash-flow buckets to the eight validated `--series-*` slots. Colour follows the entity,
  never its rank; there is no ninth hue — extras fold into "other" (grey). User-defined asset
  categories keep their own stored colour.
- **Type:** 14px body, 12px (`text-xs`) minimum, one family (Inter) with tabular numerals for figures.
  Text tokens meet 4.5:1 on `surface` and `surface-2` in both themes.
- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32 px = steps `1 2 3 4 6 8`. Page padding, section gaps and
  card padding come only from these.
- **Radius:** `--radius-sm` 6, `-md` 8 (controls), `-lg` 12 (cards), `-xl` 16 (dialogs).
- **Controls:** `--control-h` 44px on phones (touch target), 36px on desktop.

## Privacy mode

`Amount` renders a fixed-width bar when amounts are hidden, so columns keep their alignment.
Text contexts use `MASKED_TEXT` (`useMaskedFmt()`); chart value axes are masked by
`useChartTheme().yAxisINR`; `ChartTooltip` masks itself.

## Phones (< 768px)

Bottom tab bar (Home, Investments, Accounts, Transactions, More); tables become card lists;
the FilterBar collapses to search + a "Filters" sheet; menus open as bottom sheets; details open
full screen. Respect safe areas (`pt-safe`, `pb-safe`).

## Checks

`npm run check:ui` scans `src/**/*.tsx` for raw palette/hex colours, text under 12px, ALL-CAPS
labels, emoji, styled one-off `<button>`/`<a>`s, inline date/number formatting and off-scale
spacing.

- Files listed in `STRICT` (the library, the app chrome and every page moved onto the pattern) must
  have zero findings. Add a page there when you migrate it.
- Every other file is ratcheted against `scripts/ui-check-baseline.json`: it may not get worse.
  After cleaning a legacy file, run `npm run check:ui -- --update`.
- A genuine exception gets `ui-check-ignore` and a reason on the same line.

## Review checklist (per page)

- [ ] `PageLayout` with one title, ≤ 1 primary action, secondary actions in More
- [ ] Summary strip of 2–4 `StatCard`s
- [ ] One `FilterBar`, controls in the standard order, active filters as chips + Clear all
- [ ] Content in `Card`s / `DataTable`; numbers right-aligned; no tinted cards
- [ ] Row actions in `RowMenu`, View → Edit → actions → Delete; delete confirms and can be undone
- [ ] Row click opens a `DetailDrawer`
- [ ] `Amount` / `Delta` / `DateText` / `MemberAvatar` / `EntityIcon` everywhere — no inline formatting
- [ ] Empty, loading and error states on every card and table
- [ ] Works at 375px: card list, Filters sheet, 44px targets, nothing scrolls sideways
- [ ] Privacy mode keeps the layout; dark mode reads correctly
- [ ] `npm run check:ui`, `npm run lint`, `npm test`, `npm run build` pass
