/**
 * Privacy page and local wipe in a real browser (Phase 12 C/D, PR 3): reachable from the public
 * footer, and "Slet alle mine data i denne browser" really clears the app's localStorage keys
 * (and only those) after an in-page confirmation, then confirms it on the reloaded page.
 */
import { test, expect } from "@playwright/test";

test("footer link opens the privacy page", async ({ page }) => {
  await page.goto("/start");
  await page.getByRole("navigation", { name: "Om siden" }).getByRole("link", { name: "Privatliv" }).click();
  await expect(page).toHaveURL(/\/privatliv$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sådan behandler vi dine oplysninger" })).toBeVisible();
  await expect(page.getByText("CVR 44349124")).toBeVisible();
});

test("wipe clears the app's browser data after confirmation", async ({ page }) => {
  await page.goto("/start");
  await page.evaluate(() => {
    localStorage.setItem("frihedsmodel-public.v1", JSON.stringify({ state: { inputs: { currentAge: 51 }, saved: [] }, version: 0 }));
    localStorage.setItem("frihedsmodel-advanced-door.v1", "open");
    localStorage.setItem("someone-else", "keep");
  });

  await page.goto("/privatliv");
  await page.getByRole("button", { name: "Slet alle mine data i denne browser" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Slet" }).click();

  await expect(page.getByRole("status")).toHaveText("Dine data i denne browser er slettet.");
  const left = await page.evaluate(() => ({
    door: localStorage.getItem("frihedsmodel-advanced-door.v1"),
    other: localStorage.getItem("someone-else"),
    publicInputs: localStorage.getItem("frihedsmodel-public.v1"),
  }));
  expect(left.door).toBeNull();
  expect(left.other).toBe("keep");
  // The public store may re-persist its defaults after the reload; the user's 51 must be gone.
  expect(left.publicInputs ?? "").not.toContain("\"currentAge\":51");
});
