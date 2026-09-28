import { describe, it, expect, beforeEach } from 'vitest';
import {
  anilistInternalId, migrateAnime, migrateLibrary, migrateList, migrateDiscoveryIds, ANILIST_ID_BASE,
} from '../idMigration';
import { toAnime, anilistIdsOf } from '../services/anilistService';
import { toAnime as tvmazeToAnime } from '../services/tvmazeService';
import { parseBackup } from '../utils';
import { readActiveLibrary } from '../accountStorage';
import { daysOfWeek } from '../constants';

// El par que chocaba: AniList 150000 sin MAL (300000 + 150000) y TVMaze 50000 (400000 + 50000).
const oldDonghua = { id: 450000, source: 'AniList', sourceKey: 'anilist:150000', title: 'Donghua sin MAL' };
const tvmazeShow = { id: 450000, source: 'TVMaze', sourceKey: 'tvmaze:50000', title: 'Serie de TVMaze' };
const week = (days = {}) => Object.fromEntries(daysOfWeek.map((d) => [d, days[d] || []]));

describe('ids de AniList sin MAL', () => {
  it('desde el id 100000 van a un rango propio; los anteriores y los con MAL no cambian', () => {
    expect(anilistInternalId(150000, null)).toBe(ANILIST_ID_BASE + 150000);
    expect(anilistInternalId(5000, null)).toBe(305000);
    expect(anilistInternalId(150000, 52991)).toBe(52991);
  });

  it('toAnime ya no choca con TVMaze', () => {
    const anilist = toAnime({ id: 150000, idMal: null, title: { romaji: 'Donghua' }, coverImage: {}, synonyms: [] });
    const tvmaze = tvmazeToAnime({ id: 50000, name: 'Serie' });
    expect(anilist.id).toBe(ANILIST_ID_BASE + 150000);
    expect(anilist.id).not.toBe(tvmaze.id);
    expect(anilistIdsOf(anilist)).toEqual({ anilistId: 150000, malId: null });
  });
});

describe('migrateAnime', () => {
  it('pasa al rango nuevo solo lo que es de AniList por sourceKey', () => {
    expect(migrateAnime(oldDonghua).id).toBe(ANILIST_ID_BASE + 150000);
    expect(migrateAnime(tvmazeShow)).toBe(tvmazeShow);
    const legacyTvmaze = { id: 450000, title: 'Sin sourceKey (TVMaze viejo)' };
    expect(migrateAnime(legacyTvmaze)).toBe(legacyTvmaze);
  });

  it('no toca los de id AniList < 100000 ni los que tienen id de MAL', () => {
    const small = { id: 305000, sourceKey: 'anilist:5000' };
    const withMal = { id: 52991, sourceKey: 'anilist:154587', malId: 52991 };
    expect(migrateAnime(small)).toBe(small);
    expect(migrateAnime(withMal)).toBe(withMal);
  });

  it('es idempotente', () => {
    const once = migrateAnime(oldDonghua);
    expect(migrateAnime(once)).toBe(once);
  });
});

describe('migrateLibrary', () => {
  it('separa el par que chocaba y conserva todo lo demás', () => {
    const { data, changed } = migrateLibrary({
      schedule: week({ Lunes: [oldDonghua] }),
      watchedList: [],
      watchLater: [tvmazeShow],
      customLists: [{ id: 'l', name: 'Favs', items: [oldDonghua, tvmazeShow] }],
    });
    expect(changed).toBe(true);
    expect(data.schedule.Lunes[0].id).toBe(ANILIST_ID_BASE + 150000);
    expect(data.watchLater[0]).toBe(tvmazeShow);
    expect(data.customLists[0].items.map((a) => a.id)).toEqual([ANILIST_ID_BASE + 150000, 450000]);
  });

  it('sin nada que migrar devuelve el mismo objeto (no dispara guardados)', () => {
    const library = { schedule: week({ Lunes: [tvmazeShow] }), watchedList: [], watchLater: [], customLists: [] };
    const result = migrateLibrary(library);
    expect(result.changed).toBe(false);
    expect(result.data).toBe(library);
  });

  it('si un dispositivo sin actualizar dejó la misma obra con los dos ids, queda una con el progreso más avanzado', () => {
    const migrated = { ...oldDonghua, id: ANILIST_ID_BASE + 150000, currentEp: 3 };
    const editedOnOldDevice = { ...oldDonghua, currentEp: 5 };
    const list = migrateList([{ id: 1, title: 'Otro' }, migrated, editedOnOldDevice]);
    expect(list.map((a) => [a.id, a.currentEp ?? null])).toEqual([[1, null], [ANILIST_ID_BASE + 150000, 5]]);
  });

  it('los ocultos de Temporada también se migran', () => {
    expect(migrateDiscoveryIds([20, 305000, 450000])).toEqual([20, 305000, ANILIST_ID_BASE + 150000]);
    const clean = [20, 305000];
    expect(migrateDiscoveryIds(clean)).toBe(clean);
  });
});

describe('entradas de datos viejos', () => {
  beforeEach(() => { localStorage.clear(); });

  it('una copia de seguridad vieja se restaura con los ids nuevos', () => {
    const backup = JSON.stringify({ app: 'anitracker', version: 1, data: { schedule: { Lunes: [oldDonghua] }, watchedList: [], watchLater: [tvmazeShow], customLists: [] } });
    const parsed = parseBackup(backup);
    expect(parsed.schedule.Lunes[0].id).toBe(ANILIST_ID_BASE + 150000);
    expect(parsed.watchLater[0].id).toBe(450000);
  });

  it('la biblioteca guardada de la cuenta se lee migrada', () => {
    localStorage.setItem('anitracker-account-state', JSON.stringify({
      owner: 'u1', rev: null,
      data: { schedule: week({ Martes: [oldDonghua] }), watchedList: [], watchLater: [], customLists: [] },
    }));
    expect(readActiveLibrary().data.schedule.Martes[0].id).toBe(ANILIST_ID_BASE + 150000);
  });
});
