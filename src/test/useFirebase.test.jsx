import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useFirebase, serializeData, shouldKeepLocal } from '../hooks/useFirebase';
import { signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { shouldRedirectGoogle } from '../authFlow';
import { normalizeAnime } from '../schemas/anime';

// Shared, resettable handles into the Firebase mocks. `vi.hoisted` lets the
// mock factories (which are hoisted above imports) share these references.
const h = vi.hoisted(() => ({
  authCb: null,        // onAuthStateChanged callback
  snapshotCb: null,    // onSnapshot "next" callback — lets us drive cloud docs
  setDoc: vi.fn(() => Promise.resolve()),
  onSnapshotUnsub: vi.fn(),
  authUnsub: vi.fn(),
  redirectResult: { user: null },
}));

vi.mock('../authFlow', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, shouldRedirectGoogle: vi.fn(actual.shouldRedirectGoogle) };
});

vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
  setPersistence: vi.fn(() => Promise.resolve()),
  browserLocalPersistence: {},
  signInWithPopup: vi.fn(() => Promise.resolve()),
  signInWithRedirect: vi.fn(() => Promise.resolve()),
  getRedirectResult: vi.fn(() => Promise.resolve(h.redirectResult)),
  GoogleAuthProvider: vi.fn(function GoogleAuthProvider() {}),
  signOut: vi.fn(() => Promise.resolve()),
  onAuthStateChanged: vi.fn((auth, cb) => { h.authCb = cb; return h.authUnsub; }),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  doc: vi.fn((db, collection, uid) => ({uid})),
  setDoc: (...args) => h.setDoc(...args),
  onSnapshot: vi.fn((ref, next, error) => { h.snapshotError = error; h.snapshotCb = next; return h.onSnapshotUnsub; }),
  serverTimestamp: vi.fn(() => 'ts'),
}));

// Mirror App.jsx: it owns the state and hands it (plus setters) to useFirebase.
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

const cloudSnap = (data, pending = false) => ({
  metadata: { hasPendingWrites: pending },
  exists: () => true,
  data: () => data,
});

// The auth init is a chain of awaited promises (dynamic imports →
// getRedirectResult → onAuthStateChanged). Resolving a dynamic import the first
// time needs a macrotask, and how many turns it takes varies, so poll: advance
// fake timers a little (which also flushes microtasks in between) until the
// condition holds. Each small advance stays well under the 2s save debounce.
async function waitUntil(cond) {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await act(async () => { await vi.advanceTimersByTimeAsync(5); });
  }
  throw new Error('waitUntil: condition never met');
}

// Advance past the 2s save debounce and let the save settle.
const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

// Drive the hook to a logged-in, subscribed state and return its render result.
async function loginAndSubscribe() {
  const rendered = renderHook(() => useHarness());
  await waitUntil(() => typeof h.authCb === 'function');     // onAuthStateChanged registered
  await act(async () => { h.authCb({ uid: 'u1' }); });       // Firebase reports a signed-in user
  await waitUntil(() => typeof h.snapshotCb === 'function'); // subscribeToCloud → onSnapshot
  return rendered;
}

