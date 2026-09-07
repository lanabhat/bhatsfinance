import { getJson, postJson } from './http'
import type { FundClassification, FundClassificationProposal, FundReturnsComparison, RebalancingExplanation } from '../types/domain'

// GET calls read the cached row and 404 if nothing's been generated yet — the
// pages treat that as an empty state, never as an error to surface loudly.
// POST calls are the only path that ever reaches the AI API, and only fire
// on an explicit user click — never on page load or a background refresh.

export const aiInsightsApi = {
  getClassification: (instrumentId: number): Promise<FundClassification> =>
    getJson(`/api/ai/classify-fund/${instrumentId}/`),

  classifyFund: (instrumentId: number): Promise<FundClassification> =>
    postJson(`/api/ai/classify-fund/${instrumentId}/`, {}),

  classifyAllFunds: async (householdId: number): Promise<FundClassificationProposal[]> => {
    const res = await postJson<{ proposals: FundClassificationProposal[] }>('/api/ai/classify-all-funds/', { household_id: householdId })
    return res.proposals
  },

  applyClassifications: (
    classifications: { instrument_id: number; bucket: string; rule_60_40_category: string; reasoning: string; approved: boolean }[],
  ): Promise<{ applied: number }> =>
    postJson('/api/ai/apply-classifications/', { classifications }),

  getReturnsComparison: (instrumentId: number): Promise<FundReturnsComparison> =>
    getJson(`/api/ai/compare-fund-returns/${instrumentId}/`),

  compareFundReturns: (instrumentId: number, householdId: number, asOf: string): Promise<FundReturnsComparison> =>
    postJson(`/api/ai/compare-fund-returns/${instrumentId}/`, { household_id: householdId, as_of: asOf }),

  getRebalancingExplanation: (householdId: number, asOf: string): Promise<RebalancingExplanation> => {
    const q = new URLSearchParams({ household_id: String(householdId), as_of: asOf })
    return getJson(`/api/ai/explain-rebalancing/?${q}`)
  },

  explainRebalancing: (householdId: number, asOf: string): Promise<RebalancingExplanation> =>
    postJson('/api/ai/explain-rebalancing/', { household_id: householdId, as_of: asOf }),
}
