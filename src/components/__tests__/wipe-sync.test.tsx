/** PR 3 (Phase 12 C/D): a wipe in one tab reloads every other open tab, so none writes stale data back. */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { WipeSync } from "../WipeSync";

const original = window.location;
afterEach(() => Object.defineProperty(window, "location", { configurable: true, value: original }));

function fire(key: string | null, newValue: string | null) {
  window.dispatchEvent(new StorageEvent("storage", { key, newValue, storageArea: window.localStorage }));
}

describe("WipeSync", () => {
  it("reloads when another tab removes the app's data, ignores ordinary writes", () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
    const { unmount } = render(<WipeSync />);
    fire("frihedsmodel-public.v1", "{}");
    fire("unrelated", null);
    expect(reload).not.toHaveBeenCalled();
    fire("frihedsmodel-public.v1", null);
    expect(reload).toHaveBeenCalledTimes(1);
    unmount();
    fire("finance-tool.v1", null);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
