// Sincronización con Firestore: suscripción en tiempo real, guardado
// transaccional con debounce/reintentos, fusión a tres vías, detección de
// conflictos con revisión explícita y persistencia por cuenta.
//
// Todo el estado de sync vive acá. Lo que depende del ciclo de vida de la auth
// (cuándo suscribirse, qué hacer al cerrar sesión) lo dispara el compositor
// `useFirebase` a través de los callbacks que este hook expone.
import { useCallback, useEffect, useRef, useState } from 'react';
import { LOCAL_REV_KEY, persistAccountLibrary, readSyncBase, selectLibraryAccount, writeSyncBase } from '../accountStorage';
import { hashLibrary, inspectCloudSnapshot, chooseSyncConflicts } from '../syncMerge';
import { checkpointSync, exportSyncRecovery } from '../syncRecovery';
import { migrateLibrary } from '../idMigration';
import { isCompressedDoc, decodeLibrary, LibraryTooLargeError } from '../cloudCodec';
import { saveMergedLibrary, readCloudLibrary, SyncConflictError } from '../cloudSync';
import {
  EMPTY_SYNC_JSON,
  LOGOUT_FLUSH_TIMEOUT_MS,
  RETRY_BASE_MS,
  RETRY_MAX_MS,
  SAVE_DEBOUNCE_MS,
  getAuthHandles,
  serializeData,
} from './firebaseClient';

