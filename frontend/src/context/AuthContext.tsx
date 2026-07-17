import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type AuthUser = {
  authenticated: true
  id: number
  email: string
  name: string
  picture: string
  role: 'super_admin' | 'admin' | 'viewer'
  status: 'pending' | 'approved' | 'denied'
  household_id: number | null
}

type AuthState =
  | { authenticated: false; loading: true }
  | { authenticated: false; loading: false }
  | (AuthUser & { loading: false })

type AuthContextValue = {
  user: AuthState
  canWrite: boolean
  selectHousehold: (householdId: number) => Promise<void>
  updatePhoto: (photo: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>(null!)

function userCanWrite(user: AuthState) {
  return user.authenticated && user.status === 'approved' && (user.role === 'admin' || user.role === 'super_admin')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthState>({ authenticated: false, loading: true })

  const loadMe = async () => {
    const r = await fetch('/api/auth/me/', { credentials: 'include' })
    const data = await r.json()
    if (data.authenticated) {
      setUser({ ...data, loading: false } as AuthUser & { loading: false })
    } else {
      setUser({ authenticated: false, loading: false })
    }
  }

  useEffect(() => {
    loadMe().catch(() => setUser({ authenticated: false, loading: false }))
  }, [])

  const selectHousehold = async (householdId: number) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] ?? ''
    const r = await fetch('/api/auth/select-household/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(csrf) },
      body: JSON.stringify({ household_id: householdId }),
    })
    if (!r.ok) throw await r.json()
    // Keep state in sync even if backend returns the payload already.
    await loadMe()
  }

  const updatePhoto = async (photo: string) => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] ?? ''
    const r = await fetch('/api/auth/me/', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(csrf) },
      body: JSON.stringify({ photo }),
    })
    if (!r.ok) throw await r.json()
    await loadMe()
  }

  const logout = async () => {
    const csrf = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] ?? ''
    await fetch('/api/auth/logout/', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRFToken': decodeURIComponent(csrf) },
    })
    window.location.reload()
  }

  return (
    <AuthContext.Provider value={{ user, canWrite: userCanWrite(user), selectHousehold, updatePhoto, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
