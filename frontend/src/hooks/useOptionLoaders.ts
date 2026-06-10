import { useEffect, useState } from 'react'
import { OPTION_CACHE_KEYS } from '../api/cacheKeys'
import { householdApi } from '../api/householdApi'
import { portfolioApi } from '../api/portfolioApi'
import type { InstrumentOption, OptionItem } from '../types/domain'

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

// Separate cache for rich instrument options
const instrumentFullCache = new Map<string, InstrumentOption[]>()

export function useOptionLoaders(householdId: number) {
  const [households, setHouseholds] = useState<OptionItem[]>([])
  const [members, setMembers] = useState<OptionItem[]>([])
  const [accounts, setAccounts] = useState<OptionItem[]>([])
  const [instruments, setInstruments] = useState<OptionItem[]>([])
  const [instrumentsFull, setInstrumentsFull] = useState<InstrumentOption[]>([])

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

    const cacheKey = OPTION_CACHE_KEYS.instruments(householdId)
    if (instrumentFullCache.has(cacheKey)) {
      const cached = instrumentFullCache.get(cacheKey)!
      setInstrumentsFull(cached)
      setInstruments(cached)
    } else {
      portfolioApi.listInstruments(householdId).then((data) => {
        const full: InstrumentOption[] = data.map((x) => ({
          id: x.id,
          label: x.name,
          instrument_type: x.instrument_type,
          default_account: x.default_account ?? null,
        }))
        instrumentFullCache.set(cacheKey, full)
        setInstrumentsFull(full)
        setInstruments(full)
      })
    }
  }, [householdId])

  return { households, members, accounts, instruments, instrumentsFull }
}
