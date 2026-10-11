/** Backlog item 1: amount fields group thousands while typing, and the caret stays put. */
import { test, expect } from "@playwright/test";

test("typing into a kroner field shows Danish thousands separators and keeps the caret", async ({ page }) => {
  await page.goto("/simple-inputs");
  const income = page.getByLabel("Årlig indkomst før skat", { exact: true });
  await income.click();
  await income.press("ControlOrMeta+a");
  await income.pressSequentially("123456");
  await expect(income).toHaveValue("123.456");

  // Put the caret right after "12" and type a 9: the number regroups, the caret stays after the 9.
  await income.evaluate((el: HTMLInputElement) => el.setSelectionRange(2, 2));
  await income.pressSequentially("9");
  await expect(income).toHaveValue("1.293.456");
  const caret = await income.evaluate((el: HTMLInputElement) => [el.selectionStart, el.value.slice(0, el.selectionStart ?? 0)]);
  expect(caret[1]).toBe("1.29");

  // Deleting the digit before the caret regroups back and keeps the caret next to the same digit.
  await income.press("Backspace");
  await expect(income).toHaveValue("123.456");
  expect(await income.evaluate((el: HTMLInputElement) => el.value.slice(0, el.selectionStart ?? 0))).toBe("12");
});
