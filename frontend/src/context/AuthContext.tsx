import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getJson, patchJson, postJson } from '../api/http'

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
    const data = await getJson<{ authenticated: boolean } & Partial<AuthUser>>('/api/auth/me/')
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
    await postJson('/api/auth/select-household/', { household_id: householdId })
    // Keep state in sync even if backend returns the payload already.
    await loadMe()
  }

  const updatePhoto = async (photo: string) => {
    await patchJson('/api/auth/me/', { photo })
    await loadMe()
  }

  const logout = async () => {
    try {
      await postJson('/api/auth/logout/', {})
    } finally {
      window.location.reload()
    }
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
