import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type PageChrome = { hasPageHeader: boolean; setHasPageHeader: (v: boolean) => void }

const PageChromeContext = createContext<PageChrome>({ hasPageHeader: false, setHasPageHeader: () => {} })

/** Lets a page's <PageHeader> tell the app bar not to repeat the page title. */
export function PageChromeProvider({ children }: { children: ReactNode }) {
  const [hasPageHeader, setHasPageHeader] = useState(false)
  return <PageChromeContext.Provider value={{ hasPageHeader, setHasPageHeader }}>{children}</PageChromeContext.Provider>
}

export function usePageChrome() {
  return useContext(PageChromeContext)
}

/** Called by PageHeader: registers while mounted. */
export function useRegisterPageHeader() {
  const { setHasPageHeader } = useContext(PageChromeContext)
  useEffect(() => {
    setHasPageHeader(true)
    return () => setHasPageHeader(false)
  }, [setHasPageHeader])
}
