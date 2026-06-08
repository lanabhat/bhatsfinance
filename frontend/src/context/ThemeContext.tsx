import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  theme: Theme
  setTheme: (t: Theme) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  isDark: false,
})

function resolveIsDark(theme: Theme): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('ui:theme')
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'system'
  })

  const [isDark, setIsDark] = useState(() => resolveIsDark(
    (localStorage.getItem('ui:theme') as Theme | null) ?? 'system'
  ))

  useEffect(() => {
    const dark = resolveIsDark(theme)
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const dark = mq.matches
      setIsDark(dark)
      document.documentElement.classList.toggle('dark', dark)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('ui:theme', t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
