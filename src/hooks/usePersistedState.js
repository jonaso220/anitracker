import { useEffect, useState, useRef } from 'react';

/**
 * `useState` that mirrors its value to localStorage. Falls back to `initialValue`
 * if the key is missing or JSON parsing fails.
 *
 * Stays in sync across tabs: when another tab writes the same key, the new
 * value is parsed (and migrated, like the initial read) into this tab's state,
 * so a stale tab doesn't overwrite it on its next edit. Values equal to what is
 * already stored are never written back, which keeps tabs from ping-ponging
 * `storage` events at each other.
 */
export function usePersistedState(key, initialValue, restoredValue, migrate) {
  const [value, setValue] = useState(() => {
    if (restoredValue !== undefined) return restoredValue;
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        const parsed = JSON.parse(raw);
        return migrate ? migrate(parsed) : parsed;
      }
      return typeof initialValue === 'function' ? initialValue() : initialValue;
    } catch (error) {
      queueMicrotask(() => window.dispatchEvent(new CustomEvent('anitracker-storage-error', { detail: { key, error, retry: null } })));
      return typeof initialValue === 'function' ? initialValue() : initialValue;
    }
  });

  useEffect(() => {
    const persist = () => {
      try {
        const json = JSON.stringify(value);
        // Each write fires `storage` in every other tab: skip it when the
        // stored value is already this one (e.g. we just received it).
        if (localStorage.getItem(key) !== json) localStorage.setItem(key, json);
        window.dispatchEvent(new CustomEvent('anitracker-storage-restored', { detail: { key } }));
        return true;
      } catch (error) {
        window.dispatchEvent(new CustomEvent('anitracker-storage-error', { detail: { key, error, retry: persist } }));
        return false;
      }
    };
    persist();
  }, [key, value]);

  // Expose a ref for callers that need stable access to the latest value inside
  // `useCallback` (e.g. for undo snapshots).
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);

  // Latest `migrate` without resubscribing when the caller passes a new function.
  const migrateRef = useRef(migrate);
  useEffect(() => { migrateRef.current = migrate; }, [migrate]);

  useEffect(() => {
    const onStorage = (event) => {
      // `key === null` is a `clear()` and a null `newValue` a removal: keep the
      // in-memory value (it is written back on the next edit) instead of
      // wiping this tab's data.
      if (event.key !== key || event.newValue == null) return;
      try {
        if (event.storageArea && event.storageArea !== localStorage) return;
      } catch { return; }
      let next;
      try {
        if (event.newValue === JSON.stringify(ref.current)) return;
        const parsed = JSON.parse(event.newValue);
        next = migrateRef.current ? migrateRef.current(parsed) : parsed;
      } catch (error) {
        console.error(`Ignoring unreadable value for "${key}" from another tab:`, error);
        return;
      }
      ref.current = next;
      setValue(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  return [value, setValue, ref];
}
