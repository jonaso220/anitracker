import { decodeLibrary, encodeLibrary, isCompressedDoc } from './cloudCodec';
import { migrateLibrary } from './idMigration';
import { inspectCloudSnapshot } from './syncMerge';

// Independent of the service-worker cache and the library schema. The proposed
// server fence requires this marker AND the next revision on every write.
export const SYNC_PROTOCOL = 3;

export class SyncConflictError extends Error {
  constructor(cloud, conflicts) {
    super('Sync conflict requires a choice');
    this.name = 'SyncConflictError';
    this.cloud = cloud;
    this.conflicts = conflicts;
  }
}

export const serializeLibrary = (data) => JSON.stringify({
  schedule: data.schedule, watchedList: data.watchedList,
  watchLater: data.watchLater, customLists: data.customLists,
});
export const emptyCloudLibrary = () => ({ schedule: {}, watchedList: [], watchLater: [], customLists: [] });

// Missing fields are empty, never copied from another device's stale library.
export function readCloudLibrary(data) {
  return Object.fromEntries(Object.entries(emptyCloudLibrary()).map(([key, fallback]) => {
    const value = data?.[key];
    return [key, value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value];
  }));
}

// Freeze the user's intent and its base across all Firestore retries. Reading
// inside the transaction prevents a whole-library write from losing another
// device's changes between the listener snapshot and the commit.
export async function saveMergedLibrary({ fs, db, uid, local, base, isCurrent }) {
  const ref = fs.doc(db, 'users', uid);
  return fs.runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!isCurrent()) throw new Error('Sync session changed');
    const document = snap.exists() ? snap.data() : {};
    const previousRevision = Object.hasOwn(document, 'syncRevision') ? document.syncRevision : 0;
    if (!Number.isSafeInteger(previousRevision) || previousRevision < 0 || previousRevision >= Number.MAX_SAFE_INTEGER) {
      throw new Error('Invalid cloud sync revision; recovery required');
    }
    if (Object.hasOwn(document, 'syncProtocol') && document.syncProtocol !== SYNC_PROTOCOL) {
      throw new Error('Unsupported cloud sync protocol; update required');
    }
    const raw = isCompressedDoc(document) ? await decodeLibrary(document) : readCloudLibrary(document);
    const cloud = migrateLibrary(raw).data;
    const decision = inspectCloudSnapshot({ base, local, cloud });
    if (decision.action === 'conflict') throw new SyncConflictError(cloud, decision.conflicts);
    const merged = decision.data;
    const json = serializeLibrary(merged);
    const updatedAtIso = new Date().toISOString();
    const library = await encodeLibrary(json, updatedAtIso, fs);
    if (!isCurrent()) throw new Error('Sync session changed');
    const syncRevision = previousRevision + 1;
    const payload = { schemaVersion: 2, ...library, syncProtocol: SYNC_PROTOCOL, syncProtocolRevision: syncRevision, syncRevision, updatedAtIso, updatedAt: fs.serverTimestamp() };
    // Replace each library field, including empty schedule maps, while retaining
    // unrelated document fields. Recursive merge could retain removed days.
    transaction.set(ref, payload, { mergeFields: Object.keys(payload) });
    return { json, syncRevision };
  });
}
