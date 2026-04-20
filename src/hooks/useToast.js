import { useCallback, useRef, useState } from 'react';

const DEFAULT_TTL_MS = 5000;

export function useToast({ ttl = DEFAULT_TTL_MS } = {}) {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message, undoFn) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, undoFn });
    timerRef.current = setTimeout(() => setToast(null), ttl);
  }, [ttl]);

  const dismissToast = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const undoToast = useCallback(() => {
    if (toast?.undoFn) toast.undoFn();
    dismissToast();
  }, [toast, dismissToast]);

  return { toast, showToast, dismissToast, undoToast };
}
