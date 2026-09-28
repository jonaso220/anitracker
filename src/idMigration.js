import { daysOfWeek } from './constants';

// Id interno de un anime de AniList sin id de MAL. Antes era siempre
// 300000 + id de AniList, pero AniList pasó el id 100000 y eso empezó a caer
// en el rango de TVMaze (400000 + id): dos obras distintas con el mismo id
// interno se pisaban (agregar una a Después reemplazaba a la otra). Desde el
// id 100000 van a un rango propio; los de antes no cambian, nunca chocan.
export const ANILIST_LEGACY_BASE = 300000;
export const ANILIST_LEGACY_LIMIT = 100000;
export const ANILIST_ID_BASE = 800000000;

export const anilistInternalId = (anilistId, malId) => {
  if (malId) return malId;
  return anilistId < ANILIST_LEGACY_LIMIT ? ANILIST_LEGACY_BASE + anilistId : ANILIST_ID_BASE + anilistId;
};

/**
 * Pasa al rango nuevo un anime guardado con el id viejo (identificado por su
 * sourceKey, nunca por el rango: un id 4xxxxx sin sourceKey de AniList es de
 * TVMaze). Devuelve el mismo objeto si no hay nada que cambiar. Determinista:
 * todos los dispositivos llegan al mismo id.
 */
export function migrateAnime(anime) {
  const m = /^anilist:(\d+)$/.exec(anime?.sourceKey || '');
  if (!m) return anime;
  const anilistId = Number(m[1]);
  if (anilistId < ANILIST_LEGACY_LIMIT || anime.id !== ANILIST_LEGACY_BASE + anilistId) return anime;
  return { ...anime, id: ANILIST_ID_BASE + anilistId };
}

// Después de migrar puede quedar la misma obra dos veces en una lista: un
// dispositivo sin actualizar la editó con el id viejo mientras la nube ya
// tenía el nuevo. Queda una sola, en el lugar de la primera y con el progreso
// más avanzado (la edición que se hizo después).
function dedupeById(list) {
  const index = new Map();
  const out = [];
  for (const anime of list) {
    const at = index.get(anime.id);
    if (at === undefined) {
      index.set(anime.id, out.length);
      out.push(anime);
    } else if ((anime.currentEp || 0) > (out[at].currentEp || 0)) {
      out[at] = anime;
    }
  }
  return out;
}

export function migrateList(list) {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const mapped = list.map((anime) => {
    const next = migrateAnime(anime);
    if (next !== anime) changed = true;
    return next;
  });
  return changed ? dedupeById(mapped) : list;
}

export function migrateSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return schedule;
  let changed = false;
  const next = { ...schedule };
  for (const day of daysOfWeek) {
    const list = migrateList(schedule[day]);
    if (list !== schedule[day]) { next[day] = list; changed = true; }
  }
  return changed ? next : schedule;
}

export function migrateCustomLists(lists) {
  if (!Array.isArray(lists)) return lists;
  let changed = false;
  const next = lists.map((list) => {
    const items = migrateList(list?.items);
    if (items === list?.items) return list;
    changed = true;
    return { ...list, items };
  });
  return changed ? next : lists;
}

/** Toda la biblioteca: { data, changed }; sin cambios devuelve el mismo objeto. */
export function migrateLibrary(data) {
  if (!data) return { data, changed: false };
  const next = {
    ...data,
    schedule: migrateSchedule(data.schedule),
    watchedList: migrateList(data.watchedList),
    watchLater: migrateList(data.watchLater),
    customLists: migrateCustomLists(data.customLists),
  };
  const changed = next.schedule !== data.schedule || next.watchedList !== data.watchedList
    || next.watchLater !== data.watchLater || next.customLists !== data.customLists;
  return changed ? { data: next, changed } : { data, changed };
}

// Ids ocultados en Temporada/Directorio: ahí solo hay obras de AniList, así
// que un id viejo en la zona que chocaba (≥ 400000) es de AniList sin MAL.
export function migrateDiscoveryIds(ids) {
  if (!Array.isArray(ids)) return ids;
  const isOld = (id) => id >= ANILIST_LEGACY_BASE + ANILIST_LEGACY_LIMIT && id < 1000000;
  if (!ids.some(isOld)) return ids;
  return [...new Set(ids.map((id) => (isOld(id) ? ANILIST_ID_BASE + id - ANILIST_LEGACY_BASE : id)))];
}
