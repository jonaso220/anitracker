import { useCallback, useEffect, useRef, useState } from 'react';

// Firebase config — these are public Firebase Web SDK keys (safe to commit).
// Security is enforced via Firebase Security Rules, not by hiding these values.
//
// Values can be overridden per-environment via Vite env vars (see .env.example).
// When a VITE_FIREBASE_* var is set it takes precedence; otherwise we fall back
// to the shared public project below so the app works out of the box.
const env = import.meta.env;
const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyB3AcPFUO8DMBGUdM1emaOEzGtwrZ4BQ0Y",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "animetracker-47abf.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "animetracker-47abf",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "animetracker-47abf.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "757726364049",
  appId: env.VITE_FIREBASE_APP_ID || "1:757726364049:web:045a512ed19c25924f5a30"
};

const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "";

let firebaseApp = null, firebaseAuth = null, firebaseDb = null;
let auth = null, db = null;

const initFirebase = async () => {
  if (!FIREBASE_ENABLED || firebaseApp) return;
  try {
    const { initializeApp } = await import('firebase/app');
    const { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence } = await import('firebase/auth');
    const { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } = await import('firebase/firestore');

    firebaseApp = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(firebaseApp);
    try { await setPersistence(auth, browserLocalPersistence); } catch { /* Persistence is best-effort. */ }
    db = getFirestore(firebaseApp);

    firebaseAuth = { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged };
    firebaseDb = { doc, setDoc, onSnapshot, serverTimestamp };
  } catch (e) { console.error('Firebase init error:', e); }
};

const parseCloudField = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

// Canonical serialization of the synced fields. Used to tell a genuine user
// edit apart from the state change produced by applying a cloud snapshot: we
// always set `lastSyncedRef` from the very data we put into state, so an echo
// compares equal and never gets saved back (no loop), while a real edit differs.
// It's also the exact payload we send to Firestore (via JSON.parse): the
// round-trip drops `undefined` values — normalizeAnime emits
// `finishedDate/droppedDate: undefined` on fresh search results, and Firestore
// rejects any document containing `undefined` ("Unsupported field value"), so
// saving the state objects directly made every save of the session fail.
export const serializeData = (d) => JSON.stringify({
  schedule: d.schedule,
  watchedList: d.watchedList,
  watchLater: d.watchLater,
  customLists: d.customLists,
});
const EMPTY_SYNC_JSON = serializeData({ schedule: {}, watchedList: [], watchLater: [], customLists: [] });

// Timestamp (ISO) of the last local user edit. Lets a load tell a *stale*
// cloud doc (older than our own edits, e.g. because previous saves failed)
// apart from *newer* edits made on another device. Without it, the cloud
// snapshot always wins on app open and a stale doc silently wipes local data.
const LOCAL_REV_KEY = 'anitracker-local-rev';

const SAVE_DEBOUNCE_MS = 2000;
const RETRY_BASE_MS = 5000;
const RETRY_MAX_MS = 60000;

/**
 * Decide whether an incoming cloud snapshot should be ignored in favor of the
 * local data (and the local data pushed up instead). Pure — exported for tests.
 * ISO timestamps compare correctly as strings. Missing timestamps (legacy docs
 * or first run after this feature shipped) fall back to "cloud wins".
 */
export function shouldKeepLocal({ cloudJson, localJson, cloudRev, localRev }) {
  if (cloudJson === localJson) return false;
  if (!cloudRev || !localRev) return false;
  return localRev > cloudRev;
}

