// Regresiones de useCloudSync: documentos de un protocolo más nuevo, el evento
// `online` con un listener sano, la cuota llena al re-suscribirse y el costo de
// serializar la biblioteca en cada render.
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useFirebase } from '../hooks/useFirebase';
import { serializeData } from '../hooks/firebaseClient';
import { SYNC_PROTOCOL } from '../cloudSync';

const h = vi.hoisted(() => ({
  docs: new Map(),
  authCb: null,
  snapshotCb: null,
  snapshotError: null,
  setDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: null,
}));

vi.mock('../hooks/firebaseClient', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, serializeData: vi.fn(actual.serializeData) };
});

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  setPersistence: vi.fn(() => Promise.resolve()),
  browserLocalPersistence: {},
  signInWithPopup: vi.fn(() => Promise.resolve()),
  signInWithRedirect: vi.fn(() => Promise.resolve()),
  getRedirectResult: vi.fn(() => Promise.resolve({ user: null })),
  GoogleAuthProvider: vi.fn(function GoogleAuthProvider() {}),
  signOut: vi.fn(() => Promise.resolve()),
  onAuthStateChanged: vi.fn((auth, cb) => { h.authCb = cb; return () => {}; }),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((db, collection, uid) => ({ uid })),
  runTransaction: vi.fn(async (_db, update) => {
    let write;
    const result = await update({
      get: async (ref) => h.docs.get(ref.uid) || { exists: () => false },
      set: (...args) => { write = args; },
    });
    if (write) {
      await h.setDoc(...write);
      h.docs.set(write[0].uid, { exists: () => true, data: () => write[1] });
    }
    return result;
  }),
  onSnapshot: vi.fn((ref, _options, next, error) => {
    h.snapshotError = error;
    h.snapshotCb = (snap) => { if (!snap.metadata.hasPendingWrites) h.docs.set(ref.uid, snap); next(snap); };
    return () => {};
  }),
  serverTimestamp: vi.fn(() => 'ts'),
  deleteField: vi.fn(() => '__delete__'),
  Bytes: { fromUint8Array: (bytes) => ({ toUint8Array: () => bytes }) },
}));

beforeAll(async () => {
  await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
});

function useHarness() {
  const [schedule, setSchedule] = useState({});
  const [watchedList, setWatchedList] = useState([]);
  const [watchLater, setWatchLater] = useState([]);
  const [customLists, setCustomLists] = useState([]);
  const fb = useFirebase(
    schedule, watchedList, watchLater, customLists,
    setSchedule, setWatchedList, setWatchLater, setCustomLists,
  );
  return { schedule, watchedList, watchLater, customLists, setWatchedList, ...fb };
}

const cloudSnap = (data) => ({ metadata: { hasPendingWrites: false }, exists: () => true, data: () => data });

async function waitUntil(cond) {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await act(async () => { await vi.advanceTimersByTimeAsync(5); });
  }
  throw new Error('waitUntil: condition never met');
}
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

async function loginAndSubscribe() {
  const rendered = renderHook(() => useHarness());
  await waitUntil(() => typeof h.authCb === 'function');
  await act(async () => { h.authCb({ uid: 'u1' }); });
  await waitUntil(() => typeof h.snapshotCb === 'function');
  return rendered;
}

