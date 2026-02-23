import { useState, useEffect, useRef } from 'react';

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
    const { getFirestore, doc, setDoc, getDoc } = await import('firebase/firestore');

    firebaseApp = initializeApp(FIREBASE_CONFIG);
    auth = getAuth(firebaseApp);
    try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}
    db = getFirestore(firebaseApp);

    firebaseAuth = { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged };
    firebaseDb = { doc, setDoc, getDoc };
  } catch (e) { console.error('Firebase init error:', e); }
};

export function useFirebase(schedule, watchedList, watchLater, setSchedule, setWatchedList, setWatchLater) {
  const [user, setUser] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const hasLoadedUser = useRef(null);
  const isLoadingFromCloud = useRef(false);
  const loadVersion = useRef(0);
  const syncTimer = useRef(null);
  const savedLoadVersion = useRef(0);

  // Refs para que saveToCloud siempre lea los valores más recientes
  const scheduleRef = useRef(schedule);
  const watchedListRef = useRef(watchedList);
  const watchLaterRef = useRef(watchLater);
  scheduleRef.current = schedule;
  watchedListRef.current = watchedList;
  watchLaterRef.current = watchLater;

  const saveToCloud = async (uid) => {
    if (!firebaseDb || !db || !uid) return;
    setSyncing(true);
    try {
      await firebaseDb.setDoc(firebaseDb.doc(db, 'users', uid), {
        schedule: JSON.stringify(scheduleRef.current),
        watchedList: JSON.stringify(watchedListRef.current),
        watchLater: JSON.stringify(watchLaterRef.current),
        updatedAt: new Date().toISOString()
      });
    } catch (e) { console.error('Save error:', e); }
    setSyncing(false);
  };

  const loadFromCloud = async (uid) => {
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
        if (data.schedule) setSchedule(JSON.parse(data.schedule));
        if (data.watchedList) setWatchedList(JSON.parse(data.watchedList));
        if (data.watchLater) setWatchLater(JSON.parse(data.watchLater));
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
  };

  // Inicializar Auth
  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    initFirebase().then(async () => {
      if (!firebaseAuth || !auth) return;

      try {
        const result = await firebaseAuth.getRedirectResult(auth);
        if (result?.user) {
          setUser(result.user);
          if (hasLoadedUser.current !== result.user.uid) {
            hasLoadedUser.current = result.user.uid;
            loadFromCloud(result.user.uid);
          }
        }
      } catch (e) { console.error('Redirect result error:', e); }

      firebaseAuth.onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (u && hasLoadedUser.current !== u.uid) {
          hasLoadedUser.current = u.uid;
          loadFromCloud(u.uid);
        }
      });
    });
  }, []);

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
  }, [schedule, watchedList, watchLater, user]);

  const loginWithGoogle = async () => {
    if (!FIREBASE_ENABLED) { alert('Firebase no está configurado.'); return; }
    // initFirebase is already called on mount, but call again just in case
    await initFirebase();
    if (!firebaseAuth || !auth) return;
    const provider = new firebaseAuth.GoogleAuthProvider();

    // On mobile/tablet, use redirect (popups are often blocked by iOS/Android browsers).
    // On desktop, try popup first and fall back to redirect if blocked.
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      try { await firebaseAuth.signInWithRedirect(auth, provider); } catch (_) {}
    } else {
      try {
        await firebaseAuth.signInWithPopup(auth, provider);
      } catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
          try { await firebaseAuth.signInWithRedirect(auth, provider); } catch (_) {}
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
