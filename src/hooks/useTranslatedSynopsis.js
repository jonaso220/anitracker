import { useEffect, useState } from 'react';
import { translateEnToEs } from '../services/translationService';
import { pruneTranslationCache } from '../constants';
import { looksSpanish } from '../utils';

// Cola global con concurrencia limitada: la vista lista monta ~30 filas de
// golpe y disparar 30 traducciones en paralelo hace que los providers
// gratuitos devuelvan 429.
const MAX_CONCURRENT = 3;
let active = 0;
const queue = [];

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    if (job.cancelled) continue;
    active++;
    job.run().finally(() => { active--; pump(); });
  }
}

function enqueue(run) {
  const job = { run, cancelled: false };
  queue.push(job);
  pump();
  return () => { job.cancelled = true; };
}

// Sinopsis resuelta sin red: ya está en español, o hay traducción cacheada
// (mismo cache `anitracker-tr-<id>` que usa el modal de detalle). `null`
// significa "hay que traducir".
function resolveInitial(anime) {
  const syn = anime?.synopsis || '';
  if (!syn || syn.length < 10) return syn;
  if (looksSpanish(syn)) return syn;
  try {
    const cached = localStorage.getItem(`anitracker-tr-${anime.id}`);
    if (cached) return cached;
  } catch { /* empty */ }
  return null;
}

/**
 * Sinopsis en español para una card/fila. Mientras la traducción está en
 * vuelo se muestra el texto original; al resolver se cachea en localStorage,
 * así el modal de detalle (y la próxima visita) abren ya traducidos.
 *
 * Asume que el componente se monta con `key={anime.id}` (el anime de una
 * instancia no cambia), como hacen las grillas del Directorio.
 */
export function useTranslatedSynopsis(anime) {
  const [text, setText] = useState(() => resolveInitial(anime));

  useEffect(() => {
    if (text != null) return undefined;
    const syn = anime?.synopsis || '';
    const ctrl = new AbortController();
    const cancel = enqueue(async () => {
      if (ctrl.signal.aborted) return;
      const tr = await translateEnToEs(syn, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (tr) {
        setText(tr);
        try {
          localStorage.setItem(`anitracker-tr-${anime.id}`, tr);
          pruneTranslationCache();
        } catch { /* empty */ }
      } else {
        setText(syn); // sin traducción disponible: dejar el original
      }
    });
    return () => { cancel(); ctrl.abort(); };
  }, [anime, text]);

  return text ?? anime?.synopsis ?? '';
}
