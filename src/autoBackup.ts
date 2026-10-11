// Copias de seguridad automáticas en IndexedDB.
//
// Protege a quien no usa el sync con Firebase (o lo tiene roto) de perder la
// biblioteca por un accidente: un import equivocado, una fusión que salió mal o
// un estado corrupto.
//
// Va en IndexedDB y no en localStorage a propósito: ahí vive el dato vivo, la
// cuota es la misma y un respaldo grande podría dejar a la app sin poder
// guardar — justo lo que esta función quiere evitar. Además IndexedDB guarda
// objetos por structured clone, así que no hay que serializar ni comprimir.
//
// Todo es best-effort: si IndexedDB no está disponible (modo privado, cuota,
// navegador viejo) las funciones devuelven null/[] y la app sigue igual.
import { daysOfWeek } from './constants';
import type { Library, Schedule } from './types/anime';

const DB_NAME = 'anitracker-backups';
const DB_VERSION = 1;
const STORE = 'snapshots';

/** Cuántas copias se conservan (la más nueva y las anteriores). */
export const MAX_SNAPSHOTS = 3;

export interface AutoBackupCounts {
  schedule: number;
  watched: number;
  watchLater: number;
  lists: number;
}

/** Copia guardada, sin los datos (para listar sin cargar todo). */
export interface AutoBackupMeta {
  id: number;
  at: string;
  owner: string | null;
  counts: AutoBackupCounts;
}

interface SnapshotRecord extends AutoBackupMeta {
  data: Library;
}

/** Fábrica de IndexedDB (inyectable para poder testear). */
export type IdbFactoryLike = Pick<IDBFactory, 'open'>;

/** Cuenta los animes del horario (los días no guardados cuentan 0). */
export const countScheduled = (schedule: Schedule | undefined): number =>
  daysOfWeek.reduce((sum, day) => sum + (Array.isArray(schedule?.[day]) ? schedule[day].length : 0), 0);

const summaryOf = (data: Library): AutoBackupCounts => ({
  schedule: countScheduled(data.schedule),
  watched: data.watchedList?.length ?? 0,
  watchLater: data.watchLater?.length ?? 0,
  lists: data.customLists?.length ?? 0,
});

const defaultFactory = (): IdbFactoryLike | null => {
  try { return globalThis.indexedDB ?? null; } catch { return null; }
};

function openDb(factory: IdbFactoryLike): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function readAll(db: IDBDatabase): Promise<SnapshotRecord[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result ?? []) as SnapshotRecord[]);
    request.onerror = () => reject(request.error);
  });
}

/** Borra las copias más viejas dejando solo las últimas `MAX_SNAPSHOTS`. */
async function prune(db: IDBDatabase): Promise<void> {
  const all = await readAll(db); // en orden de clave = del más viejo al más nuevo
  const extra = all.slice(0, Math.max(0, all.length - MAX_SNAPSHOTS));
  if (extra.length === 0) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const record of extra) store.delete(record.id);
    tx.oncomplete = () => resolve();
    tx.onabort = () => resolve(); // best-effort: no rompemos por no poder podar
    tx.onerror = () => resolve();
  });
}

/**
 * Guarda una copia de la biblioteca y poda las viejas. Devuelve la copia
 * guardada, o `null` si no se pudo (sin IndexedDB, cuota, etc.).
 */
export async function saveAutoBackup(
  data: Library,
  owner: string | null = null,
  now: Date = new Date(),
  factory: IdbFactoryLike | null = defaultFactory(),
): Promise<AutoBackupMeta | null> {
  if (!factory) return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb(factory);
    const at = now.toISOString();
    const counts = summaryOf(data);
    const record: Omit<SnapshotRecord, 'id'> = { at, owner, counts, data };
    const id = await new Promise<number>((resolve, reject) => {
      const request = db!.transaction(STORE, 'readwrite').objectStore(STORE).add(record);
      request.onsuccess = () => resolve(Number(request.result));
      request.onerror = () => reject(request.error);
    });
    await prune(db);
    return { id, at, owner, counts };
  } catch {
    return null;
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

/** Copias guardadas, de la más nueva a la más vieja. Nunca lanza. */
export async function listAutoBackups(factory: IdbFactoryLike | null = defaultFactory()): Promise<AutoBackupMeta[]> {
  if (!factory) return [];
  let db: IDBDatabase | null = null;
  try {
    db = await openDb(factory);
    const all = await readAll(db);
    return all
      .map(({ id, at, owner, counts }) => ({ id, at, owner, counts }))
      .reverse();
  } catch {
    return [];
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

/** Biblioteca completa de una copia, o `null` si no existe o no se pudo leer. */
export async function readAutoBackup(id: number, factory: IdbFactoryLike | null = defaultFactory()): Promise<Library | null> {
  if (!factory) return null;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb(factory);
    const record = await new Promise<SnapshotRecord | undefined>((resolve, reject) => {
      const request = db!.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result as SnapshotRecord | undefined);
      request.onerror = () => reject(request.error);
    });
    return record?.data ?? null;
  } catch {
    return null;
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

/** Borra todas las copias automáticas. Nunca lanza. */
export async function clearAutoBackups(factory: IdbFactoryLike | null = defaultFactory()): Promise<void> {
  if (!factory) return;
  let db: IDBDatabase | null = null;
  try {
    db = await openDb(factory);
    await new Promise<void>((resolve, reject) => {
      const request = db!.transaction(STORE, 'readwrite').objectStore(STORE).clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch { /* best-effort */ } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}