describe('useFirebase realtime sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    h.authCb = null;
    h.snapshotCb = null;
    h.redirectResult = { user: null };
    h.setDoc.mockClear();
    h.setDoc.mockImplementation(() => Promise.resolve());
    localStorage.clear();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('applies a remote snapshot to local state (live sync from another device)', async () => {
    const { result } = await loginAndSubscribe();
    expect(h.snapshotCb).toBeTypeOf('function');

    // Initial cloud doc.
    await act(async () => { h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }] })); });
    expect(result.current.watchedList).toEqual([{ id: 1 }]);

    // A later change made on another device arrives as a new snapshot.
    await act(async () => { h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }, { id: 2 }] })); });
    expect(result.current.watchedList).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('does not echo a cloud load back to the cloud as a save', async () => {
    await loginAndSubscribe();
    await act(async () => { h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }] })); });
    // Let the debounce window pass: applying a load must not trigger setDoc.
    await tick(2000);
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it('saves a genuine local edit to the cloud', async () => {
    const { result } = await loginAndSubscribe();
    await act(async () => { h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }] })); });

    await act(async () => { result.current.setWatchedList([{ id: 1 }, { id: 3 }]); });
    await tick(2000);

    expect(h.setDoc).toHaveBeenCalledTimes(1);
    const payload = h.setDoc.mock.calls[0][1];
    expect(payload.watchedList).toEqual([{ id: 1 }, { id: 3 }]);
  });

  it('does not push local data before the first cloud snapshot arrives', async () => {
    const { result } = await loginAndSubscribe();
    // No snapshot delivered yet: an edit must be held back to avoid clobbering
    // cloud data we haven't loaded.
    await act(async () => { result.current.setWatchedList([{ id: 9 }]); });
    await tick(2000);
    expect(h.setDoc).not.toHaveBeenCalled();
  });

  it('strips undefined values from the saved payload (Firestore los rechaza)', async () => {
    const { result } = await loginAndSubscribe();
    await act(async () => { h.snapshotCb(cloudSnap({ watchedList: [] })); });

    // normalizeAnime emits finishedDate/droppedDate: undefined on fresh search
    // results; saving them as-is made setDoc throw and killed every sync.
    const fresh = normalizeAnime({ id: 1, title: 'Frieren' });
    expect(fresh).toHaveProperty('finishedDate', undefined);
    await act(async () => { result.current.setWatchedList([fresh]); });
    await tick(2000);

    expect(h.setDoc).toHaveBeenCalledTimes(1);
    const saved = h.setDoc.mock.calls[0][1].watchedList[0];
    expect(saved).not.toHaveProperty('finishedDate');
    expect(saved).not.toHaveProperty('droppedDate');
    expect(saved.title).toBe('Frieren');
  });

  it('retries a failed save with backoff and reports syncError meanwhile', async () => {
    const { result } = await loginAndSubscribe();
    await act(async () => { h.snapshotCb(cloudSnap({ watchedList: [] })); });

    h.setDoc.mockImplementationOnce(() => Promise.reject(new Error('permission-denied')));
    await act(async () => { result.current.setWatchedList([{ id: 5 }]); });
    await tick(2000);
    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect(result.current.syncError).toBe(true);

    // First retry fires 5s later and succeeds this time.
    await tick(5000);
    expect(h.setDoc).toHaveBeenCalledTimes(2);
    expect(h.setDoc.mock.calls[1][1].watchedList).toEqual([{ id: 5 }]);
    expect(result.current.syncError).toBe(false);
  });

  it('keeps local data when a cloud snapshot is older than the last local edit', async () => {
    const { result } = await loginAndSubscribe();
    await act(async () => {
      h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }], updatedAtIso: '2020-01-01T00:00:00.000Z' }));
    });

    // A local edit stamps anitracker-local-rev with "now".
    await act(async () => { result.current.setWatchedList([{ id: 1 }, { id: 2 }]); });

    // A STALE snapshot arrives (e.g. the doc the failed saves left behind):
    // it must NOT wipe the newer local edit...
    await act(async () => {
      h.snapshotCb(cloudSnap({ watchedList: [{ id: 1 }], updatedAtIso: '2020-01-02T00:00:00.000Z' }));
    });
    expect(result.current.watchedList).toEqual([{ id: 1 }, { id: 2 }]);

    // ...and the local data gets pushed up to heal the cloud doc.
    await tick(2000);
    expect(h.setDoc).toHaveBeenCalled();
    const payload = h.setDoc.mock.calls.at(-1)[1];
    expect(payload.watchedList).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe('shouldKeepLocal (guardia contra snapshots viejos)', () => {
  const local = '{"a":1}';
  const cloud = '{"a":2}';

  it('aplica la nube cuando los datos son iguales', () => {
    expect(shouldKeepLocal({ cloudJson: local, localJson: local, cloudRev: '2026-07-01', localRev: '2026-07-08' })).toBe(false);
  });

  it('conserva lo local cuando la última edición local es posterior al doc de la nube', () => {
    expect(shouldKeepLocal({
      cloudJson: cloud, localJson: local,
      cloudRev: '2026-06-20T10:00:00.000Z', localRev: '2026-07-07T22:00:00.000Z',
    })).toBe(true);
  });

  it('aplica la nube cuando el doc es más nuevo que la última edición local', () => {
    expect(shouldKeepLocal({
      cloudJson: cloud, localJson: local,
      cloudRev: '2026-07-08T10:00:00.000Z', localRev: '2026-07-07T22:00:00.000Z',
    })).toBe(false);
  });

  it('aplica la nube si falta cualquiera de los timestamps (comportamiento legado)', () => {
    expect(shouldKeepLocal({ cloudJson: cloud, localJson: local, cloudRev: '', localRev: '2026-07-08' })).toBe(false);
    expect(shouldKeepLocal({ cloudJson: cloud, localJson: local, cloudRev: '2026-07-08', localRev: null })).toBe(false);
  });
});

describe('serializeData (payload canónico)', () => {
  it('mantiene finishedDate cuando tiene valor real', () => {
    const done = normalizeAnime({ id: 2, title: 'Ping Pong', finished: true, finishedDate: '2026-07-01' });
    const payload = JSON.parse(serializeData({ schedule: {}, watchedList: [done], watchLater: [], customLists: [] }));
    expect(payload.watchedList[0].finishedDate).toBe('2026-07-01');
  });
});

