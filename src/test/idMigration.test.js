import { describe, it, expect, beforeEach } from 'vitest';
import {
  anilistInternalId, migrateAnime, migrateLibrary, migrateList, migrateDiscoveryIds, ANILIST_ID_BASE, ITUNES_ID_BASE,
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

describe('ids de iTunes', () => {
  // trackId + 500000 caía en el rango de Viki (700000000 + id).
  const oldItunes = { id: 699541650, source: 'iTunes', sourceKey: 'itunes:699041650', title: 'Película de iTunes', currentEp: 1 };

  it('pasa al rango propio solo lo que su sourceKey prueba de iTunes, y es idempotente', () => {
    const migrated = migrateAnime(oldItunes);
    expect(migrated.id).toBe(ITUNES_ID_BASE + 699041650);
    expect(migrateAnime(migrated)).toBe(migrated);
    // Mismo id pero de Viki: no se toca.
    const viki = { id: 699541650, source: 'Viki', sourceKey: 'viki:41650c' };
    expect(migrateAnime(viki)).toBe(viki);
    // Sin sourceKey no hay prueba de que sea de iTunes.
    const unknown = { id: 699541650 };
    expect(migrateAnime(unknown)).toBe(unknown);
    // Un id que no es el viejo exacto (p. ej. ya migrado en otro dispositivo) queda igual.
    const other = { ...oldItunes, id: 12345 };
    expect(migrateAnime(other)).toBe(other);
  });

  it('también los de id por hash del título (sin trackId)', () => {
    expect(migrateAnime({ id: 512345, source: 'iTunes', sourceKey: 'itunes:12345' }).id).toBe(ITUNES_ID_BASE + 12345);
  });

  it('migra la biblioteca entera y deja una sola copia si quedó dos veces', () => {
    const fresh = { ...oldItunes, id: ITUNES_ID_BASE + 699041650, currentEp: 3 };
    const { data, changed } = migrateLibrary({
      schedule: week(), watchedList: [oldItunes, fresh], watchLater: [oldItunes], customLists: [{ id: 'l', name: 'L', items: [oldItunes] }],
    });
    expect(changed).toBe(true);
    expect(data.watchedList).toHaveLength(1);
    expect(data.watchedList[0]).toMatchObject({ id: ITUNES_ID_BASE + 699041650, currentEp: 3 });
    expect(data.watchLater[0].id).toBe(ITUNES_ID_BASE + 699041650);
    expect(data.customLists[0].items[0].id).toBe(ITUNES_ID_BASE + 699041650);
    expect(migrateLibrary(data).changed).toBe(false);
  });
});
