import { useState, useEffect, useRef } from 'react';

// Configuración de Firebase (Tu config)
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
  const syncTimer = useRef(null);

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
    if (isLoadingFromCloud.current) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    
    syncTimer.current = setTimeout(() => {
      if (!isLoadingFromCloud.current) saveToCloud(user.uid);
    }, 2000);
  }, [schedule, watchedList, watchLater, user]);

  const loginWithGoogle = async () => {
    if (!FIREBASE_ENABLED) { alert('Firebase no está configurado.'); return; }
    await initFirebase();
    if (!firebaseAuth || !auth) return;
    const provider = new firebaseAuth.GoogleAuthProvider();
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    try {
      if (isIOS) {
        await firebaseAuth.signInWithRedirect(auth, provider);
      } else {
        await firebaseAuth.signInWithPopup(auth, provider);
      }
    } catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
        try { await firebaseAuth.signInWithRedirect(auth, provider); } catch (e2) {}
      }
    }
  };

  const logout = async () => {
    if (!firebaseAuth || !auth) return;
    await firebaseAuth.signOut(auth);
    setUser(null);
  };

  const saveToCloud = async (uid) => {
    if (!firebaseDb || !db || !uid) return;
    setSyncing(true);
    try {
      await firebaseDb.setDoc(firebaseDb.doc(db, 'users', uid), {
        schedule: JSON.stringify(schedule),
        watchedList: JSON.stringify(watchedList),
        watchLater: JSON.stringify(watchLater),
        updatedAt: new Date().toISOString()
      });
    } catch (e) { console.error('Save error:', e); }
    setSyncing(false);
  };

  const loadFromCloud = async (uid) => {
    if (!firebaseDb || !db || !uid) return;
    setSyncing(true);
    try {
      const snap = await firebaseDb.getDoc(firebaseDb.doc(db, 'users', uid));
      if (snap.exists()) {
        const data = snap.data();
        isLoadingFromCloud.current = true;
        if (data.schedule) setSchedule(JSON.parse(data.schedule));
        if (data.watchedList) setWatchedList(JSON.parse(data.watchedList));
        if (data.watchLater) setWatchLater(JSON.parse(data.watchLater));
        setTimeout(() => { isLoadingFromCloud.current = false; }, 500);
      }
    } catch (e) { console.error('Load error:', e); }
    setSyncing(false);
  };

  return { user, syncing, loginWithGoogle, logout, FIREBASE_ENABLED };
}