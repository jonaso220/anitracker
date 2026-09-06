import { beforeEach, it, expect } from 'vitest';
import { emptyLibrary, readActiveLibrary, selectLibraryAccount, persistAccountLibrary } from '../accountStorage';

beforeEach(() => localStorage.clear());
it('migrates the existing guest library without changing it', () => {
  const data={...emptyLibrary(), watchedList:[{id:1}]};
  expect(selectLibraryAccount('A',null,data,'2026-09-06').data).toEqual(data);
});
it('restores each account after a reload, regardless of stale legacy keys', () => {
  const dataA={...emptyLibrary(),watchedList:[{id:1}]};
  selectLibraryAccount('A',null,dataA,'2026-09-01');
  selectLibraryAccount('B','A',dataA,'2026-09-01');
  localStorage.setItem('watchedAnimes',JSON.stringify(dataA.watchedList));
  const active=readActiveLibrary();
  expect(active.owner).toBe('B');
  expect(active.data.watchedList).toEqual([]);
  const back=selectLibraryAccount('A',active.owner,active.data,active.rev);
  expect(back.data).toEqual(dataA);
  expect(back.rev).toBe('2026-09-01');
});
it('persists offline changes under their existing owner', () => {
  const data={...emptyLibrary(),watchedList:[{id:9}]};
  persistAccountLibrary('A',data,'2026-09-06');
  expect(readActiveLibrary()).toEqual({owner:'A',data,rev:'2026-09-06'});
});
