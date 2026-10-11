import { useCallback, useEffect, useState } from 'react';
import { hashForTab, tabFromHash } from '../router';

const currentHash = () => window.location.hash;

/**
 * Ruta actual (pestaña) sincronizada con el hash de la URL.
 *
 * Devuelve `[tab, navigate]`. `navigate` cambia la pestaña y el hash; escuchar
 * `hashchange` mantiene todo en sync cuando el usuario usa atrás/adelante, pega
 * un enlace o lo abre desde la PWA instalada.
 */
export function useHashRoute() {
  const [tab, setTab] = useState(() => tabFromHash(currentHash()));

  // Canonicaliza el hash en el primer render (sin entrada de historial) para
  // que la barra de direcciones siempre tenga un enlace compartible.
  useEffect(() => {
    const canonical = hashForTab(tabFromHash(currentHash()));
    if (currentHash() !== canonical) {
      try { window.history.replaceState(null, '', canonical); } catch { /* best-effort */ }
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash(currentHash()));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next) => {
    // Se actualiza el estado ya: no dependemos de que el navegador emita
    // `hashchange` (no lo hace si el hash no cambió).
    setTab(tabFromHash(hashForTab(next)));
    const hash = hashForTab(next);
    if (currentHash() !== hash) window.location.hash = hash;
  }, []);

  return [tab, navigate];
}
