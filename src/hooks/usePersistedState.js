import { useEffect, useState, useRef } from 'react';

/**
 * `useState` that mirrors its value to localStorage. Falls back to `initialValue`
 * if the key is missing or JSON parsing fails.
 */
export function usePersistedState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : (typeof initialValue === 'function' ? initialValue() : initialValue);
    } catch {
      return typeof initialValue === 'function' ? initialValue() : initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* quota exceeded or serialization error */ }
  }, [key, value]);

  // Expose a ref for callers that need stable access to the latest value inside
  // `useCallback` (e.g. for undo snapshots).
  const ref = useRef(value);
  useEffect(() => { ref.current = value; }, [value]);

  return [value, setValue, ref];
}
