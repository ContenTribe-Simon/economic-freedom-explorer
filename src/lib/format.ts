export function formatDKK(n: number, opts: { compact?: boolean; decimals?: number } = {}) {
  if (!Number.isFinite(n)) return "—";
  const { compact, decimals = 0 } = opts;
  if (compact) {
    return new Intl.NumberFormat("da-DK", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n) + " kr";
  }
  return new Intl.NumberFormat("da-DK", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n) + " kr";
}

export function formatPct(n: number, decimals = 1) {
  return (n * 100).toFixed(decimals) + " %";
}

/** Parse "4", "4%", "4,5" → 0.04 / 0.045 (decimal). Returns NaN if invalid. */
export function parsePctInput(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace("%", "").replace(",", ".").trim();
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return n / 100;
}

/** Format decimal (0.04) as "4" (string for input). */
export function decimalToPctString(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "";
  const v = n * 100;
  // Strip trailing zeros
  return parseFloat(v.toFixed(decimals)).toString();
}
