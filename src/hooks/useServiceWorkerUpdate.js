import { useEffect, useState, useCallback, useRef } from 'react';

// Detect when a new service worker has installed in the background and is
// waiting to take over. Surfaces it so the UI can prompt the user to reload.
//
// Flow:
//   1. New SW installs → state becomes "installed" while the old one is still
//      controlling the page → we set updateAvailable = true.
//   2. User clicks the banner → applyUpdate() posts SKIP_WAITING.
//   3. New SW activates and claims clients → controllerchange fires → reload.
export function useServiceWorkerUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let registration = null;
    let intervalId = null;
    let refreshing = false;

    const promote = (worker) => {
      waitingWorkerRef.current = worker;
      setUpdateAvailable(true);
    };

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && registration) {
        registration.update().catch(() => {});
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisibility);

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      registration = reg;

      // Already waiting from a previous tab/session
      if (reg.waiting && navigator.serviceWorker.controller) {
        promote(reg.waiting);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // Only show the banner when there's already a controlling SW —
          // first-install on a fresh visit shouldn't trigger it.
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            promote(newWorker);
          }
        });
      });

      // Periodic background check while the tab stays open
      intervalId = setInterval(() => { reg.update().catch(() => {}); }, 30 * 60 * 1000);
    }).catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisibility);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    const worker = waitingWorkerRef.current;
    if (worker) {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  }, []);

  return { updateAvailable, applyUpdate };
}
