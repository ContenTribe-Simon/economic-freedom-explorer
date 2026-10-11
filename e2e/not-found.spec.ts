/** Unknown URLs land on the Danish 404 on the public side of the door, with a working way back. */
import { test, expect } from "@playwright/test";

test("unknown URL shows the Danish 404 and leads back to the start", async ({ page }) => {
  await page.goto("/findes-ikke-her");
  await expect(page.getByRole("heading", { level: 1, name: "Den side kan vi ikke finde." })).toBeVisible();
  await expect(page.getByText("Oops")).toHaveCount(0);
  await page.getByRole("main").getByRole("link", { name: /Til forsiden/ }).click();
  await expect(page).toHaveURL(/\/start$/);
});
