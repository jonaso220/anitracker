import { daysOfWeek } from './constants';

const ACTIVE_KEY = 'anitracker-account-state';
const accountKey = (uid) => `anitracker-account:${uid}`;
const syncBaseKey = (uid) => `anitracker-sync-base:${uid}`;
export const LOCAL_REV_KEY = 'anitracker-local-rev';

export const emptyLibrary = () => ({
  schedule: Object.fromEntries(daysOfWeek.map((day) => [day, []])),
  watchedList: [], watchLater: [], customLists: [],
});

function readState(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value?.data || !value.data.schedule || !Array.isArray(value.data.watchedList)
    || !Array.isArray(value.data.watchLater) || !Array.isArray(value.data.customLists)) {
    throw new Error('La copia local de la cuenta no es válida.');
  }
  return value;
}

// Read one atomic snapshot on startup; legacy keys remain available for migration.
export function readActiveLibrary() {
  try { return readState(ACTIVE_KEY); } catch { return null; }
}

export function persistAccountLibrary(owner, data, rev) {
  if (owner) localStorage.setItem(ACTIVE_KEY, JSON.stringify({ owner, data, rev }));
}

export function selectLibraryAccount(uid, owner, data, rev) {
  let next = { owner: uid, data, rev };
  if (owner && owner !== uid) {
    // Save the outgoing library before replacing anything. Storage failures
    // abort the switch, so unsynced edits cannot be silently discarded.
    localStorage.setItem(accountKey(owner), JSON.stringify({ owner, data, rev }));
    next = readState(accountKey(uid)) || { owner: uid, data: emptyLibrary(), rev: null };
  }
  persistAccountLibrary(uid, next.data, next.rev);
  return next;
}

// Huella de lo último que este dispositivo supo que había en la nube para una
// cuenta (ver syncMerge.js). Sin base, la cuenta nunca sincronizó acá.
export function readSyncBase(uid) {
  try {
    const raw = localStorage.getItem(syncBaseKey(uid));
    const value = raw ? JSON.parse(raw) : null;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

export function writeSyncBase(uid, hashes) {
  try {
    localStorage.setItem(syncBaseKey(uid), JSON.stringify(hashes));
  } catch {
    // Una base vieja haría pasar cambios de la nube por locales: mejor ninguna.
    try { localStorage.removeItem(syncBaseKey(uid)); } catch { /* best-effort */ }
  }
}
