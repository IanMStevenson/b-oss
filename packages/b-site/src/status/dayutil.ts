/** The UTC calendar day ('YYYY-MM-DD') of an epoch-ms timestamp. */
export const dayOf = (ts: number): string => new Date(ts).toISOString().slice(0, 10);
