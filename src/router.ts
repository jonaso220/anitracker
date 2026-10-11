// Rutas por hash: cada pestaña tiene una URL compartible.
//
// Se usa hash (`#/vistas`) y no la History API a propósito: la app es estática
// (Netlify + un service worker hecho a mano), el hash no necesita rewrites del
// servidor, no toca el service worker y se comporta igual en la PWA instalada.

export type TabId = 'schedule' | 'watchLater' | 'watched' | 'lists' | 'season' | 'directory';

export const DEFAULT_TAB: TabId = 'schedule';

/** Pestañas navegables, en el orden en que las muestra `NavTabs`. */
export const TAB_IDS: TabId[] = ['schedule', 'watchLater', 'watched', 'lists', 'season', 'directory'];

// Slugs estables: cambiarlos rompe los enlaces ya compartidos.
const SLUGS: Record<TabId, string> = {
  schedule: '/semana',
  watchLater: '/despues',
  watched: '/vistas',
  lists: '/listas',
  season: '/temporada',
  directory: '/directorio',
};

const BY_SLUG = new Map<string, TabId>(
  (Object.entries(SLUGS) as [TabId, string][]).map(([tab, slug]) => [slug, tab]),
);

/** Normaliza un hash (`#/Vistas`, `#vistas/`, `#/vistas?x=1`) a `/vistas`. */
const normalizeHash = (hash: string | null | undefined): string => {
  const raw = String(hash ?? '').trim().replace(/^#/, '').split('?')[0];
  if (!raw) return '';
  return `/${raw.replace(/^\/+|\/+$/g, '').toLowerCase()}`;
};

/** Pestaña de un hash. Vacío o desconocido → `DEFAULT_TAB` (nunca falla). */
export const tabFromHash = (hash: string | null | undefined): TabId =>
  BY_SLUG.get(normalizeHash(hash)) ?? DEFAULT_TAB;

/** Hash (`#/vistas`) de una pestaña. Desconocida → el de `DEFAULT_TAB`. */
export const hashForTab = (tab: string | null | undefined): string => {
  const slug = SLUGS[tab as TabId] as string | undefined;
  return `#${slug ?? SLUGS[DEFAULT_TAB]}`;
};
