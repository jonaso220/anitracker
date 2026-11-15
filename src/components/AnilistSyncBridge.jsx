import { useEffect } from 'react';
import { useAnilistSync } from '../hooks/useAnilistSync';

/**
 * Monta `useAnilistSync` desde un chunk aparte (solo existe con
 * `VITE_ANILIST_CLIENT_ID`) y le pasa el estado a `App` para Ajustes.
 */
export default function AnilistSyncBridge({ schedule, watchLater, watchedList, ready, scope, onChange }) {
  const state = useAnilistSync({ schedule, watchLater, watchedList, ready, scope });
  useEffect(() => { onChange(state); }, [state, onChange]);
  return null;
}
