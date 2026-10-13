import { useQuery } from '@tanstack/react-query'
import { householdApi } from '../api/householdApi'
import { portfolioApi } from '../api/portfolioApi'
import { queryKeys } from '../api/queryClient'
import type { InstrumentOption, OptionItem } from '../types/domain'

const NONE: never[] = []

/** The household's pick-lists (households, members, accounts, instruments), cached and shared. */
export function useOptionLoaders(householdId: number) {
  const enabled = householdId > 0

  const households = useQuery({
    queryKey: queryKeys.households,
    queryFn: async (): Promise<OptionItem[]> =>
      (await householdApi.listHouseholds()).map((x) => ({ id: x.id, label: x.name })),
  })
  const members = useQuery({
    queryKey: queryKeys.members(householdId),
    queryFn: async (): Promise<OptionItem[]> =>
      (await householdApi.listMembers(householdId)).map((x) => ({ id: x.id, label: x.full_name })),
    enabled,
  })
  const accounts = useQuery({
    queryKey: queryKeys.accounts(householdId),
    queryFn: async (): Promise<OptionItem[]> =>
      (await portfolioApi.listAccounts(householdId)).map((x) => ({ id: x.id, label: `${x.name} (${x.account_type})` })),
    enabled,
  })
  const instruments = useQuery({
    queryKey: queryKeys.instruments(householdId),
    queryFn: async (): Promise<InstrumentOption[]> =>
      (await portfolioApi.listInstruments(householdId)).map((x) => ({
        id: x.id, label: x.name, instrument_type: x.instrument_type, default_account: x.default_account ?? null,
      })),
    enabled,
  })

  const instrumentsFull = instruments.data ?? NONE
  return {
    households: households.data ?? NONE,
    members: members.data ?? NONE,
    accounts: accounts.data ?? NONE,
    instruments: instrumentsFull as OptionItem[],
    instrumentsFull,
  }
}