export function useFirebase(schedule, watchedList, watchLater, customLists, setSchedule, setWatchedList, setWatchLater, setCustomLists) {
  const [user, setUser] = useState(null);
  const [syncing, setSyncing] = useState(false);
  // True while saves are failing (rules, red, datos inválidos). Surfaced in the
  // header so a broken sync is visible instead of dying in la consola.
  const [syncError, setSyncError] = useState(false);
  const hasLoadedUser = useRef(null);
  const syncTimer = useRef(null);
  const cloudUnsub = useRef(null);
  // JSON of the last data we know is in sync with the cloud (from a load or a
  // completed save). `null` means we haven't seen the cloud state yet, so we
  // must not push local data up (it could clobber newer cloud data).
  const lastSyncedRef = useRef(null);
  // Serialization of the previous render's data, to detect genuine local edits
  // (vs. mount / login-state changes / cloud-apply echoes) for LOCAL_REV_KEY.
  const prevJsonRef = useRef(null);
  const saveAttempts = useRef(0);
  const flushSaveRef = useRef(null);

  // Refs para que saveToCloud siempre lea los valores más recientes.
  const dataRef = useRef({ schedule, watchedList, watchLater, customLists });
  useEffect(() => {
    dataRef.current = { schedule, watchedList, watchLater, customLists };
  }, [schedule, watchedList, watchLater, customLists]);

  const saveToCloud = useCallback(async (uid, json) => {
    if (!firebaseDb || !db || !uid) return false;
    setSyncing(true);
    try {
      // Parse the canonical JSON instead of sending the state objects: the
      // round-trip strips `undefined` values that Firestore rejects outright.
      const fields = JSON.parse(json);
      await firebaseDb.setDoc(firebaseDb.doc(db, 'users', uid), {
        schemaVersion: 2,
        schedule: fields.schedule,
        watchedList: fields.watchedList,
        watchLater: fields.watchLater,
        customLists: fields.customLists,
        updatedAt: firebaseDb.serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
      }, { merge: true });
      lastSyncedRef.current = json;
      setSyncing(false);
      return true;
    } catch (e) {
      console.error('Save error:', e);
      setSyncing(false);
      return false;
    }
  }, []);

  const scheduleSave = useCallback((delay) => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      syncTimer.current = null;
      flushSaveRef.current?.();
    }, delay);
  }, []);

  // Save the freshest local state if it differs from the last synced state.
  // On failure `lastSyncedRef` stays untouched and we retry with backoff — a
  // failed save used to be marked as synced and never retried, so the cloud
  // doc went stale and clobbered local data on the next app open.
  const flushSave = useCallback(async () => {
    const uid = hasLoadedUser.current;
    if (!uid || lastSyncedRef.current === null) return;
    const json = serializeData(dataRef.current);
    if (json === lastSyncedRef.current) return;
    const ok = await saveToCloud(uid, json);
    if (ok) {
      saveAttempts.current = 0;
      setSyncError(false);
    } else {
      saveAttempts.current += 1;
      setSyncError(true);
      const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(saveAttempts.current - 1, 4));
      scheduleSave(delay);
    }
  }, [saveToCloud, scheduleSave]);
  useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

  // Apply a cloud snapshot to local state. We compute the exact object we put
  // into state and record its serialization in `lastSyncedRef`, so the
  // re-render this triggers is recognized by the auto-sync effect as an echo of
  // the load (equal serialization) and is never saved back — no loop, and no
  // dependence on React's batching/microtask timing.
  const applyCloudData = useCallback((data) => {
    const latest = dataRef.current;
    const next = {
      schedule:    data.schedule    != null ? parseCloudField(data.schedule, {})    : latest.schedule,
      watchedList: data.watchedList != null ? parseCloudField(data.watchedList, []) : latest.watchedList,
      watchLater:  data.watchLater  != null ? parseCloudField(data.watchLater, [])  : latest.watchLater,
      customLists: data.customLists != null ? parseCloudField(data.customLists, []) : latest.customLists,
    };
    const nextJson = serializeData(next);
    let localRev = null;
    try { localRev = localStorage.getItem(LOCAL_REV_KEY); } catch { /* best-effort */ }
    const cloudRev = typeof data.updatedAtIso === 'string' ? data.updatedAtIso : '';
    if (shouldKeepLocal({ cloudJson: nextJson, localJson: serializeData(latest), cloudRev, localRev })) {
      // The cloud doc is OLDER than our last local edit (typically because
      // earlier saves failed): applying it would wipe those edits. Keep the
      // local data and push it up instead.
      lastSyncedRef.current = nextJson;
      scheduleSave(0);
      return;
    }
    lastSyncedRef.current = nextJson;
    setSchedule(next.schedule);
    setWatchedList(next.watchedList);
    setWatchLater(next.watchLater);
    setCustomLists(next.customLists);
  }, [setSchedule, setWatchedList, setWatchLater, setCustomLists, scheduleSave]);

  // Subscribe to the user's cloud doc in real time. The first snapshot acts as
  // the initial load; every later snapshot keeps this device in sync with
  // changes made on other devices (the whole point — without this, an already
  // open tab never sees edits made elsewhere until a full reload).
  const subscribeToCloud = useCallback((uid) => {
    if (!firebaseDb || !db || !uid) return;
    // Tear down any previous subscription (e.g. when switching accounts).
    if (cloudUnsub.current) { cloudUnsub.current(); cloudUnsub.current = null; }
    lastSyncedRef.current = null;
    setSyncing(true);
    cloudUnsub.current = firebaseDb.onSnapshot(
      firebaseDb.doc(db, 'users', uid),
      (snap) => {
        // Skip echoes of our own not-yet-acked local writes: applying them is a
        // no-op and only risks a save loop. We still apply the server-confirmed
        // version (hasPendingWrites === false), which is harmless for our own
        // writes and is exactly what we want for remote changes.
        if (snap.metadata.hasPendingWrites) return;
        if (snap.exists()) {
          applyCloudData(snap.data());
        } else if (lastSyncedRef.current === null) {
          // No cloud doc yet (new account): unlock saving and push any
          // existing local data up right away (no-op if local is empty).
          lastSyncedRef.current = EMPTY_SYNC_JSON;
          scheduleSave(0);
        }
        setSyncing(false);
      },
      (e) => { console.error('Snapshot error:', e); setSyncing(false); }
    );
  }, [applyCloudData, scheduleSave]);

  const unsubscribeFromCloud = useCallback(() => {
    if (cloudUnsub.current) { cloudUnsub.current(); cloudUnsub.current = null; }
    hasLoadedUser.current = null;
    lastSyncedRef.current = null;
    saveAttempts.current = 0;
    setSyncError(false);
  }, []);

  // Inicializar Auth
  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    let unsubscribe = null;
    let cancelled = false;
    initFirebase().then(async () => {
      if (cancelled || !firebaseAuth || !auth) return;

      try {
        const result = await firebaseAuth.getRedirectResult(auth);
        if (cancelled) return;
        if (result?.user) {
          setUser(result.user);
          if (hasLoadedUser.current !== result.user.uid) {
            hasLoadedUser.current = result.user.uid;
            subscribeToCloud(result.user.uid);
          }
        }
      } catch (e) { console.error('Redirect result error:', e); }

      if (cancelled) return;
      unsubscribe = firebaseAuth.onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u && hasLoadedUser.current !== u.uid) {
          hasLoadedUser.current = u.uid;
          subscribeToCloud(u.uid);
        } else if (!u) {
          // Signed out: drop the realtime listener so we don't keep syncing.
          unsubscribeFromCloud();
        }
      });
    });
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (cloudUnsub.current) { cloudUnsub.current(); cloudUnsub.current = null; }
      if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
    };
  }, [subscribeToCloud, unsubscribeFromCloud]);

  // Auto-sync: save local edits to the cloud, debounced.
  useEffect(() => {
    const currentJson = serializeData({ schedule, watchedList, watchLater, customLists });
    // Record when the user last actually edited the data. Mounts and
    // login-state changes keep the same JSON, and cloud applies pre-set
    // `lastSyncedRef` to the exact data they load, so neither counts as an
    // edit. Runs even logged-out so edits made before logging in are dated.
    const prevJson = prevJsonRef.current;
    prevJsonRef.current = currentJson;
    if (prevJson !== null && currentJson !== prevJson && currentJson !== lastSyncedRef.current) {
      try { localStorage.setItem(LOCAL_REV_KEY, new Date().toISOString()); } catch { /* best-effort */ }
    }

    if (!user) return;
    // Don't push anything until we've seen the cloud state at least once —
    // otherwise we could overwrite newer cloud data we haven't loaded yet.
    if (lastSyncedRef.current === null) return;

    // Equal to the last synced state ⇒ this render is the echo of a load/save,
    // not a user edit. Drop any stale timer (including pending retries — the
    // data now matches the cloud, so there's nothing left to push).
    if (currentJson === lastSyncedRef.current) {
      if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
      return;
    }

    scheduleSave(SAVE_DEBOUNCE_MS);
  }, [schedule, watchedList, watchLater, customLists, user, scheduleSave]);

  // Flush a pending save when the tab is hidden or unloaded. The 2s debounce
  // above can be lost on mobile (iOS suspends timers when the app is
  // backgrounded), so an edit made right before locking the phone / switching
  // apps would never reach the cloud. Saving on `visibilitychange`/`pagehide`
  // gives the write a chance to go out while the page is still alive.
  useEffect(() => {
    if (!user) return;
    const flush = () => {
      if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
      flushSaveRef.current?.(); // no-op if already in sync
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [user]);

  const loginWithGoogle = async () => {
    if (!FIREBASE_ENABLED) { alert('Firebase no está configurado.'); return; }

    // If Firebase isn't ready yet, init and wait — but this should rarely happen
    // since initFirebase runs on mount. The key issue is that any `await` before
    // signInWithPopup breaks Safari's user-gesture chain, causing silent failure.
    if (!firebaseAuth || !auth) {
      await initFirebase();
      if (!firebaseAuth || !auth) return;
    }

    const provider = new firebaseAuth.GoogleAuthProvider();
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

    // PWA (installed to home screen): use redirect — it works reliably in standalone mode.
    // Browser (including mobile Safari): use popup — redirect fails in iOS Safari due to
    // ITP (Intelligent Tracking Prevention) dropping the auth state after navigation.
    if (isStandalone) {
      try { await firebaseAuth.signInWithRedirect(auth, provider); } catch { /* Auth fallback is best-effort. */ }
    } else {
      try {
        await firebaseAuth.signInWithPopup(auth, provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
          try { await firebaseAuth.signInWithRedirect(auth, provider); } catch { /* Auth fallback is best-effort. */ }
        }
      }
    }
  };

  const logout = async () => {
    if (!firebaseAuth || !auth) return;
    unsubscribeFromCloud();
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
    // Drop the local edit timestamp: it dates *this* account's edits, and if
    // another account logs in next it must not shield this data from that
    // account's cloud snapshot.
    try { localStorage.removeItem(LOCAL_REV_KEY); } catch { /* best-effort */ }
    await firebaseAuth.signOut(auth);
    setUser(null);
  };

  return { user, syncing, syncError, loginWithGoogle, logout, FIREBASE_ENABLED };
}