beforeEach(() => {
  vi.useFakeTimers();
  h.authCb = null; h.snapshotCb = null; h.snapshotError = null; h.docs.clear();
  h.setDoc.mockReset(); h.setDoc.mockResolvedValue();
  localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('documents written with a newer sync protocol', () => {
  it('are not applied: sync pauses with update-required and nothing is uploaded', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = await loginAndSubscribe();
    await act(async () => h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }], syncProtocol: SYNC_PROTOCOL, syncRevision: 1 })));
    const base = localStorage.getItem('anitracker-sync-base:u1');

    // Fields this version does not know would read as "everything deleted".
    await act(async () => h.snapshotCb(cloudSnap({ libraryV9: 'opaque', syncProtocol: SYNC_PROTOCOL + 1, syncRevision: 2 })));
    expect(result.current.watchedList).toEqual([{ id: 1 }]);
    expect(result.current.syncStatus).toBe('update-required');
    expect(result.current.syncError).toBe(true);
    expect(localStorage.getItem('anitracker-sync-base:u1')).toBe(base);

    await act(async () => result.current.setWatchedList([{ id: 1 }, { id: 2 }]));
    await tick(2100);
    await act(async () => window.dispatchEvent(new Event('pagehide')));
    await tick(100);
    expect(h.setDoc).not.toHaveBeenCalled();
    expect(result.current.watchedList).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('a newer document on the first snapshot is not applied either', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = await loginAndSubscribe();
    await act(async () => result.current.setWatchedList([{ id: 5 }]));
    await act(async () => h.snapshotCb(cloudSnap({ watchedList: [], syncProtocol: SYNC_PROTOCOL + 1 })));
    expect(result.current.watchedList).toEqual([{ id: 5 }]);
    expect(result.current.syncStatus).toBe('update-required');
    expect(result.current.cloudLoaded).toBe(true);
    expect(localStorage.getItem('anitracker-sync-base:u1')).toBeNull();
  });

  it('a later supported document resumes sync', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = await loginAndSubscribe();
    await act(async () => h.snapshotCb(cloudSnap({ watchedList: [], syncProtocol: SYNC_PROTOCOL + 1 })));
    expect(result.current.syncStatus).toBe('update-required');
    await act(async () => h.snapshotCb(cloudSnap({ watchedList: [{ id: 9 }], syncProtocol: SYNC_PROTOCOL })));
    expect(result.current.watchedList).toEqual([{ id: 9 }]);
    expect(result.current.syncStatus).toBe('synced');
    expect(result.current.syncError).toBe(false);
  });

  it('a newer document met inside the save transaction also pauses sync', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await loginAndSubscribe();
    await act(async () => h.snapshotCb(cloudSnap({ watchedList: [], syncRevision: 1 })));
    h.docs.set('u1', cloudSnap({ watchedList: [], syncProtocol: SYNC_PROTOCOL + 1, syncRevision: 2 }));
    await act(async () => result.current.setWatchedList([{ id: 3 }]));
    await tick(2100);
    expect(result.current.syncStatus).toBe('update-required');
    await tick(60000);
    expect(h.setDoc).not.toHaveBeenCalled();
  });
});

describe('the online event', () => {
  it('keeps a healthy listener and the result of an in-flight save', async () => {
    const { result } = await loginAndSubscribe();
    await act(async () => h.snapshotCb(cloudSnap({ watchedList: [], syncRevision: 1 })));
    const listener = h.snapshotCb;
    let release;
    h.setDoc.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    await act(async () => result.current.setWatchedList([{ id: 1 }]));
    await tick(2000);
    await act(async () => window.dispatchEvent(new Event('online')));
    await act(async () => release());
    await tick(2100);
    expect(h.snapshotCb).toBe(listener);
    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect(result.current.syncStatus).toBe('synced');
  });

  it('recreates a listener that had failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await loginAndSubscribe();
    const listener = h.snapshotCb;
    await act(async () => h.snapshotError(new Error('unavailable')));
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(h.snapshotCb).not.toBe(listener);
  });
});

describe('resubscribing with a full storage quota', () => {
  it('still starts the listener for the same account', async () => {
    const { result } = await loginAndSubscribe();
    await act(async () => h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }] })));
    const set = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key === 'anitracker-account-state') throw new Error('Quota');
      return set.call(this, key, value);
    });
    const listener = h.snapshotCb;
    await act(async () => result.current.retrySync());
    expect(h.snapshotCb).not.toBe(listener);
    await act(async () => h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }, { id: 2 }] })));
    expect(result.current.syncError).toBe(false);
    expect(result.current.watchedList.map((a) => a.id)).toEqual([1, 2]);
  });
});

describe('serialization cost', () => {
  it('does not serialize the library on renders that do not change it', async () => {
    const { result, rerender } = await loginAndSubscribe();
    await act(async () => h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }] })));
    expect(result.current.syncStatus).toBe('synced');
    serializeData.mockClear();
    for (let i = 0; i < 5; i++) rerender();
    expect(serializeData).not.toHaveBeenCalled();
    expect(result.current.syncStatus).toBe('synced');
  });
});
