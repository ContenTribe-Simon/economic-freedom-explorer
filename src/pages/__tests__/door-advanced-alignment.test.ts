/**
 * Backlog item 8 (docs/backlog-public-polish-v1.md): a person who opens the Advanced door because
 * of a feature it promises must find that feature by the same words inside. The door's public-safe
 * titles stay as they are (advanced-door-copy.test.ts); the advanced side adopts them in its nav
 * label and the page's eyebrow, keeping its own technical page titles.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DOOR_FEATURES } from "../advancedDoorCopy";

const src = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

const doorTitles = DOOR_FEATURES.map(([title]) => title);

describe("door feature titles are findable inside the advanced app", () => {
  it.each([
    ["Milepæle for uafhængighed", "Milepæle", "/fire", "pages/Fire.tsx"],
    ["Sammenlign rammevilkår", "Rammevilkår", "/countries", "pages/Countries.tsx"],
  ])("%s: nav label \"%s\" on %s and the page eyebrow", (doorTitle, navLabel, route, pageFile) => {
    expect(doorTitles).toContain(doorTitle);
    expect(src("components/AppShell.tsx")).toContain(`{ to: "${route}", label: "${navLabel}"`);
    expect(src(pageFile)).toMatch(new RegExp(`uppercase tracking-widest text-muted-foreground">${doorTitle}<`));
  });
});
