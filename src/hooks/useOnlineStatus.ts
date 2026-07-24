import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  globalThis.addEventListener("online", callback);
  globalThis.addEventListener("offline", callback);
  return () => {
    globalThis.removeEventListener("online", callback);
    globalThis.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
