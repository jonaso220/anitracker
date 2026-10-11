// Composición de la auth y la sincronización con la nube.
//
// Este archivo mantiene la API pública que consume `App.jsx`:
//   { user, cloudLoaded, syncing, syncError, syncTooLarge, syncStatus,
//     syncConflict, resolveConflict, downloadRecovery, retrySync, authError,
//     authReady, authBusy, loginWithGoogle, logout, FIREBASE_ENABLED }
//
// La lógica vive en dos hooks con una responsabilidad cada uno:
//   - `useCloudSync` — suscripción a Firestore, guardado transaccional, fusión,
//     conflictos, recovery y persistencia por cuenta.
//   - `useAuth`      — estado y acciones de la sesión de Google.
// Acá queda solo lo que necesita a los dos a la vez: el ciclo de vida de la
// sesión (inicializar el SDK, escuchar `onAuthStateChanged`, suscribir/cerrar
// la nube) y `logout` (subir lo pendiente antes de cortar sesión).
import { useCallback, useEffect, useState } from 'react';
import { LOCAL_REV_KEY, readActiveLibrary } from '../accountStorage';
import { FIREBASE_ENABLED, authMessage, getAuthHandles, initFirebase } from './firebaseClient';
import { useAuth } from './useAuth';
import { useCloudSync } from './useCloudSync';

// La app (y los tests) importan `serializeData` desde acá.
export { serializeData } from './firebaseClient';

export function useFirebase(schedule, watchedList, watchLater, customLists, setSchedule, setWatchedList, setWatchLater, setCustomLists) {
  const [initialAccount] = useState(readActiveLibrary);
  const auth = useAuth();
  const cloud = useCloudSync({
    initialAccount,
    isSignedIn: auth.user != null,
    schedule,
    watchedList,
    watchLater,
    customLists,
    setSchedule,
    setWatchedList,
    setWatchLater,
    setCustomLists,
  });

  const { setUser, setAuthError, setAuthReady } = auth;
  const { handleAuthUser, dispose, prepareLogout, persistAccount, unsubscribeFromCloud } = cloud;

  // Inicializar Auth: resolver el SDK, recuperar un redirect pendiente y
  // escuchar los cambios de sesión (que disparan suscribirse o desuscribirse).
  useEffect(() => {
    if (!FIREBASE_ENABLED) return;
    let unsubscribe = null;
    let cancelled = false;
    initFirebase().then(async () => {
      const { firebaseAuth, auth: fbAuth } = getAuthHandles();
      if (cancelled || !firebaseAuth || !fbAuth) return;
      setAuthReady(true);
      if (initialAccount?.rev) {
        try { localStorage.setItem(LOCAL_REV_KEY, initialAccount.rev); } catch { /* best-effort */ }
      }

      try {
        const result = await firebaseAuth.getRedirectResult(fbAuth);
        if (cancelled) return;
        if (result?.user) {
          setUser(result.user);
          handleAuthUser(result.user);
        }
      } catch (e) { if (!cancelled) setAuthError(authMessage(e)); }

      if (cancelled) return;
      unsubscribe = firebaseAuth.onAuthStateChanged(fbAuth, (u) => {
        setUser(u);
        if (u) setAuthError('');
        handleAuthUser(u);
      });
    }).catch((error) => { if (!cancelled) { setAuthReady(true); setAuthError(authMessage(error)); } });
    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
      dispose();
    };
  }, [handleAuthUser, dispose, initialAccount, setUser, setAuthError, setAuthReady]);

  const logout = useCallback(async () => {
    const { firebaseAuth, auth: fbAuth } = getAuthHandles();
    if (!firebaseAuth || !fbAuth) return;
    // Subir lo pendiente antes de cortar la sesión (el debounce de 2 s o un
    // error de red lo dejarían sin subir). Si no llega a tiempo no se pierde:
    // queda en este dispositivo y se fusiona al volver a entrar.
    const unsynced = await prepareLogout();
    try {
      persistAccount();
      await firebaseAuth.signOut(fbAuth);
      unsubscribeFromCloud();
      window.dispatchEvent(new Event('anitracker-account-changed'));
      setUser(null);
      if (unsynced) {
        setAuthError('Cerraste sesión con cambios sin subir. Quedaron guardados en este dispositivo. Revisá la sincronización al volver a entrar con esta cuenta.');
      }
    } catch {
      setAuthError('No se pudo cerrar la sesión. Tus datos siguen en esta cuenta. Volvé a intentarlo.');
    }
  }, [prepareLogout, persistAccount, unsubscribeFromCloud, setUser, setAuthError]);

  return {
    user: auth.user,
    cloudLoaded: cloud.cloudLoaded,
    syncing: cloud.syncing,
    syncError: cloud.syncError,
    syncTooLarge: cloud.syncTooLarge,
    syncStatus: cloud.syncStatus,
    syncConflict: cloud.syncConflict,
    resolveConflict: cloud.resolveConflict,
    downloadRecovery: cloud.downloadRecovery,
    retrySync: cloud.retrySync,
    authError: auth.authError,
    authReady: auth.authReady,
    authBusy: auth.authBusy,
    loginWithGoogle: auth.loginWithGoogle,
    logout,
    FIREBASE_ENABLED,
  };
}
