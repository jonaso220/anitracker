import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let lastExternalFocus = typeof document !== 'undefined' ? document.activeElement : null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (event) => {
    if (!event.target?.closest?.('.modal-overlay')) lastExternalFocus = event.target;
  });
}

// Open dialogs, bottom to top. Some stack (search → day picker, detail → move
// day): only the topmost one handles Escape and traps Tab.
const openDialogs = [];

// While any dialog is open the rest of the app is inert and the page doesn't
// scroll (on iOS it otherwise scrolls along with a bottom sheet). Computed
// from the whole stack so closing a stacked dialog doesn't re-enable the app
// under the one still open.
let savedOverflow = '';
function syncBackground() {
  const open = openDialogs.length > 0;
  const app = document.querySelector('.anime-tracker');
  for (const node of app ? [...app.children] : []) {
    const hostsDialog = node.classList.contains('modal-overlay') || openDialogs.some((d) => d.root && node.contains(d.root));
    if (open && !hostsDialog) {
      if (!node.hasAttribute('inert')) { node.setAttribute('inert', ''); node.dataset.dialogInert = ''; }
    } else if ('dialogInert' in node.dataset) {
      node.removeAttribute('inert');
      delete node.dataset.dialogInert;
    }
  }
  if (open && document.body.dataset.dialogLock === undefined) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.dataset.dialogLock = '';
  } else if (!open && document.body.dataset.dialogLock !== undefined) {
    document.body.style.overflow = savedOverflow;
    delete document.body.dataset.dialogLock;
  }
}

/** Focus trap, Escape handling, background inertness, scroll lock and focus restoration. */
export function useAccessibleDialog(onClose) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const root = dialogRef.current;
    const token = { root };
    openDialogs.push(token);
    syncBackground();
    const active = document.activeElement;
    const previous = root?.contains(active) ? lastExternalFocus : active;

    const focusables = () => [...(root?.querySelectorAll(FOCUSABLE) || [])];
    requestAnimationFrame(() => {
      if (root?.contains(document.activeElement)) return;
      const autoFocus = root?.querySelector('[autofocus]');
      (autoFocus || focusables()[0] || root)?.focus?.();
    });

    const onKeyDown = (event) => {
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!root.contains(document.activeElement)) {
        event.preventDefault(); first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openDialogs.splice(openDialogs.indexOf(token), 1);
      syncBackground();
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  return dialogRef;
}
