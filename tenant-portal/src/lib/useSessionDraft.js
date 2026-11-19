import { useState } from "react";

export function useSessionDraft(key, empty) {
  const [local, setLocal] = useState(null);
  const storageKey = key ? "modus-draft:" + key : null;

  function read() {
    if (!storageKey) return empty;
    try {
      const stored = sessionStorage.getItem(storageKey);
      return stored === null ? empty : JSON.parse(stored);
    } catch {
      return local?.key === storageKey ? local.value : empty;
    }
  }

  function change(update) {
    const value = typeof update === "function" ? update(read()) : update;
    if (!storageKey) return;
    try {
      if (value === empty) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Keep editing available if browser storage is disabled.
    }
    setLocal({ key: storageKey, value });
  }

  return [local?.key === storageKey ? local.value : read(), change];
}
