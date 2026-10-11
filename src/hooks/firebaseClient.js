// Cliente de Firebase: configuración, inicialización perezosa del SDK y helpers
// que comparten los hooks de auth (useAuth) y de sincronización (useCloudSync).
//
// El SDK se importa dinámicamente y se cachea a nivel de módulo: la primera
// llamada a `initFirebase()` resuelve los imports y deja los handles listos.
import { resolveAuthDomain } from '../authFlow';
import { serializeLibrary } from '../cloudSync';

const env = import.meta.env;

// Firebase config — these are public Firebase Web SDK keys (safe to commit).
// Security is enforced via Firebase Security Rules, not by hiding these values.
//
// Values can be overridden per-environment via Vite env vars (see .env.example).
// When a VITE_FIREBASE_* var is set it takes precedence; otherwise we fall back
// to the shared public project below so the app works out of the box.
export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyB3AcPFUO8DMBGUdM1emaOEzGtwrZ4BQ0Y",
  authDomain: resolveAuthDomain({
    hostname: window.location.hostname,
    configuredDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID || 'animetracker-47abf',
  }),
  projectId: env.VITE_FIREBASE_PROJECT_ID || "animetracker-47abf",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "animetracker-47abf.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "757726364049",
  appId: env.VITE_FIREBASE_APP_ID || "1:757726364049:web:045a512ed19c25924f5a30"
};

export const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey !== "";

let firebaseApp = null, firebaseAuth = null, firebaseDb = null;
let auth = null, db = null;
let initPromise = null;

export const initFirebase = () => {
  if (firebaseAuth) return Promise.resolve();
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const { initializeApp } = await import('firebase/app');
    const { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence } = await import('firebase/auth');
    const { getFirestore, doc, runTransaction, onSnapshot, serverTimestamp, deleteField, Bytes } = await import('firebase/firestore');

    firebaseApp ||= initializeApp(FIREBASE_CONFIG);
    auth = getAuth(firebaseApp);
    try { await setPersistence(auth, browserLocalPersistence); } catch { /* Persistence is best-effort. */ }
    db = getFirestore(firebaseApp);

    firebaseAuth = { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, onAuthStateChanged };
    firebaseDb = { doc, runTransaction, onSnapshot, serverTimestamp, deleteField, Bytes };
  })().catch((error) => { initPromise = null; throw error; });
  return initPromise;
};

/** Handles del SDK, ya resueltos después de `initFirebase()`. */
export const getAuthHandles = () => ({ firebaseAuth, auth, firebaseDb, db });

export function authMessage(error) {
  switch (error?.code) {
    case 'auth/popup-blocked': return 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes para esta app y volvé a intentarlo.';
    case 'auth/popup-closed-by-user': return 'Se cerró el acceso de Google. Tocá Google para intentarlo otra vez.';
    case 'auth/network-request-failed': return 'No se pudo conectar con Google. Revisá tu conexión y volvé a intentarlo.';
    case 'auth/unauthorized-domain': return 'El dominio de esta app no está autorizado para iniciar sesión. Contactá al administrador.';
    case 'auth/web-storage-unsupported': return 'El navegador no permite guardar la sesión. Habilitá el almacenamiento para esta app.';
    default: return 'No se pudo iniciar sesión con Google. Volvé a intentarlo.';
  }
}

// Canonical serialization of the synced fields. Used to tell a genuine user
// edit apart from the state change produced by applying a cloud snapshot: we
// always set `lastSyncedRef` from the very data we put into state, so an echo
// compares equal and never gets saved back (no loop), while a real edit differs.
// It's also the exact payload we send to Firestore (via JSON.parse): the
// round-trip drops `undefined` values — normalizeAnime emits
// `finishedDate/droppedDate: undefined` on fresh search results, and Firestore
// rejects any document containing `undefined` ("Unsupported field value"), so
// saving the state objects directly made every save of the session fail.
export const serializeData = serializeLibrary;
export const EMPTY_SYNC_JSON = serializeData({ schedule: {}, watchedList: [], watchLater: [], customLists: [] });

export const SAVE_DEBOUNCE_MS = 2000;
export const RETRY_BASE_MS = 5000;
export const RETRY_MAX_MS = 60000;
// Al cerrar sesión se espera como mucho esto a que suban los cambios pendientes.
export const LOGOUT_FLUSH_TIMEOUT_MS = 8000;
