import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { useFirebase } from '../hooks/useFirebase';

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
  doc: vi.fn(() => ({})),
  setDoc: (...args) => h.setDoc(...args),
  onSnapshot: vi.fn((ref, next) => { h.snapshotCb = next; return h.onSnapshotUnsub; }),
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
});
