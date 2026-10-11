/** Backlog item 1: kroner fields show Danish thousands separators and parse safely. */
import { describe, expect, it } from "vitest";
import {
  caretForDigits,
  digitsBefore,
  formatKronerInput,
  parsePastedKroner,
  parseTypedKroner,
  skipSeparatorForDeletion,
} from "../kronerInput";
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

describe("parseTypedKroner", () => {
  it.each([
    ["612.345", 612345],
    ["612345", 612345],
    ["123.4567", 1234567],
    ["", 0],
    ["0012", 12],
    ["1.2.3", 123],
  ])("%j → %s", (s, n) => {
    expect(parseTypedKroner(s)).toBe(n);
  });

  it.each(["-5000", "5-000", "12,5", "12.345 kr", "abc", "1e6", "+5"])("rejects %j instead of guessing", (s) => {
    expect(parseTypedKroner(s)).toBeNull();
  });

  it("round-trips every formatted value", () => {
    for (const n of [0, 5, 1000, 612345, 3486500, 99_999_999]) expect(parseTypedKroner(formatKronerInput(n))).toBe(n);
  });
});

describe("parsePastedKroner", () => {
  it.each([
    ["12.345", 12345],
    ["12345", 12345],
    ["12.345,67 kr", 12346],
    ["12.345,49", 12345],
    ["612.345 kr.", 612345],
    ["kr. 45.000", 45000],
    ["45.000,-", 45000],
    [" 3.486.500 DKK ", 3486500],
    ["1\u00a0234", 1234],
    ["0", 0],
  ])("%j → %s", (s, n) => {
    expect(parsePastedKroner(s)).toBe(n);
  });

  it.each(["-5000", "-12.345,67", "12345.67", "1.23", "12.34.567", "10-20", "ca. 5000", "", "kr", "12,", "1e6"])(
    "rejects %j instead of changing its magnitude",
    (s) => {
      expect(parsePastedKroner(s)).toBeNull();
    },
  );
});

describe("skipSeparatorForDeletion", () => {
  it("steps over a generated separator so Delete/Backspace remove a digit", () => {
    expect(skipSeparatorForDeletion("1.234", 1, "Delete")).toBe(2);
    expect(skipSeparatorForDeletion("1.234", 2, "Backspace")).toBe(1);
    expect(skipSeparatorForDeletion("1.234", 0, "Delete")).toBeNull();
    expect(skipSeparatorForDeletion("1.234", 3, "Backspace")).toBeNull();
    expect(skipSeparatorForDeletion("1.234", 0, "Backspace")).toBeNull();
    expect(skipSeparatorForDeletion("1.234", 5, "Delete")).toBeNull();
  });
});

describe("caret bookkeeping", () => {
  it("keeps the caret next to the same digit when a separator appears", () => {
    // User has "1234" with caret at the end and types "5": raw "12345", formatted "12.345".
    const raw = "12345";
    const formatted = formatKronerInput(parseTypedKroner(raw)!);
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
