import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashLibrary, inspectCloudSnapshot, chooseSyncConflicts } from '../syncMerge';
import { checkpointSync, exportSyncRecovery } from '../syncRecovery';
import { readSyncBase } from '../accountStorage';
const lib = (watchedList = []) => ({ schedule: {}, watchedList, watchLater: [], customLists: [] });
const entry = (currentEp, userRating = 1) => ({ id: 1, title: 'Fixture', currentEp, userRating });
describe('protected conflict handling', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
  it('merges different fields automatically', () => {
    const input = { base: hashLibrary(lib([entry(1)])), local: lib([entry(2)]), cloud: lib([entry(1, 5)]) };
    expect(inspectCloudSnapshot(input).data.watchedList).toEqual([entry(2, 5)]);
    expect(inspectCloudSnapshot(input).conflicts).toEqual([]);
  });
  it.each(['local', 'cloud'])('choice %s affects only conflicting fields and preserves independent additions', choice => {
    const input = { base: hashLibrary(lib([entry(1)])), local: lib([entry(2), { id: 2 }]), cloud: lib([entry(3, 5), { id: 3 }]) };
    expect(inspectCloudSnapshot(input).conflicts).toMatchObject([{ key: 'w|1', field: 'currentEp', local: 2, cloud: 3 }]);
    const chosen = chooseSyncConflicts(input, choice).watchedList;
    expect(chosen.find(a => a.id === 1)).toEqual(entry(choice === 'local' ? 2 : 3, 5));
    expect(chosen.map(a => a.id).sort()).toEqual([1, 2, 3]);
  });
  it('deletion versus edit pauses; only an explicit local choice restores the entry', () => {
    const input = { base: hashLibrary(lib([entry(1)])), local: lib([entry(2)]), cloud: lib() };
    expect(inspectCloudSnapshot(input).action).toBe('conflict');
    expect(chooseSyncConflicts(input, 'cloud').watchedList).toEqual([]);
    expect(chooseSyncConflicts(input, 'local').watchedList).toEqual([entry(2)]);
  });
  it('missing base with existing local data pauses even when the server is empty', () => {
    expect(inspectCloudSnapshot({ base: null, local: lib([entry(2)]), cloud: lib() }).action).toBe('conflict');
    expect(inspectCloudSnapshot({ base: null, local: lib(), cloud: lib([entry(2)]), requireReview: true }).action).toBe('conflict');
    expect(inspectCloudSnapshot({ base: null, local: lib(), cloud: lib([entry(2)]) }).action).toBe('apply');
  });
  it('two identical +1 states coalesce; intentional decreases are not replaced with maximum', () => {
    const base = hashLibrary(lib([entry(5)]));
    expect(inspectCloudSnapshot({ base, local: lib([entry(6)]), cloud: lib([entry(6)]) }).action).toBe('apply');
    expect(inspectCloudSnapshot({ base, local: lib([entry(4)]), cloud: lib([entry(6)]) }).action).toBe('conflict');
  });
  it('recovery history retains both snapshots across choices and isolates accounts', () => {
    const input = { base: hashLibrary(lib([entry(1)])), local: lib([entry(2)]), cloud: lib([entry(3)]) };
    checkpointSync('A', input); checkpointSync('A', input);
    checkpointSync('A', { ...input, choice: 'cloud' });
    const exported = JSON.parse(exportSyncRecovery('A', input));
    expect(JSON.parse(exported.recoveryHistory)).toHaveLength(2);
    expect(exported.current.local.watchedList[0].currentEp).toBe(2);
    expect(exported.current.cloud.watchedList[0].currentEp).toBe(3);
    expect(JSON.parse(exportSyncRecovery('B', {})).recoveryHistory).toBeNull();
  });
  it('quota and corrupt history throw instead of deleting recovery records', () => {
    localStorage.setItem('anitracker-sync-recovery:A', 'corrupt-history');
    expect(() => checkpointSync('A', {})).toThrow();
    expect(JSON.parse(exportSyncRecovery('A', {})).recoveryHistory).toBe('corrupt-history');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    expect(() => checkpointSync('B', {})).toThrow('Quota');
  });
  it.each(['{}', '{"o|w":null}', '[]', 'null'])('an invalid persisted base %s requires migration review', raw => {
    localStorage.setItem('anitracker-sync-base:A', raw);
    expect(readSyncBase('A')).toBeNull();
  });
  it.each(['edit', 'addition'])('list deletion versus local %s is resolved with metadata and items together', change => {
    const initial = { ...lib(), customLists: [{ id: 'favorites', name: 'Favoritos', items: [entry(1)] }] };
    const local = { ...lib(), customLists: [{ id: 'favorites', name: 'Favoritos', items: change === 'edit' ? [entry(2)] : [entry(1), { id: 2 }] }] };
    const input = { base: hashLibrary(initial), local, cloud: lib() };
    expect(inspectCloudSnapshot(input).conflicts).toMatchObject([{ kind: 'list-deletion' }]);
    expect(chooseSyncConflicts(input, 'local').customLists).toEqual(local.customLists);
    expect(chooseSyncConflicts(input, 'cloud').customLists).toEqual([]);
    const reversed = { base: input.base, local: input.cloud, cloud: local };
    expect(chooseSyncConflicts(reversed, 'cloud').customLists).toEqual(local.customLists);
  });
});
