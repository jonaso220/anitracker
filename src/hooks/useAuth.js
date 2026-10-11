// Estado y acciones de autenticación con Google (sin el ciclo de vida).
//
// El efecto que inicializa el SDK y escucha `onAuthStateChanged` vive en el
// compositor (`useFirebase`), que es el único que ve a la vez la auth y la
// sincronización; así `logout` puede subir lo pendiente antes de cortar sesión
// sin ningún ref compartido.
import { useCallback, useRef, useState } from 'react';
import { shouldRedirectGoogle } from '../authFlow';
import { FIREBASE_CONFIG, authMessage, getAuthHandles, initFirebase } from './firebaseClient';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const loginPending = useRef(false);

  const loginWithGoogle = useCallback(async () => {
    if (loginPending.current) return;
    setAuthError('');
    // Never await SDK initialization and then open a popup: Safari needs the
    // original tap. Initialization normally finishes before enabling the button.
    const { firebaseAuth, auth } = getAuthHandles();
    if (!firebaseAuth || !auth) {
      setAuthReady(false);
      try {
        await initFirebase();
        setAuthError('Google está listo. Tocá el botón para continuar.');
      } catch (error) { setAuthError(authMessage(error)); }
      setAuthReady(true);
      return;
    }
    loginPending.current = true;
    setAuthBusy(true);
    const provider = new firebaseAuth.GoogleAuthProvider();
    try {
      const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
      if (shouldRedirectGoogle({ hostname: window.location.hostname, authDomain: FIREBASE_CONFIG.authDomain, standalone })) {
        await firebaseAuth.signInWithRedirect(auth, provider);
      } else {
        await firebaseAuth.signInWithPopup(auth, provider);
      }
    } catch (error) {
      setAuthError(authMessage(error));
    } finally {
      loginPending.current = false;
      setAuthBusy(false);
    }
  }, []);

  return { user, setUser, authError, setAuthError, authReady, setAuthReady, authBusy, loginWithGoogle };
}
