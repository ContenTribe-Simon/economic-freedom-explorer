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

test("Delete and Backspace step over a separator instead of getting stuck on it", async ({ page }) => {
  await page.goto("/simple-inputs");
  const income = page.getByLabel("Årlig indkomst før skat", { exact: true });
  const before = () => income.evaluate((el: HTMLInputElement) => el.value.slice(0, el.selectionStart ?? 0));
  await income.click();
  await income.press("ControlOrMeta+a");
  await income.pressSequentially("1234567");
  await expect(income).toHaveValue("1.234.567");

  // Caret right before the first dot: Delete removes the 2 behind it.
  await income.evaluate((el: HTMLInputElement) => el.setSelectionRange(1, 1));
  await income.press("Delete");
  await expect(income).toHaveValue("134.567");
  expect(await before()).toBe("1");

  // Caret right after the dot in "134.567": Backspace removes the 4 in front of it.
  await income.evaluate((el: HTMLInputElement) => el.setSelectionRange(4, 4));
  await income.press("Backspace");
  await expect(income).toHaveValue("13.567");
  expect(await before()).toBe("13");
});

test("a minus sign is rejected and a pasted Danish amount is rounded, not glued together", async ({ page }) => {
  await page.goto("/simple-inputs");
  const income = page.getByLabel("Årlig indkomst før skat", { exact: true });
  await income.click();
  await income.press("ControlOrMeta+a");
  await income.pressSequentially("400000");
  await expect(income).toHaveValue("400.000");

  await income.press("Home");
  await income.press("Minus");
  await expect(income).toHaveValue("400.000");

  const paste = (text: string) =>
    income.evaluate((el: HTMLInputElement, t: string) => {
      const data = new DataTransfer();
      data.setData("text/plain", t);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }, text);
  await income.press("ControlOrMeta+a");
  await paste("12.345,67 kr");
  await expect(income).toHaveValue("12.346");
  await paste("-5000");
  await expect(income).toHaveValue("12.346");
});
