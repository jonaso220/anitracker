const keyFor = uid => `anitracker-sync-recovery:${uid}`;

// Keep earlier recovery points. Never silently discard a checkpoint to make
// room; a quota failure blocks the choice and lets the user export instead.
export function checkpointSync(uid, input) {
  const key = keyFor(uid);
  const records = JSON.parse(localStorage.getItem(key) || '[]');
  if (!Array.isArray(records)) throw new Error('Invalid recovery history');
  const payload = JSON.stringify(input);
  if (records.at(-1)?.payload === payload) return;
  records.push({ at: new Date().toISOString(), payload });
  localStorage.setItem(key, JSON.stringify(records));
}

export function exportSyncRecovery(uid, current) {
  // Preserve even an unreadable historical value verbatim for recovery.
  return JSON.stringify({ app: 'anitracker-sync-recovery', version: 1, owner: uid,
    exportedAt: new Date().toISOString(), current,
    recoveryHistory: localStorage.getItem(keyFor(uid)),
  }, null, 2);
}
