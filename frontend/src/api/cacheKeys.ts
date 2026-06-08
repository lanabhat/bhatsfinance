export const OPTION_CACHE_KEYS = {
  households: 'households',
  members: (householdId: number) => `members:${householdId}`,
  accounts: (householdId: number) => `accounts:${householdId}`,
  instruments: (householdId: number) => `instruments:${householdId}`,
}
