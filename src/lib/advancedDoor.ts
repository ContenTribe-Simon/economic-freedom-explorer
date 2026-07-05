/**
 * The Advanced door's persisted opt-in (product structure §4: the public flow is the default
 * entry; the advanced surface is an explicit, per-device opt-in — same engine, same data).
 * Plain localStorage rather than a store: this is a routing boundary, not app state.
 */
const ADVANCED_DOOR_KEY = "frihedsmodel-advanced-door.v1";

export function isAdvancedDoorOpen(): boolean {
  try {
    return localStorage.getItem(ADVANCED_DOOR_KEY) === "open";
  } catch {
    return false;
  }
}

export function openAdvancedDoor(): void {
  try {
    localStorage.setItem(ADVANCED_DOOR_KEY, "open");
  } catch {
    // Storage unavailable (private mode): the caller's in-memory state still opens the door
    // for this session; the choice just isn't remembered.
  }
}
