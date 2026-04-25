import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_TTL_MS = 5000;

export function useToast({ ttl = DEFAULT_TTL_MS } = {}) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const toastRef = useRef(null);

  useEffect(() => { toastRef.current = toast; }, [toast]);

  // Cleanup pending timer on unmount.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const showToast = useCallback((message, undoFn) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, undoFn });
    timerRef.current = setTimeout(() => setToast(null), ttl);
  }, [ttl]);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  // Read latest toast from ref so undo always runs on the visible toast,
  // not on a stale snapshot captured at the time the user mounted.
  const undoToast = useCallback(() => {
    const current = toastRef.current;
    if (current?.undoFn) current.undoFn();
    dismissToast();
  }, [dismissToast]);

  return { toast, showToast, dismissToast, undoToast };
}