describe('account isolation, auth and read recovery', () => {
 beforeEach(() => {
   vi.useFakeTimers(); h.authCb=null; h.snapshotCb=null; h.redirectResult={user:null};
   h.setDoc.mockClear(); h.setDoc.mockImplementation(()=>Promise.resolve()); localStorage.clear();
   signInWithPopup.mockReset(); signInWithPopup.mockResolvedValue({}); signInWithRedirect.mockClear();
 });
 afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
 it('reports cloud read failure and recovers through a fresh subscription', async () => {
   const { result } = await loginAndSubscribe();
   const oldNext = h.snapshotCb;
   await act(async () => h.snapshotError(new Error('permission-denied')));
   expect(result.current.syncError).toBe(true);
   await act(async () => result.current.retrySync());
   expect(h.snapshotCb).not.toBe(oldNext);
   await act(async () => h.snapshotCb(cloudSnap({watchedList:[{id:7}]})));
   expect(result.current.syncError).toBe(false);
   expect(result.current.watchedList).toEqual([{id:7}]);
 });
 it('retries a failed cloud listener automatically', async () => {
   await loginAndSubscribe();
   const oldNext=h.snapshotCb;
   await act(async () => h.snapshotError(new Error('unavailable')));
   await tick(60000);
   expect(h.snapshotCb).not.toBe(oldNext);
 });
 it('keeps account A offline edits separate from new account B and restores A', async () => {
   const { result } = await loginAndSubscribe();
   await act(async () => h.snapshotCb(cloudSnap({watchedList:[{id:77}]})));
   await act(async () => result.current.setWatchedList([{id:77},{id:78}]));
   await act(async () => result.current.logout());
   const oldNext=h.snapshotCb;
   await act(async () => h.authCb({uid:'u2'}));
   expect(result.current.watchedList).toEqual([]);
   await act(async () => oldNext(cloudSnap({watchedList:[{id:99}]})));
   expect(result.current.watchedList).toEqual([]);
   await act(async () => h.snapshotCb({metadata:{hasPendingWrites:false},exists:()=>false}));
   await tick(2100);
   for (const [ref,payload] of h.setDoc.mock.calls) {
     expect(ref.uid).toBe('u2');
     expect(payload.watchedList).toEqual([]);
   }
   expect(JSON.parse(localStorage.getItem('anitracker-account-state')).owner).toBe('u2');
   await act(async () => result.current.logout());
   await act(async () => h.authCb({uid:'u1'}));
   expect(result.current.watchedList).toEqual([{id:77},{id:78}]);
 });
 it('aborts switching when the outgoing backup cannot be saved', async () => {
   const { result } = await loginAndSubscribe();
   await act(async () => h.snapshotCb(cloudSnap({watchedList:[{id:77}]})));
   const original=Storage.prototype.setItem;
   vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(key,value){
     if(key==='anitracker-account:u1') throw new Error('Quota exceeded');
     return original.call(this,key,value);
   });
   await act(async () => h.authCb({uid:'u2'}));
   expect(result.current.syncError).toBe(true);
   expect(result.current.watchedList).toEqual([{id:77}]);
   await tick(2100);
   expect(h.setDoc).not.toHaveBeenCalled();
 });
 it('redirects installed apps only when the same-origin helper is configured', async () => {
   const { result } = await loginAndSubscribe();
   shouldRedirectGoogle.mockReturnValueOnce(true);
   await act(async () => result.current.loginWithGoogle());
   expect(signInWithRedirect).toHaveBeenCalledOnce();
   expect(signInWithPopup).not.toHaveBeenCalled();
 });
 it('shows an error when same-origin redirect fails', async () => {
   const { result } = await loginAndSubscribe();
   shouldRedirectGoogle.mockReturnValueOnce(true);
   signInWithRedirect.mockRejectedValueOnce({code:'auth/network-request-failed'});
   await act(async () => result.current.loginWithGoogle());
   expect(result.current.authError).toContain('conexión');
   expect(result.current.authBusy).toBe(false);
 });
 it('opens Google directly as a popup even in installed iPad mode', async () => {
   const { result } = await loginAndSubscribe();
   Object.defineProperty(navigator,'standalone',{configurable:true,value:true});
   try {
     let pending;
     act(()=>{pending=result.current.loginWithGoogle(); expect(signInWithPopup).toHaveBeenCalledTimes(1);});
     await act(async()=>pending);
     expect(signInWithRedirect).not.toHaveBeenCalled();
   } finally { delete navigator.standalone; }
 });
 it.each(['auth/popup-blocked','auth/popup-closed-by-user','auth/unauthorized-domain','auth/network-request-failed'])(
   'shows auth error %s without redirecting', async (code) => {
     const {result}=await loginAndSubscribe();
     signInWithPopup.mockRejectedValueOnce({code});
     await act(async()=>result.current.loginWithGoogle());
     expect(result.current.authError).not.toBe('');
     expect(result.current.authBusy).toBe(false);
     expect(signInWithRedirect).not.toHaveBeenCalled();
   }
 );
 it('does not let an old in-flight save mark the new account as synced', async () => {
   const {result}=await loginAndSubscribe();
   await act(async()=>h.snapshotCb(cloudSnap({watchedList:[]})));
   let resolve;
   h.setDoc.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
   await act(async()=>result.current.setWatchedList([{id:77}]));
   await tick(2000);
   await act(async()=>h.authCb({uid:'u2'}));
   await act(async()=>resolve());
   await act(async()=>result.current.setWatchedList([{id:88}]));
   await tick(2100);
   expect(h.setDoc).toHaveBeenCalledTimes(1);
   expect(h.setDoc.mock.calls[0][0].uid).toBe('u1');
 });
});
