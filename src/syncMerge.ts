// Fusión de bibliotecas para la sincronización con la nube.
//
// La biblioteca se descompone en entradas con clave estable (un anime dentro de
// un contenedor, el orden de cada contenedor, los datos de cada lista) y se
// fusiona a tres vías: `base` es la huella de lo último que este dispositivo
// supo que había en la nube; `local` y `cloud` son las dos versiones actuales.
// Así un cambio hecho en un solo lado nunca se pierde, sin depender de relojes.
import { daysOfWeek } from './constants';
import type { Anime, CustomList, Library, LibraryInput, Schedule } from './types/anime';

/** Mapa clave → hash de una biblioteca (la "base" de la fusión). */
export type LibraryHashes = Record<string, string | undefined>;

/** Qué clase de diferencia detectó `inspectCloudSnapshot`. */
export type SyncConflictKind = 'missing-base' | 'list-deletion' | 'deletion' | 'field' | 'legacy-or-entry';

/** Una diferencia entre dispositivos que necesita decisión del usuario. */
export interface SyncConflict {
  key: string;
  kind: SyncConflictKind;
  label?: string;
  field?: string;
  local: unknown;
  cloud: unknown;
}

export type SyncAction = 'apply' | 'keep' | 'merge' | 'conflict';

export interface CloudSnapshotInspection {
  action: SyncAction;
  data: LibraryInput;
  conflicts: SyncConflict[];
}

export interface InspectCloudSnapshotInput {
  base?: LibraryHashes | null;
  local: LibraryInput;
  cloud: LibraryInput;
  /** Fuerza la revisión cuando el dispositivo perdió su base (dispositivo conocido). */
  requireReview?: boolean;
}

/** Lista personalizada sin validar, tal como llega de la nube o de local. */
interface LooseList {
  id?: string | number;
  name?: string;
  items?: unknown;
}

const customListsOf = (lib: LibraryInput): LooseList[] =>
  Array.isArray(lib.customLists) ? (lib.customLists as LooseList[]) : [];

// JSON con claves ordenadas: Firestore no conserva el orden de los mapas, así
// que la misma entrada leída de la nube y de local debe dar la misma huella.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
}

