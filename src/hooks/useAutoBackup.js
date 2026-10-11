// Copia automática de la biblioteca en IndexedDB, como máximo una vez por día.
//
// Es una red de seguridad local para quien no usa el sync (o lo tiene roto):
// no reemplaza a descargar una copia, que es lo único que sobrevive a un
// "borrar datos del sitio".
import { useEffect, useRef } from 'react';
import { countScheduled, saveAutoBackup } from '../autoBackup';

const LAST_KEY = 'anitracker-auto-backup-at';
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function useAutoBackup({ schedule, watchedList, watchLater, customLists, owner }) {
  // Evita que dos ediciones seguidas disparen dos copias mientras la primera
  // todavía se está escribiendo (la marca del día se pone recién al terminar).
  const saving = useRef(false);

  useEffect(() => {
    if (saving.current) return;
    // El throttle es por cuenta: al cambiar de dispositivo/cuenta la copia de la
    // cuenta nueva no queda bloqueada por la que se hizo para la anterior.
    const lastKey = owner ? `${LAST_KEY}:${owner}` : LAST_KEY;
    let last = 0;
    try { last = Number(localStorage.getItem(lastKey)) || 0; } catch { /* ignore */ }
    if (Date.now() - last < MIN_INTERVAL_MS) return;

    const total = countScheduled(schedule) + watchedList.length + watchLater.length + customLists.length;
    if (total === 0) return; // nada que respaldar todavía

    saving.current = true;
    saveAutoBackup({ schedule, watchedList, watchLater, customLists }, owner ?? null)
      .then((meta) => {
        // Solo se marca el día si la copia se guardó de verdad, así un fallo de
        // IndexedDB se reintenta en la próxima edición.
        if (!meta) return;
        try { localStorage.setItem(lastKey, String(Date.now())); } catch { /* ignore */ }
      })
      .finally(() => { saving.current = false; });
  }, [schedule, watchedList, watchLater, customLists, owner]);
}
