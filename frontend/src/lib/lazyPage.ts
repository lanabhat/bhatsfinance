import { lazy, type ComponentType } from 'react'
/** React.lazy for a module's named component export (a page, or a heavy widget like a chart)'s named export: `lazyPage(() => import('./pages/X'), 'X')`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any props: pages differ
export function lazyPage<M extends Record<string, ComponentType<any>>>(load: () => Promise<M>, name: keyof M & string) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}
