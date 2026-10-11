/** Backlog item 1: kroner fields show Danish thousands separators and parse safely. */
import { describe, expect, it } from "vitest";
import { caretForDigits, digitsBefore, formatKronerInput, parseKronerInput } from "../kronerInput";
import { formatKr } from "../publicFormat";

describe("formatKronerInput", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1000, "1.000"],
    [612345, "612.345"],
    [3486500, "3.486.500"],
    [-5, "0"],
    [Number.NaN, "0"],
    [1234.6, "1.235"],
  ])("%s → %s", (n, s) => {
    expect(formatKronerInput(n)).toBe(s);
  });

  it("groups exactly like the result screen's formatKr", () => {
    for (const n of [0, 7, 1234, 98765, 3486500, 50_000_000]) expect(`${formatKronerInput(n)} kr`).toBe(formatKr(n));
  });
});

describe("parseKronerInput", () => {
  it.each([
    ["612.345", 612345],
    ["612345", 612345],
    ["612.345 kr", 612345],
    ["", 0],
    ["kr", 0],
    ["-5000", 5000],
    ["0012", 12],
    ["1.2.3", 123],
  ])("%j → %s", (s, n) => {
    expect(parseKronerInput(s)).toBe(n);
  });

  it("round-trips every formatted value", () => {
    for (const n of [0, 5, 1000, 612345, 3486500, 99_999_999]) expect(parseKronerInput(formatKronerInput(n))).toBe(n);
  });
});

describe("caret bookkeeping", () => {
  it("keeps the caret next to the same digit when a separator appears", () => {
    // User has "1234" with caret at the end and types "5": raw "12345", formatted "12.345".
    const raw = "12345";
    const formatted = formatKronerInput(parseKronerInput(raw));
    expect(caretForDigits(formatted, digitsBefore(raw, 5))).toBe(formatted.length);
    // Caret after the 2nd digit in "1.2345" (typed a 2 into "1.345" after the first digit).
    expect(caretForDigits("12.345", digitsBefore("1.2345", 3))).toBe(2);
  });

  it("handles the edges", () => {
    expect(caretForDigits("612.345", 0)).toBe(0);
    expect(caretForDigits("612.345", 3)).toBe(3);
    expect(caretForDigits("612.345", 4)).toBe(5);
    expect(caretForDigits("612.345", 99)).toBe(7);
    expect(digitsBefore("612.345", 4)).toBe(3);
  });
});
