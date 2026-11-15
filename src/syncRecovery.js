const keyFor = uid => `anitracker-sync-recovery:${uid}`;

/** Cuántos puntos de recuperación se conservan por cuenta (el nuevo incluido). */
export const MAX_RECOVERY_CHECKPOINTS = 3;

// Un historial ilegible (JSON roto o algo que no es un array) no puede bloquear
// la sincronización para siempre: se reemplaza por uno nuevo. Quien lo quiera
// conservar tiene `exportSyncRecovery`, que lo exporta tal cual.
function readHistory(key) {
  try {
    const records = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

// Cada checkpoint lleva la biblioteca entera tres veces (base, local, nube):
// con unos cientos de animes pesa ~1 MB, así que acumularlos sin límite agota
// la cuota de localStorage y deja la sincronización trabada. Se conservan los
// últimos MAX_RECOVERY_CHECKPOINTS; si aun así no entra, se descartan los
// viejos de a uno hasta dejar solo el nuevo. Solo si ni el nuevo entra se lanza
// el error, y quien llama bloquea la elección (el usuario puede exportar).
export function checkpointSync(uid, input) {
  const key = keyFor(uid);
  const records = readHistory(key);
  const payload = JSON.stringify(input);
  if (records.at(-1)?.payload === payload) return;
  const entry = { at: new Date().toISOString(), payload };
  const previous = records.slice(-(MAX_RECOVERY_CHECKPOINTS - 1));
  let lastError;
  for (let keep = previous.length; keep >= 0; keep -= 1) {
    try {
      localStorage.setItem(key, JSON.stringify([...previous.slice(previous.length - keep), entry]));
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function exportSyncRecovery(uid, current) {
  // Exporta el historial tal cual está guardado, aunque sea ilegible.
  return JSON.stringify({ app: 'anitracker-sync-recovery', version: 1, owner: uid,
    exportedAt: new Date().toISOString(), current,
    recoveryHistory: localStorage.getItem(keyFor(uid)),
  }, null, 2);
}
