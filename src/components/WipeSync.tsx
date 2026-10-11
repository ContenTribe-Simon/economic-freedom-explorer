import { useEffect } from "react";
import { isWipeSignal } from "@/lib/localData";

/** Reloads this tab when another tab wipes the app's browser data (see isWipeSignal). */
export function WipeSync() {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea === window.localStorage && isWipeSignal(e)) window.location.reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}
