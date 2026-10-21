import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useApp } from './AppContext'

type MemberScope = {
  /** null = everyone in the household. */
  memberId: number | null
  setMemberId: (id: number | null) => void
  /** Label of the selected member, or null for everyone. */
  memberName: string | null
}

const MemberScopeContext = createContext<MemberScope>({ memberId: null, setMemberId: () => {}, memberName: null })

const keyFor = (householdId: number) => `memberScope:${householdId}`

/**
 * The member chosen in the app header's MemberSwitcher. One selection for the whole app,
 * remembered per household; every page scopes its figures to it.
 */
export function MemberScopeProvider({ children }: { children: ReactNode }) {
  const { householdId, members } = useApp()
  const [state, setState] = useState<{ householdId: number; memberId: number | null }>(() => ({ householdId, memberId: read(householdId) }))

  // A different household starts from its own remembered choice.
  const memberIdRaw = state.householdId === householdId ? state.memberId : read(householdId)
  // A remembered member who's no longer in the household falls back to everyone.
  const memberId = memberIdRaw !== null && members.length > 0 && !members.some((m) => m.id === memberIdRaw) ? null : memberIdRaw

  const setMemberId = useCallback((id: number | null) => {
    setState({ householdId, memberId: id })
    try { localStorage.setItem(keyFor(householdId), id === null ? '' : String(id)) } catch { /* not persisted */ }
  }, [householdId])

  const memberName = memberId === null ? null : members.find((m) => m.id === memberId)?.label ?? null
  const value = useMemo(() => ({ memberId, setMemberId, memberName }), [memberId, setMemberId, memberName])
  return <MemberScopeContext.Provider value={value}>{children}</MemberScopeContext.Provider>
}

function read(householdId: number): number | null {
  try {
    const v = localStorage.getItem(keyFor(householdId))
    return v ? Number(v) : null
  } catch { return null }
}

export function useMemberScope() {
  return useContext(MemberScopeContext)
}
