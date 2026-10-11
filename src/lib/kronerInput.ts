/**
 * Kroner input fields with Danish thousands separators (backlog item 1, public polish).
 *
 * A native <input type="number"> cannot show "612.345", so the public amount fields are text
 * inputs with a numeric keyboard. These pure helpers do the formatting, the parsing and the caret
 * bookkeeping. Parsing never guesses: anything that is not a plain whole-kroner amount is rejected
 * (null) so the field keeps its previous value, rather than silently changing the magnitude.
 */

/** 612345 → "612.345"; 0 → "0". Whole kroner, same grouping as formatKr. */
export function formatKronerInput(n: number): string {
  return Math.max(0, Math.round(Number.isFinite(n) ? n : 0)).toLocaleString("da-DK");
}

/**
 * A keystroke edit of the formatted field. Only digits and the field's own grouping dots are
 * allowed (the dots may sit anywhere mid-edit, e.g. "123.4567" after typing a digit). A minus
 * sign, a comma, letters or anything else rejects the edit. "" (cleared field) reads as 0.
 */
export function parseTypedKroner(raw: string): number | null {
  if (!/^[\d.]*$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits ? Number(digits) : 0;
}

/**
 * A pasted amount in Danish notation: "12.345", "12345", "12.345,67", "12.345 kr", "kr. 12.345".
 * Decimals are rounded to whole kroner. Negative numbers, English decimals ("12345.67"), ranges or
 * free text are rejected (null) instead of being glued into a different number.
 */
export function parsePastedKroner(text: string): number | null {
  const s = text
    .replace(/[\s\u00a0]/g, "")
    .replace(/^(kr\.?|dkk)/i, "")
    .replace(/(kr\.?|dkk|,-)$/i, "");
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(",");
  return Math.round(Number(`${whole.replace(/\./g, "")}.${frac || "0"}`));
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

/**
 * Where to put the caret before a Delete/Backspace so it removes a digit rather than a generated
 * separator (which formatting would immediately reinsert, trapping the caret). Returns null when
 * no adjustment is needed.
 */
export function skipSeparatorForDeletion(value: string, caret: number, key: "Delete" | "Backspace"): number | null {
  if (key === "Delete" && value[caret] === ".") return caret + 1;
  if (key === "Backspace" && caret > 0 && value[caret - 1] === ".") return caret - 1;
  return null;
}
