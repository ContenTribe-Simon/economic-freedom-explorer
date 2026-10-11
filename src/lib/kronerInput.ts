/**
 * Kroner input fields with Danish thousands separators (backlog item 1, public polish).
 *
 * A native <input type="number"> cannot show "612.345", so the public amount fields are text
 * inputs with a numeric keyboard. These pure helpers do the formatting, the parsing (digits only:
 * a minus sign, letters or a pasted "kr" are ignored, so an amount can never go negative) and the
 * caret bookkeeping that keeps the cursor next to the same digit when separators appear or vanish.
 */

/** 612345 → "612.345"; 0 → "0". Whole kroner, same grouping as formatKr. */
export function formatKronerInput(n: number): string {
  return Math.max(0, Math.round(Number.isFinite(n) ? n : 0)).toLocaleString("da-DK");
}

/** "612.345 kr" → 612345; "" or no digits → 0. Never negative, never NaN. */
export function parseKronerInput(text: string): number {
  const digits = text.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? Number(digits) : 0;
}

/** How many digits sit left of `caret` in `text`. */
export function digitsBefore(text: string, caret: number): number {
  return text.slice(0, Math.max(0, caret)).replace(/\D/g, "").length;
}

/** The caret position in `formatted` that has exactly `digits` digits to its left. */
export function caretForDigits(formatted: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) seen++;
    if (seen === digits) return i + 1;
  }
  return formatted.length;
}
