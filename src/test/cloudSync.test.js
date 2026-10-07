import { describe, expect, it, vi } from 'vitest';
import { saveMergedLibrary, serializeLibrary, readCloudLibrary } from '../cloudSync';
import { hashLibrary } from '../syncMerge';
import { gzipString } from '../cloudCodec';
const lib = (watchedList = []) => ({ schedule: {}, watchedList, watchLater: [], customLists: [] });
function harness(documents) {
  const writes = [];
  const fs = {
    doc: (_db, _collection, uid) => ({ uid }), deleteField: () => '__delete__',
    serverTimestamp: () => 'server-ts', Bytes: { fromUint8Array: bytes => ({ toUint8Array: () => bytes }) },
    runTransaction: async (_db, update) => {
      let result;
      for (const document of documents) {
        result = await update({ get: async () => ({ exists: () => document != null, data: () => document }), set: (...args) => writes.push(args) });
      }
      return result;
    },
  };
  return { fs, writes };
}
describe('saveMergedLibrary', () => {
  it('rebases against the new server state on every transaction retry', async () => {
    const original = lib([{ id: 1, currentEp: 1 }]);
    const local = lib([{ id: 1, currentEp: 2 }]);
    const { fs, writes } = harness([original, { ...original, watchedList: [...original.watchedList, { id: 2 }], syncRevision: 4 }]);
    const result = await saveMergedLibrary({ fs, db: {}, uid: 'fictional', local, base: hashLibrary(original), isCurrent: () => true });
    expect(JSON.parse(result.json).watchedList).toEqual([{ id: 1, currentEp: 2 }, { id: 2 }]);
    expect(result.syncRevision).toBe(5);
    expect(writes[1][1].syncProtocol).toBe(3);
    expect(writes[1][1].syncProtocolRevision).toBe(5);
    expect(writes[1][2].mergeFields).toContain('syncProtocol');
    expect(writes[1][2].mergeFields).toContain('schedule');
  });
  it('reads a compressed server library before merging', async () => {
    const original = lib([{ id: 1 }]);
    const bytes = await gzipString(serializeLibrary(original));
    const { fs } = harness([{ libraryGz: bytes, libraryGzRev: 'a', updatedAtIso: 'a' }]);
    const result = await saveMergedLibrary({ fs, db: {}, uid: 'fictional', local: lib([{ id: 2 }]), base: hashLibrary(lib()), isCurrent: () => true });
    expect(JSON.parse(result.json).watchedList.map(a => a.id).sort()).toEqual([1, 2]);
  });
  it('aborts before writing when the active account changes', async () => {
    const { fs, writes } = harness([lib()]);
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    await expect(saveMergedLibrary({ fs, db: {}, uid: 'fictional', local: lib([{ id: 1 }]), base: hashLibrary(lib()), isCurrent })).rejects.toThrow('Sync session changed');
    expect(writes).toEqual([]);
  });
  it('rejects malformed legacy JSON instead of treating it as an empty cloud library', () => {
    expect(() => readCloudLibrary({ watchedList: '{broken' })).toThrow();
  });
  it.each([null, -1, 1.5, '4', Number.MAX_SAFE_INTEGER])('does not reset invalid/exhausted revision %s', async (syncRevision) => {
    const { fs, writes } = harness([{ ...lib(), syncRevision }]);
    await expect(saveMergedLibrary({ fs, db: {}, uid: 'fictional', local: lib(), base: null, isCurrent: () => true })).rejects.toThrow('Invalid cloud sync revision');
    expect(writes).toEqual([]);
  });
  it('does not downgrade a future protocol', async () => {
    const { fs, writes } = harness([{ ...lib(), syncRevision: 10, syncProtocol: 4 }]);
    await expect(saveMergedLibrary({ fs, db: {}, uid: 'fictional', local: lib(), base: null, isCurrent: () => true })).rejects.toThrow('Unsupported cloud sync protocol');
    expect(writes).toEqual([]);
  });
  it('bootstraps a legacy document with protocol 3 revision 1 without losing remote entries', async () => {
    const { fs, writes } = harness([lib([{ id: 1 }])]);
    await saveMergedLibrary({ fs, db: {}, uid: 'fictional', local: lib([{ id: 2 }]), base: hashLibrary(lib()), isCurrent: () => true });
    expect(writes[0][1]).toMatchObject({ syncProtocol: 3, syncRevision: 1 });
    expect(writes[0][1].watchedList).toEqual(expect.arrayContaining([{ id: 1 }, { id: 2 }]));
  });
});
