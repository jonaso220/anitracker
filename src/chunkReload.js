// Una pestaña abierta durante un deploy pide chunks lazy (pestañas, modales)
// con hashes que ya no existen. En vez de caer en la pantalla de error, se
// recarga una vez para traer el index nuevo. El cooldown evita un loop si el
// problema es otro (p. ej. sin conexión).
const RELOAD_KEY = 'anitracker-chunk-reload-at';
const COOLDOWN_MS = 30_000;

const CHUNK_ERROR = /dynamically imported module|Importing a module script failed|error loading dynamically imported|Unable to preload CSS/i;

export const isChunkLoadError = (error) => CHUNK_ERROR.test(String(error?.message || error || ''));

/** Recarga la página salvo que ya se haya hecho hace poco. Devuelve si recargó. */
export function reloadForNewDeploy(reload = () => window.location.reload()) {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0;
    if (Date.now() - last < COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  reload();
  return true;
}
