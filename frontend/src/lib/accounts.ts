/** Account types that are money owed rather than held: shown negative with a "Liability" badge. */
export const isLiability = (type: string) => type === 'credit_card' || type === 'loan'
