import { describe, expect, it } from 'vitest';
import { hashLibrary, resolveCloudSnapshot, inspectCloudSnapshot, chooseSyncConflicts } from '../syncMerge';
import { hashLibrary as legacyHash, resolveCloudSnapshot as legacyResolve } from './fixtures/syncMerge-v28';
import { saveMergedLibrary } from '../cloudSync';
const lib = (watchedList = []) => ({ schedule: {}, watchedList, watchLater: [], customLists: [] });
const anime = (currentEp, userRating = 2) => ({ id: 1, title: 'Fictional compatibility fixture', currentEp, userRating });

describe('v28 versus unpublished transactional sync compatibility: release blockers and conflict policy', () => {
  it('KNOWN MIXED-VERSION RISK: v28 resurrects an offline-edited deletion and transactional sync accepts it as an addition', () => {
    const initial = lib([anime(1)]);
    const removed = lib();
    const oldUpload = legacyResolve({ base: legacyHash(initial), local: lib([anime(2)]), cloud: removed }).data;
    expect(oldUpload.watchedList).toEqual([anime(2)]);
    const newClient = resolveCloudSnapshot({ base: hashLibrary(removed), local: removed, cloud: oldUpload });
    expect(newClient.action).toBe('apply');
    expect(newClient.data.watchedList).toEqual([anime(2)]);
  });

  it('v28 hashes cannot infer fields: the cloud boundary pauses for an explicit migration choice', () => {
    const initial = lib([anime(1)]);
    const local = lib([anime(2)]);
    const cloud = lib([anime(1, 5)]);
    expect(resolveCloudSnapshot({ base: legacyHash(initial), local, cloud }).data.watchedList).toEqual([anime(2)]);
    expect(resolveCloudSnapshot({ base: hashLibrary(initial), local, cloud }).data.watchedList).toEqual([anime(2, 5)]);
    expect(inspectCloudSnapshot({ base: legacyHash(initial), local, cloud }).action).toBe('conflict');
    expect(chooseSyncConflicts({ base: legacyHash(initial), local, cloud }, 'cloud').watchedList).toEqual(cloud.watchedList);
  });

  it('legacy migration is lossless without concurrent edits; subsequent bases support fields', () => {
    const initial = lib([anime(1)]);
    const cloud = lib([anime(1, 5)]);
    const first = resolveCloudSnapshot({ base: legacyHash(initial), local: initial, cloud }).data;
    expect(first.watchedList).toEqual(cloud.watchedList);
    const next = resolveCloudSnapshot({ base: hashLibrary(first), local: lib([anime(2, 5)]), cloud: lib([anime(1, 4)]) });
    expect(next.data.watchedList).toEqual([anime(2, 4)]);
  });

  it.each([[3, 2], [2, 3]])('same field: %i then %i requires a choice, with no silent overwrite', async (first, last) => {
    const initial = lib([anime(1)]);
    let cloud = initial;
    const fs = {
      doc: () => 'users/fictional', deleteField: () => null, serverTimestamp: () => 'timestamp',
      runTransaction: async (_db, fn) => fn({
        get: async () => ({ exists: () => true, data: () => cloud }),
        set: (_ref, data) => { cloud = { ...cloud, ...data }; },
      }),
    };
    await saveMergedLibrary({ fs, db: {}, uid: 'fictional', local: lib([anime(first)]), base: hashLibrary(initial), isCurrent: () => true });
    await expect(saveMergedLibrary({ fs, db: {}, uid: 'fictional', local: lib([anime(last)]), base: hashLibrary(initial), isCurrent: () => true })).rejects.toThrow('Sync conflict');
    expect(cloud.watchedList[0].currentEp).toBe(first);
    expect(cloud.syncRevision).toBe(1);
  });

  it('concurrent +1 actions are state assignments, not additive increments', () => {
    const initial = lib([anime(1)]);
    const result = resolveCloudSnapshot({ base: hashLibrary(initial), local: lib([anime(2)]), cloud: lib([anime(2)]) });
    expect(result.data.watchedList[0].currentEp).toBe(2);
  });
});
