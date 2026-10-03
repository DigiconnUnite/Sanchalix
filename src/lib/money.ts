/** Formats integer minor units (paise) as currency, e.g. 1250000 → "₹12,500". Paise show only when present. */
export const formatMoney = (minor: number, currency = 'INR', locale = 'en-IN') =>
  new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);

/** Parses rupees typed by a user ("12500" or "12500.50") into paise, or null when it isn't a valid amount. */
export function toMinor(rupees: string) {
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(rupees.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** Splits an amount by percentages that sum to 100. The last part absorbs the rounding, so the parts add up exactly. */
export function splitByPercent(amountMinor: number, percents: number[]) {
  const parts = percents.map((percent) => Math.floor((amountMinor * percent) / 100));
  const last = parts.length - 1;
  if (last >= 0) parts[last] = amountMinor - parts.slice(0, last).reduce((sum, part) => sum + part, 0);
  return parts;
}
