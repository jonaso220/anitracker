import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashLibrary, inspectCloudSnapshot, chooseSyncConflicts } from '../syncMerge';
import { MAX_RECOVERY_CHECKPOINTS, checkpointSync, exportSyncRecovery } from '../syncRecovery';
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
  it(`keeps only the last ${MAX_RECOVERY_CHECKPOINTS} checkpoints per account`, () => {
    for (let ep = 1; ep <= MAX_RECOVERY_CHECKPOINTS + 2; ep++) {
      checkpointSync('A', { local: lib([entry(ep)]) });
    }
    checkpointSync('B', { local: lib([entry(99)]) });
    const history = JSON.parse(localStorage.getItem('anitracker-sync-recovery:A'));
    expect(history).toHaveLength(MAX_RECOVERY_CHECKPOINTS);
    expect(history.map(r => JSON.parse(r.payload).local.watchedList[0].currentEp)).toEqual([3, 4, 5]);
    expect(JSON.parse(localStorage.getItem('anitracker-sync-recovery:B'))).toHaveLength(1);
  });
  it('on quota, drops older checkpoints until the new one fits', () => {
    checkpointSync('A', { local: lib([entry(1)]) });
    checkpointSync('A', { local: lib([entry(2)]) });
    const set = Storage.prototype.setItem;
    // Simula una cuota que solo admite un registro.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
      if (key.startsWith('anitracker-sync-recovery:') && JSON.parse(value).length > 1) throw new Error('Quota');
      return set.call(this, key, value);
    });
    expect(() => checkpointSync('A', { local: lib([entry(3)]) })).not.toThrow();
    const history = JSON.parse(localStorage.getItem('anitracker-sync-recovery:A'));
    expect(history.map(r => JSON.parse(r.payload).local.watchedList[0].currentEp)).toEqual([3]);
  });
  it('throws only when even the new checkpoint alone does not fit', () => {
    checkpointSync('B', { local: lib([entry(1)]) });
    const before = localStorage.getItem('anitracker-sync-recovery:B');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    expect(() => checkpointSync('B', { local: lib([entry(2)]) })).toThrow('Quota');
    expect(localStorage.getItem('anitracker-sync-recovery:B')).toBe(before);
  });
  it.each(['corrupt-history', '{"not":"an array"}'])('replaces an unreadable history %s instead of throwing forever', raw => {
    localStorage.setItem('anitracker-sync-recovery:A', raw);
    // The export still carries the unreadable value verbatim before it is replaced.
    expect(JSON.parse(exportSyncRecovery('A', {})).recoveryHistory).toBe(raw);
    expect(() => checkpointSync('A', { choice: 'local' })).not.toThrow();
    expect(JSON.parse(localStorage.getItem('anitracker-sync-recovery:A'))).toHaveLength(1);
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

describe('concurrent moves of the same anime', () => {
  const week = (days) => ({ schedule: { Lunes: [], Martes: [], Miércoles: [], ...days }, watchedList: [], watchLater: [], customLists: [] });
  const x = { id: 1, title: 'Movida', currentEp: 3 };
  const where = (library) => [
    ...Object.entries(library.schedule).flatMap(([day, items]) => items.filter(a => a.id === 1).map(() => day)),
    ...library.watchedList.filter(a => a.id === 1).map(() => 'Vistas'),
    ...library.watchLater.filter(a => a.id === 1).map(() => 'Después'),
  ];
  it('two different moves pause as a placement conflict instead of duplicating', () => {
    const input = {
      base: hashLibrary(week({ Lunes: [x] })),
      local: week({ Martes: [x], Lunes: [{ id: 2 }] }),
      cloud: week({ Miércoles: [x], Martes: [{ id: 3 }] }),
    };
    const decision = inspectCloudSnapshot(input);
    expect(decision.action).toBe('conflict');
    expect(decision.conflicts).toEqual([{ key: 'p|1', kind: 'placement', label: 'Movida · Ubicación', local: 'Semana · Martes', cloud: 'Semana · Miércoles' }]);
    const local = chooseSyncConflicts(input, 'local');
    expect(where(local)).toEqual(['Martes']);
    const cloud = chooseSyncConflicts(input, 'cloud');
    expect(where(cloud)).toEqual(['Miércoles']);
    // Independent additions on both sides survive either choice.
    expect(cloud.schedule.Lunes.map(a => a.id)).toEqual([2]);
    expect(cloud.schedule.Martes.map(a => a.id)).toEqual([3]);
  });
  it('a move to Vistas against a move to another day is also a placement conflict', () => {
    const input = { base: hashLibrary(week({ Lunes: [x] })), local: { ...week({}), watchedList: [{ ...x, finished: true }] }, cloud: week({ Martes: [x] }) };
    expect(inspectCloudSnapshot(input).conflicts).toMatchObject([{ kind: 'placement', local: 'Vistas', cloud: 'Semana · Martes' }]);
    expect(where(chooseSyncConflicts(input, 'local'))).toEqual(['Vistas']);
    expect(where(chooseSyncConflicts(input, 'cloud'))).toEqual(['Martes']);
  });
  it('a move on one side only merges silently into one place', () => {
    const input = { base: hashLibrary(week({ Lunes: [x] })), local: week({ Martes: [x] }), cloud: week({ Lunes: [x], Miércoles: [{ id: 5 }] }) };
    const decision = inspectCloudSnapshot(input);
    expect(decision.conflicts).toEqual([]);
    expect(where(decision.data)).toEqual(['Martes']);
  });
  it('the same move on both sides is not a conflict', () => {
    const input = { base: hashLibrary(week({ Lunes: [x] })), local: week({ Martes: [x] }), cloud: week({ Martes: [x] }) };
    expect(inspectCloudSnapshot(input).action).toBe('apply');
  });
  it('a move against an edit in the original day keeps a single place whichever side wins', () => {
    const input = { base: hashLibrary(week({ Lunes: [x] })), local: week({ Martes: [x] }), cloud: week({ Lunes: [{ ...x, currentEp: 4 }] }) };
    expect(inspectCloudSnapshot(input).conflicts).toMatchObject([{ kind: 'deletion', key: 's:Lunes|1' }]);
    const cloud = chooseSyncConflicts(input, 'cloud');
    expect(where(cloud)).toEqual(['Lunes']);
    expect(cloud.schedule.Lunes[0].currentEp).toBe(4);
    expect(where(chooseSyncConflicts(input, 'local'))).toEqual(['Martes']);
  });
  it('custom lists do not count as a place', () => {
    const list = (items) => [{ id: 'fav', name: 'Fav', items }];
    const input = {
      base: hashLibrary({ ...week({ Lunes: [x] }), customLists: list([x]) }),
      local: { ...week({ Martes: [x] }), customLists: list([x]) },
      cloud: { ...week({ Lunes: [x] }), customLists: list([x]) },
    };
    expect(inspectCloudSnapshot(input).conflicts).toEqual([]);
  });
});
