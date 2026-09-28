// Fusión de bibliotecas para la sincronización con la nube.
//
// La biblioteca se descompone en entradas con clave estable (un anime dentro de
// un contenedor, el orden de cada contenedor, los datos de cada lista) y se
// fusiona a tres vías: `base` es la huella de lo último que este dispositivo
// supo que había en la nube; `local` y `cloud` son las dos versiones actuales.
// Así un cambio hecho en un solo lado nunca se pierde, sin depender de relojes.
import { daysOfWeek } from './constants';

const MAIN_PREFIXES = ['s:', 'w', 'l'];

// JSON con claves ordenadas: Firestore no conserva el orden de los mapas, así
// que la misma entrada leída de la nube y de local debe dar la misma huella.
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

// cyrb53: hash de 53 bits, suficiente para distinguir versiones de una entrada.
function cyrb53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const hashValue = (value) => cyrb53(stableStringify(value));
const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const animeList = (v) => (Array.isArray(v) ? v.filter((a) => isObject(a) && a.id != null) : []);

// Contenedores de anime: 's:<día>', 'w' (vistos), 'l' (pendientes), 'c:<lista>'.
function containersOf(lib) {
  const out = [];
  for (const [day, items] of Object.entries(isObject(lib?.schedule) ? lib.schedule : {})) {
    out.push([`s:${day}`, animeList(items)]);
  }
  out.push(['w', animeList(lib?.watchedList)]);
  out.push(['l', animeList(lib?.watchLater)]);
  for (const list of Array.isArray(lib?.customLists) ? lib.customLists : []) {
    if (isObject(list) && list.id != null) out.push([`c:${list.id}`, animeList(list.items)]);
  }
  return out;
}

/** Map clave → valor de todas las entradas de una biblioteca. */
export function libraryEntries(lib) {
  const entries = new Map();
  for (const [container, items] of containersOf(lib)) {
    entries.set(`o|${container}`, items.map((a) => a.id));
    for (const anime of items) entries.set(`${container}|${anime.id}`, anime);
  }
  const lists = (Array.isArray(lib?.customLists) ? lib.customLists : []).filter((l) => isObject(l) && l.id != null);
  entries.set('o|lists', lists.map((l) => l.id));
  for (const list of lists) {
    const meta = { ...list };
    delete meta.items;
    entries.set(`m|${list.id}`, meta);
  }
  return entries;
}

/** Huella compacta de una biblioteca: { clave: hash }. Es lo que se guarda como base. */
export function hashLibrary(lib) {
  const out = {};
  for (const [key, value] of libraryEntries(lib)) out[key] = hashValue(value);
  return out;
}

