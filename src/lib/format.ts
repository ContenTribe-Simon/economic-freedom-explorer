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