export function useCloudSync({
  initialAccount,
  isSignedIn,
  schedule,
  watchedList,
  watchLater,
  customLists,
  setSchedule,
  setWatchedList,
  setWatchLater,
  setCustomLists,
}) {
  const [syncing, setSyncing] = useState(false);
  // Llegó la primera respuesta de la nube para la sesión actual (o falló):
  // hasta entonces una biblioteca vacía puede ser solo que todavía no bajó.
  const [cloudLoaded, setCloudLoaded] = useState(false);
  // True while saves are failing (rules, red, datos inválidos). Surfaced in the
  // header so a broken sync is visible instead of dying in la consola.
  const [syncError, setSyncError] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [syncedJson, setSyncedJson] = useState(null);
  const [savePending, setSavePending] = useState(false);
  const [syncConflict, setSyncConflict] = useState(null);
  const conflictRef = useRef(null);
  const requireReviewRef = useRef(false);
  // La biblioteca no entra en el documento de Firestore ni comprimida: no se
  // reintenta en loop, se avisa.
  const [syncTooLarge, setSyncTooLarge] = useState(false);

  const ownerRef = useRef(initialAccount?.owner || null);
  const [initialRevision] = useState(() => {
    if (initialAccount) return initialAccount.rev;
    try { return localStorage.getItem(LOCAL_REV_KEY); } catch { return null; }
  });
  const localRevRef = useRef(initialRevision);
  const sessionRef = useRef(0);
  const readRetryTimer = useRef(null);
  const retrySyncRef = useRef(null);
  const hasLoadedUser = useRef(null);
  const syncTimer = useRef(null);
  const cloudUnsub = useRef(null);
  // JSON of the last data we know is in sync with the cloud (from a load or a
  // completed save). `null` means we haven't seen the cloud state yet, so we
  // must not push local data up (it could clobber newer cloud data).
  const lastSyncedRef = useRef(null);
  // Huella de ese mismo estado (base de la fusión a tres vías), persistida por
  // cuenta para sobrevivir recargas. `null` = esta cuenta nunca sincronizó acá.
  const syncBaseRef = useRef(null);
  const snapshotSeq = useRef(0);
  // Serialization of the previous render's data, to detect genuine local edits
  // (vs. mount / login-state changes / cloud-apply echoes) for LOCAL_REV_KEY.
  const prevJsonRef = useRef(null);
  const saveAttempts = useRef(0);
  const flushSaveRef = useRef(null);
  const inFlightRef = useRef(null);
  const applyCloudRef = useRef(null);
  const cloudRevisionRef = useRef(-1);

  // Refs para que el guardado lea siempre los valores más recientes.
  const dataRef = useRef({ schedule, watchedList, watchLater, customLists });
  useEffect(() => {
    dataRef.current = { schedule, watchedList, watchLater, customLists };
  }, [schedule, watchedList, watchLater, customLists]);

  // Record that the cloud holds exactly `json` for `uid`.
  const markSynced = useCallback((uid, json) => {
    lastSyncedRef.current = json;
    setSyncedJson(json);
    syncBaseRef.current = hashLibrary(JSON.parse(json));
    writeSyncBase(uid, syncBaseRef.current);
  }, []);

  // Pausa el guardado y muestra la revisión: no se elige un lado en silencio.
  const blockConflict = useCallback((cloud) => {
    const input = { base: syncBaseRef.current, local: dataRef.current, cloud, requireReview: requireReviewRef.current };
    const decision = inspectCloudSnapshot(input);
    conflictRef.current = input;
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
    setSyncConflict({ conflicts: decision.conflicts, storageError: false });
    setSyncing(false);
  }, []);

  const resolveConflict = useCallback((choice) => {
    const pending = conflictRef.current;
    const uid = hasLoadedUser.current;
    if (!pending || !uid) return;
    const input = { ...pending, local: dataRef.current };
    try {
      // El checkpoint va primero: si falla (cuota), no se resuelve nada.
      checkpointSync(uid, { ...input, choice });
    } catch {
      setSyncConflict({ conflicts: inspectCloudSnapshot(input).conflicts, storageError: true });
      return;
    }
    const next = chooseSyncConflicts(input, choice);
    conflictRef.current = null;
    requireReviewRef.current = false;
    setSyncConflict(null);
    setSyncError(false);
    setSyncTooLarge(false);
    markSynced(uid, serializeData(input.cloud));
    dataRef.current = next;
    setSchedule(next.schedule); setWatchedList(next.watchedList);
    setWatchLater(next.watchLater); setCustomLists(next.customLists);
    if (serializeData(next) !== lastSyncedRef.current) {
      setSyncing(true);
      syncTimer.current = setTimeout(() => { syncTimer.current = null; flushSaveRef.current?.(); }, 0);
    }
  }, [markSynced, setSchedule, setWatchedList, setWatchLater, setCustomLists]);

  const downloadRecovery = useCallback(() => {
    const uid = hasLoadedUser.current || ownerRef.current;
    if (!uid) return;
    const pending = conflictRef.current;
    const text = exportSyncRecovery(uid, { ...pending, local: dataRef.current, base: syncBaseRef.current });
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'anitracker-recuperacion.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  // Returns 'ok', 'error', 'too-large', 'conflict' or 'committed-conflict'.
  const saveToCloud = useCallback(async (uid, json) => {
    const { firebaseDb, db } = getAuthHandles();
    if (!firebaseDb || !db || !uid) return 'error';
    const session = sessionRef.current;
    setSavePending(true);
    setSyncing(true);
    try {
      // La transacción lee la nube y la fusiona contra `base` en el servidor:
      // así una escritura entera no pisa lo que hizo otro dispositivo entre el
      // snapshot del listener y el commit.
      const saved = await saveMergedLibrary({
        fs: firebaseDb, db, uid, local: JSON.parse(json), base: syncBaseRef.current,
        isCurrent: () => session === sessionRef.current,
      });
      if (session !== sessionRef.current) return 'error';
      cloudRevisionRef.current = saved.syncRevision;
      // Rebase edits made while the transaction was running onto its result.
      const rebaseBase = hashLibrary(JSON.parse(json));
      const rebased = inspectCloudSnapshot({
        base: rebaseBase, local: dataRef.current, cloud: JSON.parse(saved.json),
      });
      if (rebased.action === 'conflict') {
        // Keep the pre-commit local snapshot as the comparison base across
        // reloads; advancing to the committed cloud would hide this conflict.
        syncBaseRef.current = rebaseBase;
        writeSyncBase(uid, rebaseBase);
        blockConflict(JSON.parse(saved.json));
        return 'committed-conflict';
      }
      const next = rebased.data;
      markSynced(uid, saved.json);
      dataRef.current = next;
      setSchedule(next.schedule);
      setWatchedList(next.watchedList);
      setWatchLater(next.watchLater);
      setCustomLists(next.customLists);
      setSyncing(false);
      return 'ok';
    } catch (e) {
      if (session !== sessionRef.current) return 'error';
      if (e instanceof SyncConflictError) { blockConflict(e.cloud); return 'conflict'; }
      console.error('Save error:', e);
      setSyncing(false);
      return e instanceof LibraryTooLargeError ? 'too-large' : 'error';
    } finally {
      if (session === sessionRef.current) setSavePending(false);
    }
  }, [markSynced, blockConflict, setSchedule, setWatchedList, setWatchLater, setCustomLists]);

  const scheduleSave = useCallback((delay) => {
    if (conflictRef.current) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    setSyncing(true);
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
    if (conflictRef.current) return false;
    const uid = hasLoadedUser.current;
    if (!uid || lastSyncedRef.current === null) return false;
    const json = serializeData(dataRef.current);
    if (json === lastSyncedRef.current) { setSyncing(false); return true; }
    const session = sessionRef.current;
    if (inFlightRef.current?.session === session) return inFlightRef.current.promise;
    const flight = { session, pending: null, promise: null };
    inFlightRef.current = flight;
    flight.promise = (async () => {
      const result = await saveToCloud(uid, json);
      if (inFlightRef.current === flight) inFlightRef.current = null;
      if (session !== sessionRef.current) return false;
      // A listener event received before our commit must not roll it back.
      // Outside a write, Firestore delivers snapshots in order; accept a new
      // document whose revision restarted after deletion as well.
      if (flight.sawDeletion) {
        // Deletions have no revision. They may happen after the transaction
        // committed but before its promise resolves. Read the server again
        // instead of comparing a synthetic old revision and losing deletion.
        retrySyncRef.current?.();
        return false;
      }
      const pendingRevision = flight.pending?.syncRevision || 0;
      const committed = result === 'ok' || result === 'committed-conflict';
      if (flight.pending && (!committed || pendingRevision >= cloudRevisionRef.current)) {
        applyCloudRef.current?.(uid, flight.pending);
      }
      if (result === 'conflict' || result === 'committed-conflict' || conflictRef.current) return false;
      if (result === 'ok') {
        saveAttempts.current = 0;
        setSyncError(false);
        setSyncTooLarge(false);
        if (serializeData(dataRef.current) !== lastSyncedRef.current) scheduleSave(0);
        return true;
      }
      setSyncError(true);
      if (result === 'too-large') {
        // Reintentar no cambia nada: el próximo intento llega con la próxima edición.
        setSyncTooLarge(true);
        return false;
      }
      saveAttempts.current += 1;
      const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(saveAttempts.current - 1, 4));
      scheduleSave(delay);
      return false;
    })();
    return flight.promise;
  }, [saveToCloud, scheduleSave]);
  useEffect(() => { flushSaveRef.current = flushSave; }, [flushSave]);

  // Apply a cloud snapshot to local state. We compute the exact object we put
  // into state and record its serialization in `lastSyncedRef`, so the
  // re-render this triggers is recognized by the auto-sync effect as an echo of
  // the load (equal serialization) and is never saved back — no loop, and no
  // dependence on React's batching/microtask timing.
  //
  // When both sides changed since the last sync, the libraries are merged
  // anime by anime (syncMerge.ts) and the result is pushed back up.
  const applyCloudData = useCallback((uid, data) => {
    const revision = Number.isSafeInteger(data.syncRevision) ? data.syncRevision : 0;
    if (inFlightRef.current?.session === sessionRef.current) {
      if (data._documentDeleted) inFlightRef.current.sawDeletion = true;
      inFlightRef.current.pending = data;
      return;
    }
    cloudRevisionRef.current = revision;
    const latest = dataRef.current;
    let cloud;
    try { cloud = readCloudLibrary(data); } catch (error) {
      console.error('Cloud data error:', error);
      setSyncError(true);
      return;
    }
    // Lo sincronizado es lo que hay de verdad en la nube; la fusión trabaja
    // con los ids nuevos. Si la nube tenía ids viejos (la subió un dispositivo
    // sin actualizar), el resultado difiere de lo sincronizado y se vuelve a
    // subir ya migrado.
    const cloudJson = serializeData(cloud);
    const { action, data: next } = inspectCloudSnapshot({
      base: syncBaseRef.current,
      local: latest,
      cloud: migrateLibrary(cloud).data,
      requireReview: requireReviewRef.current,
    });
    if (action === 'conflict') { blockConflict(migrateLibrary(cloud).data); return; }
    conflictRef.current = null;
    setSyncConflict(null);
    requireReviewRef.current = false;
    markSynced(uid, cloudJson);
    if (action === 'keep') {
      // Only this device changed since the last sync: push it up.
      scheduleSave(0);
      return;
    }
    // 'apply' puts the cloud data in state (an echo, never saved back);
    // 'merge' puts the fusion, which differs from the cloud and gets saved.
    dataRef.current = next;
    setSchedule(next.schedule);
    setWatchedList(next.watchedList);
    setWatchLater(next.watchLater);
    setCustomLists(next.customLists);
  }, [setSchedule, setWatchedList, setWatchLater, setCustomLists, scheduleSave, markSynced, blockConflict]);

  useEffect(() => { applyCloudRef.current = applyCloudData; }, [applyCloudData]);

  // Subscribe to the user's cloud doc in real time. The first snapshot acts as
  // the initial load; every later snapshot keeps this device in sync with
  // changes made on other devices (the whole point — without this, an already
  // open tab never sees edits made elsewhere until a full reload).
  const subscribeToCloud = useCallback((uid) => {
    const { firebaseDb, db } = getAuthHandles();
    if (!firebaseDb || !db || !uid) return;
    // Tear down any previous subscription (e.g. when switching accounts).
    if (cloudUnsub.current) { cloudUnsub.current(); cloudUnsub.current = null; }
    if (readRetryTimer.current) clearTimeout(readRetryTimer.current);
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
    const session = ++sessionRef.current;
    setSavePending(false);
    cloudRevisionRef.current = -1;
    lastSyncedRef.current = null;
    setSyncedJson(null);
    conflictRef.current = null;
    setSyncConflict(null);
    syncBaseRef.current = readSyncBase(uid);
    try {
      // Un dispositivo que ya tenía esta cuenta pero perdió su base no debe
      // pisar la nube sin revisión.
      requireReviewRef.current = !syncBaseRef.current && (initialAccount?.owner === uid || !!localStorage.getItem(`anitracker-account:${uid}`));
      const next = selectLibraryAccount(uid, ownerRef.current, dataRef.current, localRevRef.current);
      const switching = ownerRef.current && ownerRef.current !== uid;
      ownerRef.current = uid;
      localRevRef.current = next.rev;
      if (switching) {
        window.dispatchEvent(new Event('anitracker-account-changed'));
        // Update refs before subscribing: even a synchronous callback must see
        // only this account's library and edit timestamp.
        dataRef.current = next.data;
        prevJsonRef.current = serializeData(next.data);
        setSchedule(next.data.schedule);
        setWatchedList(next.data.watchedList);
        setWatchLater(next.data.watchLater);
        setCustomLists(next.data.customLists);
        try {
          if (next.rev) localStorage.setItem(LOCAL_REV_KEY, next.rev);
          else localStorage.removeItem(LOCAL_REV_KEY);
        } catch { /* canonical account snapshot contains the revision */ }
      }
    } catch {
      setSyncError(true);
      setSyncing(false);
      setCloudLoaded(true);
      return;
    }
    setSyncing(true);
    setCloudLoaded(false);
    cloudUnsub.current = firebaseDb.onSnapshot(
      firebaseDb.doc(db, 'users', uid),
      { includeMetadataChanges: true },
      (snap) => {
        if (session !== sessionRef.current) return;
        // Skip echoes of our own not-yet-acked local writes: applying them is a
        // no-op and only risks a save loop. We still apply the server-confirmed
        // version (hasPendingWrites === false), which is harmless for our own
        // writes and is exactly what we want for remote changes.
        if (snap.metadata.hasPendingWrites) return;
        // A cache miss is not proof that the server document is empty. Wait
        // for an authoritative snapshot before advancing the persisted base.
        if (snap.metadata.fromCache) { setCloudLoaded(true); return; }
        const seq = ++snapshotSeq.current;
        setSyncError(false);
        if (snap.exists()) {
          const data = snap.data();
          if (isCompressedDoc(data)) {
            // Large libraries travel gzipped (cloudCodec.ts). Decoding is async:
            // drop the result if a newer snapshot or another session got in.
            decodeLibrary(data).then((fields) => {
              if (session !== sessionRef.current || seq !== snapshotSeq.current) return;
              applyCloudData(uid, { ...fields, syncRevision: data.syncRevision, updatedAtIso: data.updatedAtIso });
              setSyncing(false);
              setCloudLoaded(true);
            }).catch((e) => {
              if (session !== sessionRef.current) return;
              console.error('Cloud decode error:', e);
              setSyncing(false);
              setCloudLoaded(true);
              setSyncError(true);
            });
            return;
          }
          applyCloudData(uid, data);
        } else {
          // A deleted document is an empty remote library, even after login.
          applyCloudData(uid, { ...JSON.parse(EMPTY_SYNC_JSON), syncRevision: Math.max(0, cloudRevisionRef.current), _documentDeleted: true });
        }
        setSyncing(false);
        setCloudLoaded(true);
      },
      (e) => {
        if (session !== sessionRef.current) return;
        console.error('Snapshot error:', e);
        setSyncing(false);
        setCloudLoaded(true);
        setSyncError(true);
        // A failed listener is terminal in Firestore. Recreate it explicitly.
        readRetryTimer.current = setTimeout(() => retrySyncRef.current?.(), RETRY_MAX_MS);
      }
    );
  }, [applyCloudData, initialAccount, setSchedule, setWatchedList, setWatchLater, setCustomLists]);

  const retrySync = useCallback(() => {
    if (hasLoadedUser.current) subscribeToCloud(hasLoadedUser.current);
  }, [subscribeToCloud]);
  useEffect(() => { retrySyncRef.current = retrySync; }, [retrySync]);

  const unsubscribeFromCloud = useCallback(() => {
    sessionRef.current += 1;
    setSavePending(false);
    if (readRetryTimer.current) clearTimeout(readRetryTimer.current);
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
    if (cloudUnsub.current) { cloudUnsub.current(); cloudUnsub.current = null; }
    hasLoadedUser.current = null;
    lastSyncedRef.current = null;
    setSyncedJson(null);
    conflictRef.current = null;
    setSyncConflict(null);
    syncBaseRef.current = null;
    saveAttempts.current = 0;
    setSyncError(false);
    setSyncTooLarge(false);
    setSyncing(false);
    setCloudLoaded(false);
  }, []);

  /**
   * Reacciona a un cambio de usuario de Firebase: al entrar (la primera vez en
   * esta sesión) abre la suscripción; al salir la cierra. El guard de uid evita
   * suscribirse dos veces cuando getRedirectResult y onAuthStateChanged avisan
   * del mismo usuario.
   */
  const handleAuthUser = useCallback((u) => {
    if (u) {
      if (hasLoadedUser.current !== u.uid) {
        hasLoadedUser.current = u.uid;
        subscribeToCloud(u.uid);
      }
    } else {
      unsubscribeFromCloud();
    }
  }, [subscribeToCloud, unsubscribeFromCloud]);

  /**
   * Antes de cerrar sesión: drena lo pendiente (esperando como mucho
   * LOGOUT_FLUSH_TIMEOUT_MS). Devuelve `true` si quedó algo sin subir.
   */
  const prepareLogout = useCallback(async () => {
    let unsynced = !!conflictRef.current;
    if (hasLoadedUser.current && lastSyncedRef.current !== null
      && serializeData(dataRef.current) !== lastSyncedRef.current) {
      if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
      const timeout = new Promise((resolve) => { setTimeout(() => resolve(false), LOGOUT_FLUSH_TIMEOUT_MS); });
      const session = sessionRef.current;
      const drain = async () => {
        do {
          if (!(await flushSave()) || session !== sessionRef.current) return false;
        } while (serializeData(dataRef.current) !== lastSyncedRef.current);
        return true;
      };
      unsynced = !(await Promise.race([drain(), timeout]));
    }
    return unsynced;
  }, [flushSave]);

  /** Guarda la biblioteca de la cuenta activa en su ranura local. */
  const persistAccount = useCallback(() => {
    persistAccountLibrary(ownerRef.current, dataRef.current, localRevRef.current);
  }, []);

  /** Corta timers y suscripción al desmontar (sin tocar el estado de React). */
  const dispose = useCallback(() => {
    sessionRef.current += 1;
    if (readRetryTimer.current) clearTimeout(readRetryTimer.current);
    if (cloudUnsub.current) { cloudUnsub.current(); cloudUnsub.current = null; }
    if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
  }, []);

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
      localRevRef.current = new Date().toISOString();
      try { localStorage.setItem(LOCAL_REV_KEY, localRevRef.current); } catch { /* best-effort */ }
    }
    try {
      persistAccountLibrary(ownerRef.current, { schedule, watchedList, watchLater, customLists }, localRevRef.current);
      window.dispatchEvent(new CustomEvent('anitracker-storage-restored', { detail: { key: 'anitracker-account-state' } }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('anitracker-storage-error', { detail: { key: 'anitracker-account-state', error } }));
    }

    if (!isSignedIn) return;
    if (conflictRef.current) { blockConflict(conflictRef.current.cloud); return; }
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
  }, [schedule, watchedList, watchLater, customLists, isSignedIn, scheduleSave, blockConflict]);

  // Flush a pending save when the tab is hidden or unloaded. The 2s debounce
  // above can be lost on mobile (iOS suspends timers when the app is
  // backgrounded), so an edit made right before locking the phone / switching
  // apps would never reach the cloud. Saving on `visibilitychange`/`pagehide`
  // gives the write a chance to go out while the page is still alive.
  // Los listeners de conexión se mantienen siempre: el estado `online` importa
  // también con la sesión cerrada.
  useEffect(() => {
    const flush = () => {
      if (!isSignedIn) return;
      if (syncTimer.current) { clearTimeout(syncTimer.current); syncTimer.current = null; }
      flushSaveRef.current?.(); // no-op if already in sync
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    const onOnline = () => { setOnline(true); retrySyncRef.current?.(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [isSignedIn]);

  const currentJson = serializeData({ schedule, watchedList, watchLater, customLists });
  const syncStatus = !online ? 'offline' : syncConflict ? 'conflict'
    : syncError || savePending || !cloudLoaded || currentJson !== syncedJson ? 'pending' : 'synced';

  return {
    cloudLoaded,
    syncing,
    syncError,
    syncTooLarge,
    syncStatus,
    syncConflict,
    resolveConflict,
    downloadRecovery,
    retrySync,
    handleAuthUser,
    unsubscribeFromCloud,
    prepareLogout,
    persistAccount,
    dispose,
  };
}