// cyrb53: hash de 53 bits, suficiente para distinguir versiones de una entrada.
function cyrb53(str: string): string {
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

const hashValue = (value: unknown): string => cyrb53(stableStringify(value));
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Entradas de una lista. La fusión las trata de forma opaca: solo lee `id` y
 * las vuelve a emitir sin tocar el resto de sus campos.
 */
const animeList = (v: unknown): Anime[] =>
  Array.isArray(v) ? (v.filter((a) => isObject(a) && a.id != null) as Anime[]) : [];

/** Primera lista de orden de un mapa de entradas (o [] si no la hay). */
const orderOf = (entries: Map<string, unknown>, key: string): unknown[] => {
  const value = entries.get(key);
  return Array.isArray(value) ? value : [];
};

/** `l?.title || c?.title || l?.name || c?.name || key`, siempre string. */
const textOf = (value: unknown, field: 'title' | 'name'): string | undefined => {
  if (!isObject(value)) return undefined;
  const text = value[field];
  return typeof text === 'string' && text ? text : undefined;
};
const conflictLabel = (l: unknown, c: unknown, key: string): string =>
  textOf(l, 'title') || textOf(c, 'title') || textOf(l, 'name') || textOf(c, 'name') || key;

// Contenedores de anime: 's:<día>', 'w' (vistos), 'l' (pendientes), 'c:<lista>'.
function containersOf(lib: LibraryInput | null | undefined): [string, Anime[]][] {
  const out: [string, Anime[]][] = [];
  const schedule = isObject(lib?.schedule) ? lib.schedule : {};
  for (const [day, items] of Object.entries(schedule)) {
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
export function libraryEntries(lib: LibraryInput): Map<string, unknown> {
  const entries = new Map<string, unknown>();
  for (const [container, items] of containersOf(lib)) {
    entries.set(`o|${container}`, items.map((a) => a.id));
    for (const anime of items) entries.set(`${container}|${anime.id}`, anime);
  }
  const lists = (Array.isArray(lib?.customLists) ? lib.customLists : []).filter((l) => isObject(l) && l.id != null);
  entries.set('o|lists', lists.map((l) => l.id));
  for (const list of lists) {
    const meta: Record<string, unknown> = { ...list };
    delete meta.items;
    entries.set(`m|${list.id}`, meta);
  }
  return entries;
}

/**
 * Huella compacta de una biblioteca: { clave: hash }. Es lo que se guarda como
 * base. Las entradas que son objetos suman una huella por campo
 * (`f|clave|campo`) para poder fusionar cambios hechos en campos distintos sin
 * pedir una decisión; las bases viejas (formato v28) no las tienen y por eso la
 * frontera de la nube exige revisión antes de tocarlas.
 */
export function hashLibrary(lib: LibraryInput): LibraryHashes {
  const out: LibraryHashes = {};
  for (const [key, value] of libraryEntries(lib)) {
    out[key] = hashValue(value);
    if (isObject(value)) {
      for (const [field, data] of Object.entries(value)) {
        if (data !== undefined) out[`f|${key}|${field}`] = hashValue(data);
      }
    }
  }
  return out;
}

function sameHashes(a: LibraryHashes, b: LibraryHashes): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

// Algo más que contenedores vacíos: algún anime o alguna lista personalizada.
const hasContent = (hashes: LibraryHashes): boolean => Object.keys(hashes).some((k) => !k.startsWith('o|'));

/**
 * Fusión a tres vías. Por entrada: si solo cambió un lado gana ese lado; si
 * cambiaron campos distintos conserva ambos; en el mismo campo gana `local`.
 * El borrado de una entrada conocida gana a una edición offline: no resucita.
 */
export function mergeLibraries({ base = {}, local, cloud }: { base?: LibraryHashes | null; local: LibraryInput; cloud: LibraryInput }): Library {
  // `base` puede llegar `null` desde la inspección de la nube: se trata como vacía.
  const baseHashes: LibraryHashes = base ?? {};
  const L = libraryEntries(local);
  const C = libraryEntries(cloud);
  const merged = new Map<string, unknown>();

  for (const key of new Set([...C.keys(), ...L.keys()])) {
    const l = L.get(key);
    const c = C.get(key);
    const hl = l === undefined ? undefined : hashValue(l);
    const hc = c === undefined ? undefined : hashValue(c);
    const b = baseHashes[key];
    let value: unknown;
    if (hl === hc) value = l;
    else if (hl === b) value = c;
    else if (hc === b) value = l;
    else if (b !== undefined && (l === undefined || c === undefined)) value = undefined;
    else if (l === undefined) value = c;
    else if (c === undefined) value = l;
    else if (isObject(l) && isObject(c)) {
      const fields: Record<string, unknown> = {};
      for (const field of new Set([...Object.keys(l), ...Object.keys(c)])) {
        const before = baseHashes[`f|${key}|${field}`];
        const localHash = l[field] === undefined ? undefined : hashValue(l[field]);
        const hasFieldBase = Object.hasOwn(baseHashes, `f|${key}|id`);
        const chosen = hasFieldBase && localHash === before ? c[field] : l[field];
        if (chosen !== undefined) fields[field] = chosen;
      }
      value = fields;
    } else value = l;
    if (value !== undefined) merged.set(key, value);
  }

  return rebuildLibrary(merged, [C, L]);
}

function rebuildLibrary(merged: Map<string, unknown>, sources: Map<string, unknown>[]): Library {
  const items = new Map<string, Map<string, Anime>>();
  for (const [key, value] of merged) {
    const sep = key.indexOf('|');
    const container = key.slice(0, sep);
    if (container === 'o' || container === 'm') continue;
    let bucket = items.get(container);
    if (!bucket) { bucket = new Map<string, Anime>(); items.set(container, bucket); }
    bucket.set(key.slice(sep + 1), value as Anime);
  }

  // Orden: el fusionado primero; lo que falte, en el orden en que aparece en
  // la nube y después en local.
  // Lo que falta se inserta detrás de su vecino anterior en ese lado (ej. un
  // anime que vuelve porque una edición le ganó a un borrado), después de lo
  // agregado por el otro lado en ese mismo hueco.
  const ordered = (container: string): Anime[] => {
    const members = items.get(container) || new Map<string, Anime>();
    const out: Anime[] = [];
    const seen = new Set<string>();
    const take = (id: unknown): Anime | null => {
      const k = String(id);
      if (seen.has(k) || !members.has(k)) return null;
      seen.add(k);
      return members.get(k) ?? null;
    };
    for (const id of orderOf(merged, `o|${container}`)) {
      const item = take(id);
      if (item) out.push(item);
    }
    for (const src of sources) {
      const order = orderOf(src, `o|${container}`).map(String);
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

  const dayKeys = new Set<string>(daysOfWeek);
  for (const key of merged.keys()) {
    if (key.startsWith('o|s:')) dayKeys.add(key.slice(4));
  }
  const schedule: Schedule = {};
  for (const day of dayKeys) schedule[day] = ordered(`s:${day}`);

  const listIds: (string | number)[] = [];
  const seenLists = new Set<string>();
  for (const raw of [...orderOf(merged, 'o|lists'), ...sources.flatMap((s) => orderOf(s, 'o|lists'))]) {
    if (raw == null) continue;
    const id = raw as string | number;
    if (seenLists.has(String(id)) || !merged.has(`m|${id}`)) continue;
    seenLists.add(String(id));
    listIds.push(id);
  }
  for (const key of merged.keys()) {
    if (!key.startsWith('m|')) continue;
    const meta = merged.get(key) as { id?: string | number } | undefined;
    if (meta?.id == null) continue;
    if (!seenLists.has(String(meta.id))) { seenLists.add(String(meta.id)); listIds.push(meta.id); }
  }
  const customLists = listIds.map((id) => ({
    ...(merged.get(`m|${id}`) as Record<string, unknown> | undefined),
    items: ordered(`c:${id}`),
  })) as CustomList[];

  return { schedule, watchedList: ordered('w'), watchLater: ordered('l'), customLists };
}

export interface CloudSnapshotInput {
  base?: LibraryHashes | null;
  local: LibraryInput;
  cloud: LibraryInput;
  localRev?: string | null;
  cloudRev?: string | null;
}

export interface CloudSnapshotResolution {
  action: 'apply' | 'keep' | 'merge';
  data: LibraryInput;
}

/**
 * Decide qué hacer con un snapshot de la nube:
 * - 'apply': tomar la nube (local no tiene cambios propios).
 * - 'keep':  conservar local y subirlo (la nube no cambió desde la base).
 * - 'merge': los dos cambiaron → `data` es la fusión, que también se sube.
 * Sin base (esta cuenta nunca sincronizó en este dispositivo, p. ej. datos
 * cargados como invitado) se fusiona todo en vez de pisar un lado con otro.
 */
export function resolveCloudSnapshot({ base = {}, local, cloud, localRev, cloudRev }: CloudSnapshotInput): CloudSnapshotResolution {
  const localHashes = hashLibrary(local);
  const cloudHashes = hashLibrary(cloud);
  if (sameHashes(localHashes, cloudHashes)) return { action: 'apply', data: cloud };

  let effectiveBase: LibraryHashes | null = base;
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

// The automatic merge above is also used for rebasing edits made during a
// save. Cloud boundaries use this stricter inspection: uncertainty is shown
// to the owner instead of silently choosing one device's value.
export function inspectCloudSnapshot({ base = null, local, cloud, requireReview = false }: InspectCloudSnapshotInput): CloudSnapshotInspection {
  const L = libraryEntries(local), C = libraryEntries(cloud);
  if (sameHashes(hashLibrary(local), hashLibrary(cloud))) return { action: 'apply', data: cloud, conflicts: [] };
  if (!base && (requireReview || hasContent(hashLibrary(local)))) {
    return { action: 'conflict', data: local, conflicts: [{ key: '*', kind: 'missing-base', local, cloud }] };
  }
  if (!base) return { action: 'apply', data: cloud, conflicts: [] };
  const conflicts: SyncConflict[] = [];
  const listConflicts = new Set<string>();
  const localLists = new Map<string, LooseList>(customListsOf(local).map((list) => [String(list.id), list]));
  const cloudLists = new Map<string, LooseList>(customListsOf(cloud).map((list) => [String(list.id), list]));
  const belongsTo = (key: string, id: string): boolean =>
    key === `m|${id}` || key === `o|c:${id}` || key.startsWith(`c:${id}|`);
  for (const id of new Set([...localLists.keys(), ...cloudLists.keys()])) {
    const l = localLists.get(id), c = cloudLists.get(id);
    if (!base[`m|${id}`] || (!!l === !!c)) continue;
    const present = l ? L : C;
    const changed = [...new Set([...Object.keys(base), ...present.keys()])].some((key) => {
      if (!belongsTo(key, id)) return false;
      const value = present.get(key);
      return (value === undefined ? undefined : hashValue(value)) !== base[key];
    });
    if (changed) {
      listConflicts.add(id);
      conflicts.push({ key: `list|${id}`, kind: 'list-deletion', label: (l || c)?.name, local: l, cloud: c });
    }
  }
  for (const key of new Set([...L.keys(), ...C.keys()])) {
    // Ordering is best-effort; rebuildLibrary retains all surviving members.
    if (key.startsWith('o|')) continue;
    if ([...listConflicts].some((id) => belongsTo(key, id))) continue;
    const l = L.get(key), c = C.get(key), b = base[key];
    const hl = l === undefined ? undefined : hashValue(l), hc = c === undefined ? undefined : hashValue(c);
    if (hl === hc || hl === b || hc === b) continue;
    const container = key.slice(0, key.indexOf('|'));
    const location = container.startsWith('s:') ? `Semana · ${container.slice(2)}`
      : container.startsWith('c:') ? (localLists.get(container.slice(2)) || cloudLists.get(container.slice(2)))?.name
        : container === 'w' ? 'Vistas' : container === 'l' ? 'Después' : 'Listas';
    const label = `${conflictLabel(l, c, key)} · ${location || 'Lista'}`;
    if (l === undefined || c === undefined) {
      if (b !== undefined) conflicts.push({ key, kind: 'deletion', label, local: l, cloud: c });
    } else if (isObject(l) && isObject(c) && Object.hasOwn(base, `f|${key}|id`)) {
      for (const field of new Set([...Object.keys(l), ...Object.keys(c)])) {
        const before = base[`f|${key}|${field}`];
        const lh = l[field] === undefined ? undefined : hashValue(l[field]);
        const ch = c[field] === undefined ? undefined : hashValue(c[field]);
        if (lh !== ch && lh !== before && ch !== before) conflicts.push({ key, field, kind: 'field', label, local: l[field], cloud: c[field] });
      }
    } else conflicts.push({ key, kind: 'legacy-or-entry', label, local: l, cloud: c });
  }
  if (conflicts.length) return { action: 'conflict', data: local, conflicts };
  return { ...resolveCloudSnapshot({ base, local, cloud }), conflicts };
}

// Resolve only the conflicts displayed for these exact snapshots. All other
// fields keep the ordinary three-way merge. The caller checkpoints both sides
// and uses the reviewed cloud as the base for the next server transaction.
export function chooseSyncConflicts(input: InspectCloudSnapshotInput, choice: 'local' | 'cloud'): LibraryInput {
  if (!['local', 'cloud'].includes(choice)) throw new Error('Invalid conflict choice');
  const { conflicts } = inspectCloudSnapshot(input);
  if (conflicts.some((c) => c.key === '*')) return input[choice];
  const entries = libraryEntries(mergeLibraries({ base: input.base ?? {}, local: input.local, cloud: input.cloud }));
  for (const conflict of conflicts) {
    const value = conflict[choice];
    if (conflict.kind === 'list-deletion') {
      const id = conflict.key.slice(5);
      for (const key of entries.keys()) {
        if (key === `m|${id}` || key === `o|c:${id}` || key.startsWith(`c:${id}|`)) entries.delete(key);
      }
      if (value) {
        const source = libraryEntries({ customLists: [value] });
        for (const [key, data] of source) {
          if (key === `m|${id}` || key === `o|c:${id}` || key.startsWith(`c:${id}|`)) entries.set(key, data);
        }
      }
    } else if (conflict.field) {
      const entry: Record<string, unknown> = { ...(entries.get(conflict.key) as Record<string, unknown> | undefined) };
      if (value === undefined) delete entry[conflict.field]; else entry[conflict.field] = value;
      entries.set(conflict.key, entry);
    } else if (value === undefined) entries.delete(conflict.key);
    else entries.set(conflict.key, value);
  }
  return rebuildLibrary(entries, [libraryEntries(input.cloud), libraryEntries(input.local)]);
}