function sameHashes(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

// Algo más que contenedores vacíos: algún anime o alguna lista personalizada.
const hasContent = (hashes) => Object.keys(hashes).some((k) => !k.startsWith('o|'));

/**
 * Fusión a tres vías. Por entrada: si solo cambió un lado gana ese lado; si
 * cambiaron los dos gana `local` (el dispositivo en uso), y una modificación
 * gana a un borrado (salvo que el anime se haya movido a otro lugar).
 */
export function mergeLibraries({ base = {}, local, cloud }) {
  const L = libraryEntries(local);
  const C = libraryEntries(cloud);
  const merged = new Map();
  const resurrected = new Set();

  for (const key of new Set([...C.keys(), ...L.keys()])) {
    const l = L.get(key);
    const c = C.get(key);
    const hl = l === undefined ? undefined : hashValue(l);
    const hc = c === undefined ? undefined : hashValue(c);
    const b = base[key];
    let value;
    if (hl === hc) value = l;
    else if (hl === b) value = c;
    else if (hc === b) value = l;
    else if (l === undefined) { value = c; resurrected.add(key); }
    else if (c === undefined) { value = l; resurrected.add(key); }
    else value = l;
    if (value !== undefined) merged.set(key, value);
  }

  // Un anime borrado en un lado y editado en el otro vuelve, salvo que ese
  // mismo borrado haya sido un movimiento (ej. de Lunes a Vistos).
  const isMain = (container) => MAIN_PREFIXES.some((p) => (p.endsWith(':') ? container.startsWith(p) : container === p));
  const mainHomes = new Map();
  for (const key of merged.keys()) {
    const [container, id] = key.split('|');
    if (container === 'o' || container === 'm' || !isMain(container) || resurrected.has(key)) continue;
    mainHomes.set(id, true);
  }
  for (const key of resurrected) {
    const [container, id] = key.split('|');
    if (container !== 'o' && container !== 'm' && isMain(container) && mainHomes.has(id)) merged.delete(key);
  }

  return rebuildLibrary(merged, [C, L]);
}

function rebuildLibrary(merged, sources) {
  const items = new Map(); // contenedor → Map(id → anime)
  for (const [key, value] of merged) {
    const sep = key.indexOf('|');
    const container = key.slice(0, sep);
    if (container === 'o' || container === 'm') continue;
    if (!items.has(container)) items.set(container, new Map());
    items.get(container).set(key.slice(sep + 1), value);
  }

  // Orden: el fusionado primero; lo que falte, en el orden en que aparece en
  // la nube y después en local.
  // Lo que falta se inserta detrás de su vecino anterior en ese lado (ej. un
  // anime que vuelve porque una edición le ganó a un borrado), después de lo
  // agregado por el otro lado en ese mismo hueco.
  const ordered = (container) => {
    const members = items.get(container) || new Map();
    const out = [];
    const seen = new Set();
    const take = (id) => {
      const k = String(id);
      if (seen.has(k) || !members.has(k)) return null;
      seen.add(k);
      return members.get(k);
    };
    for (const id of merged.get(`o|${container}`) || []) {
      const item = take(id);
      if (item) out.push(item);
    }
    for (const src of sources) {
      const order = (src.get(`o|${container}`) || []).map(String);
      const inSource = new Set(order);
      order.forEach((id, i) => {
        const item = take(id);
        if (!item) return;
        const prev = order.slice(0, i).reverse().find((p) => seen.has(p));
        let at = prev === undefined ? -1 : out.findIndex((x) => String(x.id) === prev);
        while (at + 1 < out.length && !inSource.has(String(out[at + 1].id))) at += 1;
        out.splice(at + 1, 0, item);
      });
    }
    members.forEach((_, k) => { const item = take(k); if (item) out.push(item); });
    return out;
  };

  const dayKeys = new Set(daysOfWeek);
  for (const key of merged.keys()) {
    if (key.startsWith('o|s:')) dayKeys.add(key.slice(4));
  }
  const schedule = {};
  for (const day of dayKeys) schedule[day] = ordered(`s:${day}`);

  const listIds = [];
  const seenLists = new Set();
  for (const id of [...(merged.get('o|lists') || []), ...sources.flatMap((s) => s.get('o|lists') || [])]) {
    if (seenLists.has(String(id)) || !merged.has(`m|${id}`)) continue;
    seenLists.add(String(id));
    listIds.push(id);
  }
  for (const key of merged.keys()) {
    if (!key.startsWith('m|')) continue;
    const meta = merged.get(key);
    if (!seenLists.has(String(meta.id))) { seenLists.add(String(meta.id)); listIds.push(meta.id); }
  }
  const customLists = listIds.map((id) => ({ ...merged.get(`m|${id}`), items: ordered(`c:${id}`) }));

  return { schedule, watchedList: ordered('w'), watchLater: ordered('l'), customLists };
}

/**
 * Decide qué hacer con un snapshot de la nube:
 * - 'apply': tomar la nube (local no tiene cambios propios).
 * - 'keep':  conservar local y subirlo (la nube no cambió desde la base).
 * - 'merge': los dos cambiaron → `data` es la fusión, que también se sube.
 * Sin base (esta cuenta nunca sincronizó en este dispositivo, p. ej. datos
 * cargados como invitado) se fusiona todo en vez de pisar un lado con otro.
 */
export function resolveCloudSnapshot({ base, local, cloud, localRev, cloudRev }) {
  const localHashes = hashLibrary(local);
  const cloudHashes = hashLibrary(cloud);
  if (sameHashes(localHashes, cloudHashes)) return { action: 'apply', data: cloud };

  let effectiveBase = base;
  if (!effectiveBase) {
    if (!hasContent(localHashes)) return { action: 'apply', data: cloud };
    // Legado: dispositivos que sincronizaban antes de guardar la base. Si no
    // hubo ediciones locales después del último guardado en la nube, gana ella.
    if (localRev && cloudRev && localRev <= cloudRev) return { action: 'apply', data: cloud };
    effectiveBase = {};
  }
  if (sameHashes(localHashes, effectiveBase)) return { action: 'apply', data: cloud };
  if (sameHashes(cloudHashes, effectiveBase)) return { action: 'keep', data: local };
  return { action: 'merge', data: mergeLibraries({ base: effectiveBase, local, cloud }) };
}
