/** Content review (Phase 12 C/D): the 404 is plain Danish in the public design, with one way back. */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import NotFound from "../NotFound";
import { containsForbiddenTerm } from "@/lib/finance/public/safety";

describe("NotFound", () => {
  it("speaks Danish, leads back to the start and follows the copy rules", () => {
    render(
      <MemoryRouter initialEntries={["/findes-ikke"]}>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Den side kan vi ikke finde." })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Til forsiden/ }).getAttribute("href")).toBe("/start");
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/oops|page not found|return to home/i);
    expect(text).not.toContain("—");
    expect(containsForbiddenTerm(text)).toBe(false);
    expect(screen.getByRole("navigation", { name: "Om siden" })).toBeTruthy();
  });
});
