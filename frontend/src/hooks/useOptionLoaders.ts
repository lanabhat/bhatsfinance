import { useEffect, useState } from 'react'
import { OPTION_CACHE_KEYS } from '../api/cacheKeys'
import { householdApi } from '../api/householdApi'
import { portfolioApi } from '../api/portfolioApi'
import type { OptionItem } from '../types/domain'

const cache = new Map<string, OptionItem[]>()

export function invalidateOptionCache(prefix: string) {
  Array.from(cache.keys())
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => cache.delete(key))
}

async function loadAndCache(key: string, loader: () => Promise<OptionItem[]>) {
  if (cache.has(key)) return cache.get(key) || []
  const data = await loader()
  cache.set(key, data)
  return data
}

export function useOptionLoaders(householdId: number) {
  const [households, setHouseholds] = useState<OptionItem[]>([])
  const [members, setMembers] = useState<OptionItem[]>([])
  const [accounts, setAccounts] = useState<OptionItem[]>([])
  const [instruments, setInstruments] = useState<OptionItem[]>([])

  useEffect(() => {
    void loadAndCache(OPTION_CACHE_KEYS.households, async () => {
      const data = await householdApi.listHouseholds()
      return data.map((x) => ({ id: x.id, label: x.name }))
    }).then(setHouseholds)
  }, [])

  useEffect(() => {
    if (!householdId) return
    void loadAndCache(OPTION_CACHE_KEYS.members(householdId), async () => {
      const data = await householdApi.listMembers(householdId)
      return data.map((x) => ({ id: x.id, label: x.full_name }))
    }).then(setMembers)

    void loadAndCache(OPTION_CACHE_KEYS.accounts(householdId), async () => {
      const data = await portfolioApi.listAccounts(householdId)
      return data.map((x) => ({ id: x.id, label: `${x.name} (${x.account_type})` }))
    }).then(setAccounts)

    void loadAndCache(OPTION_CACHE_KEYS.instruments(householdId), async () => {
      const data = await portfolioApi.listInstruments(householdId)
      return data.map((x) => ({ id: x.id, label: `${x.name} (${x.instrument_type})` }))
    }).then(setInstruments)
  }, [householdId])

  return { households, members, accounts, instruments }
}
