import { useCallback, useEffect, useRef, useState } from 'react';

// Firebase config — these are public Firebase Web SDK keys (safe to commit).
// Security is enforced via Firebase Security Rules, not by hiding these values.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB3AcPFUO8DMBGUdM1emaOEzGtwrZ4BQ0Y",
  authDomain: "animetracker-47abf.firebaseapp.com",
  projectId: "animetracker-47abf",
  storageBucket: "animetracker-47abf.firebasestorage.app",
  messagingSenderId: "757726364049",
  appId: "1:757726364049:web:045a512ed19c25924f5a30"
};

const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "";

let firebaseApp = null, firebaseAuth = null, firebaseDb = null;
let auth = null, db = null;

const initFirebase = async () => {
  if (!FIREBASE_ENABLED || firebaseApp) return;
  try {
    const { initializeApp } = await import('firebase/app');
    const { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence } = await import('firebase/auth');
    const { getFirestore, doc, setDoc, getDoc, serverTimestamp } = await import('firebase/firestore');

    firebaseApp = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(firebaseApp);
    try { await setPersistence(auth, browserLocalPersistence); } catch { /* Persistence is best-effort. */ }
    db = getFirestore(firebaseApp);

    firebaseAuth = { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged };
    firebaseDb = { doc, setDoc, getDoc, serverTimestamp };
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

export function useFirebase(schedule, watchedList, watchLater, customLists, setSchedule, setWatchedList, setWatchLater, setCustomLists) {
  const [user, setUser] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const hasLoadedUser = useRef(null);
  const isLoadingFromCloud = useRef(false);
  const loadVersion = useRef(0);
  const syncTimer = useRef(null);
  const savedLoadVersion = useRef(0);

  // Refs para que saveToCloud siempre lea los valores más recientes.
  const dataRef = useRef({ schedule, watchedList, watchLater, customLists });
  useEffect(() => {
    dataRef.current = { schedule, watchedList, watchLater, customLists };
  }, [schedule, watchedList, watchLater, customLists]);

  const saveToCloud = useCallback(async (uid) => {
    if (!firebaseDb || !db || !uid) return;
    setSyncing(true);
    try {
      const latest = dataRef.current;
      await firebaseDb.setDoc(firebaseDb.doc(db, 'users', uid), {
        schemaVersion: 2,
        schedule: latest.schedule,
        watchedList: latest.watchedList,
        watchLater: latest.watchLater,
        customLists: latest.customLists,
        updatedAt: firebaseDb.serverTimestamp(),
        updatedAtIso: new Date().toISOString(),
      }, { merge: true });
    } catch (e) { console.error('Save error:', e); }
    setSyncing(false);
  }, []);

  const loadFromCloud = useCallback(async (uid) => {
    if (!firebaseDb || !db || !uid) return;
    // Set the flag BEFORE the async getDoc to prevent the auto-sync effect
    // from saving stale/empty local data to cloud while we're loading.
    isLoadingFromCloud.current = true;
    setSyncing(true);
    try {
      const snap = await firebaseDb.getDoc(firebaseDb.doc(db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data();
        loadVersion.current++;
        savedLoadVersion.current = loadVersion.current;
        if (data.schedule) setSchedule(parseCloudField(data.schedule, {}));
        if (data.watchedList) setWatchedList(parseCloudField(data.watchedList, []));
        if (data.watchLater) setWatchLater(parseCloudField(data.watchLater, []));
        if (data.customLists) setCustomLists(parseCloudField(data.customLists, []));
        // Use queueMicrotask to flip the flag after React has processed the batched state updates
        queueMicrotask(() => { isLoadingFromCloud.current = false; });
      } else {
        isLoadingFromCloud.current = false;
      }
    } catch (e) {
      console.error('Load error:', e);
      isLoadingFromCloud.current = false;
    }
    setSyncing(false);
  }, [setSchedule, setWatchedList, setWatchLater, setCustomLists]);

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
            loadFromCloud(result.user.uid);
          }
        }
      } catch (e) { console.error('Redirect result error:', e); }

      if (cancelled) return;
      unsubscribe = firebaseAuth.onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u && hasLoadedUser.current !== u.uid) {
          hasLoadedUser.current = u.uid;
          loadFromCloud(u.uid);
        }
      });
    });
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
    };
  }, [loadFromCloud]);

  // Auto-sync
  useEffect(() => {
    if (!user) return;
    if (isLoadingFromCloud.current) {
      // Always cancel pending timers to prevent stale saves
      if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
      savedLoadVersion.current = loadVersion.current;
      return;
    }
    // Skip the first render after a cloud load to avoid saving cloud data back
    if (savedLoadVersion.current > 0 && savedLoadVersion.current === loadVersion.current) {
      if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
      savedLoadVersion.current = 0;
      return;
    }
    if (syncTimer.current) clearTimeout(syncTimer.current);

    syncTimer.current = setTimeout(() => {
      if (!isLoadingFromCloud.current) saveToCloud(user.uid);
    }, 2000);
  }, [schedule, watchedList, watchLater, customLists, user, saveToCloud]);

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
    await firebaseAuth.signOut(auth);
    setUser(null);
  };

  return { user, syncing, loginWithGoogle, logout, FIREBASE_ENABLED };
}
