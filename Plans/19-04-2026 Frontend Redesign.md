# Plan: Frontend UI Refactor — Tailwind + Modern Design System

## Scope (user-selected)
- Layout + all shared components fully refactored
- Pages inherit new styling; not individually rewritten
- Light mode only (no dark mode toggle)
- Basic PWA: manifest.json + viewport meta (no service worker)

## Design Tokens
- **Font**: Inter via @fontsource/inter
- **Primary**: teal-600 (#0d9488) hover teal-700
- **Background**: slate-50 page bg, white card bg
- **Sidebar**: slate-900 bg, slate-700 active item
- **Text**: slate-900 heading, slate-600 body, slate-400 muted
- **Border**: slate-200
- **Radius**: rounded-xl (cards), rounded-lg (inputs/buttons)
- **Shadow**: shadow-sm (cards), shadow-md (popovers)
- **Spacing**: 8px base (Tailwind gap-2 = 8px)
- **Touch target**: min h-11 (44px) on all buttons

---

## Phase 1 — Foundation (install + config)

### npm installs
```
tailwindcss @tailwindcss/vite @fontsource/inter clsx tailwind-merge
```
No PostCSS config needed — `@tailwindcss/vite` handles it as a Vite plugin.

### Files to create
- `tailwind.config.ts` — extend colors with `primary` (teal), `surface` (slate), set `Inter` font family
- `src/lib/cn.ts` — `clsx` + `twMerge` helper

### Files to modify
- `vite.config.ts` — add `@tailwindcss/vite` plugin
- `src/index.css` — replace with `@import "tailwindcss"` + Inter font import + CSS custom properties
- `src/App.css` — DELETE (all styles move to Tailwind classes in JSX)
- `index.html` — fix title, add PWA meta tags, add manifest link, add Inter font preconnect

### public/manifest.json (new)
```json
{
  "name": "Family Wealth Manager",
  "short_name": "WealthMgr",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#0d9488",
  "background_color": "#f8fafc",
  "icons": [{ "src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

---

## Phase 2 — Layout Redesign (`AppLayout.tsx`)

### Desktop (≥768px)
- Fixed 260px left sidebar: slate-900, logo area, grouped nav items with active highlight
- Top header: sticky white bar (h-14), page title left, controls right (household selector, date, refresh, profile btn)
- Main content: `ml-[260px]` with max-w-screen-xl, px-6 py-5

### Mobile (<768px)
- Sidebar hidden entirely
- Fixed bottom nav bar: white, border-t, 5 items (Dashboard, Expenses, Accounts, Portfolio, More)
- Top header: still shows page title + hamburger for full menu overlay
- Main content: full width, px-4 py-4

### Sidebar collapse (desktop)
- Togglable to 60px icon-only mode
- Transition: `transition-all duration-200`
- Toggle button inside sidebar footer

---

## Phase 3 — Shared Components (all in `src/components/`)

### New: `src/components/ui/` directory

**`Button.tsx`**
- variants: `primary` | `secondary` | `ghost` | `danger` | `link`
- sizes: `sm` | `md` | `lg`
- full loading state (spinner)
- min h-11 on md/lg, h-9 on sm

**`Card.tsx`**
- `bg-white rounded-xl shadow-sm border border-slate-100 p-4 md:p-6`
- optional `title` and `subtitle` props render as card header
- optional `actions` slot (top-right)

**`Skeleton.tsx`**
- Animated pulse placeholder
- Variants: `text`, `card`, `table`
- Used in pages while data loads

**`EmptyState.tsx`**
- Icon + heading + description + optional action button
- Used when list/data is empty

**`Badge.tsx`**
- Color variants mapped to categories/types (teal, amber, red, purple)

### Refactored: `src/components/common/`

**`FormField.tsx`**
- All inputs: `w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500`
- Label: `text-sm font-medium text-slate-700 mb-1`
- Error state: `border-red-300 focus:ring-red-500`
- HelpTooltip stays inline beside label

**`BaseForm.tsx`**
- Wraps in `<Card>` component
- Title uses `text-base font-semibold text-slate-900`
- Description uses `text-sm text-slate-500`

**`EntityPageLayout.tsx`**
- Responsive: `grid grid-cols-1 lg:grid-cols-2 gap-4`
- Section header uses consistent `text-xl font-bold` + muted subtitle

**`FormActions.tsx`**
- Uses new `Button` variants
- `flex gap-2 pt-2 mt-2 border-t border-slate-100`

**`DeleteButton.tsx`**
- Two-step confirm using new `Button` danger variant
- h-9 (compact for table rows)

**`HelpTooltip.tsx`**
- Rewrites CSS with Tailwind inline classes
- Deletes `HelpTooltip.css`

**`ValidationMessage.tsx`**
- Red alert box with icon

---

## Phase 4 — App.tsx / PWA

- Remove `import './App.css'`
- Add `import '@fontsource/inter'` to main.tsx or index.css
- Top-level container uses `min-h-screen bg-slate-50 text-slate-900 font-sans`
- Sidebar open state drives CSS class toggle; mobile bottom nav replaces sidebar

---

## Critical Files (in order of implementation)

1. `package.json` — npm install
2. `vite.config.ts` — add Tailwind plugin
3. `src/index.css` — Tailwind entry + font
4. `src/lib/cn.ts` — utility
5. `tailwind.config.ts` — design tokens
6. `index.html` — meta, title, manifest link
7. `public/manifest.json` — PWA manifest
8. `src/components/ui/Button.tsx`
9. `src/components/ui/Card.tsx`
10. `src/components/ui/Skeleton.tsx`
11. `src/components/ui/EmptyState.tsx`
12. `src/components/ui/Badge.tsx`
13. `src/components/layout/AppLayout.tsx` — full redesign
14. `src/components/common/FormField.tsx`
15. `src/components/common/BaseForm.tsx`
16. `src/components/common/EntityPageLayout.tsx`
17. `src/components/common/FormActions.tsx`
18. `src/components/common/DeleteButton.tsx`
19. `src/components/common/HelpTooltip.tsx`
20. `src/components/common/ValidationMessage.tsx`
21. `src/App.css` — delete
22. `src/App.tsx` — remove App.css import

## Verification
- TypeScript build passes: `npx tsc --noEmit`
- Open in browser: sidebar visible, styled cards, Inter font rendering
- Resize to 375px: bottom nav appears, sidebar hides, no horizontal scroll
- All form fields styled with Tailwind inputs
- Help tooltips still function
- Navigate to each page: cards render cleanly, no broken layout
