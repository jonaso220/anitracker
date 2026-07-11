import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let lastExternalFocus = typeof document !== 'undefined' ? document.activeElement : null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (event) => {
    if (!event.target?.closest?.('.modal-overlay')) lastExternalFocus = event.target;
  });
}

/** Focus trap, Escape handling, background inertness and focus restoration. */
export function useAccessibleDialog(onClose) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const root = dialogRef.current;
    const active = document.activeElement;
    const previous = root?.contains(active) ? lastExternalFocus : active;
    const app = document.querySelector('.anime-tracker');
    const siblings = app ? [...app.children].filter((node) => !node.contains(root) && !node.classList.contains('modal-overlay')) : [];
    siblings.forEach((node) => node.setAttribute('inert', ''));

    const focusables = () => [...(root?.querySelectorAll(FOCUSABLE) || [])];
    requestAnimationFrame(() => {
      const autoFocus = root?.querySelector('[autofocus]');
      (autoFocus || focusables()[0] || root)?.focus?.();
    });

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      siblings.forEach((node) => node.removeAttribute('inert'));
      previous?.focus?.();
    };
  }, [onClose]);

  return dialogRef;
}
