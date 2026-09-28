import { describe, it, expect } from 'vitest';
import { planImport } from '../libraryImport';
import { daysOfWeek } from '../constants';

const week = (days = {}) => Object.fromEntries(daysOfWeek.map((d) => [d, days[d] || []]));
// Como llega de AniList: id = MAL si tiene, si no 300000 + id de AniList.
const fromAnilist = (anilistId, malId, title, extra = {}) => ({
  id: malId || anilistId + 300000, source: 'AniList', sourceKey: `anilist:${anilistId}`, malId: malId || null, title, year: 2024, ...extra,
});

describe('planImport', () => {
  it('no agrega a la semana lo que ya está en Después (nunca en dos listas)', () => {
    const library = { schedule: week(), watchLater: [{ id: 52991, title: 'Frieren', sourceKey: 'mal:52991' }], watchedList: [] };
    const plan = planImport({ schedule: [fromAnilist(154587, 52991, 'Frieren')] }, library);
    expect(plan.schedule).toEqual([]);
    expect(plan.known.schedule).toBe(1);
    expect(plan.added).toBe(0);
  });

  it('reconoce la misma obra guardada desde otra fuente por MAL o por título + año', () => {
    const library = {
      schedule: week({ Lunes: [{ id: 100500, source: 'Kitsu', sourceKey: 'kitsu:500', malId: 40748, title: 'Jujutsu Kaisen', year: 2020 }] }),
      watchLater: [{ id: 400123, source: 'TVMaze', sourceKey: 'tvmaze:123', title: 'Dandadan', year: 2024 }],
      watchedList: [],
    };
    const plan = planImport({
      schedule: [fromAnilist(113415, 40748, 'JUJUTSU KAISEN', { year: 2020 })],
      watchLater: [fromAnilist(171018, null, 'DAN DA DAN', { titleOriginal: 'Dandadan' })],
    }, library);
    expect(plan.added).toBe(0);
    expect(plan.skipped).toBe(2);
  });

  it('mismo título de otro año es otra obra (Fruits Basket 2001 / 2019)', () => {
    const library = { schedule: week(), watchLater: [{ id: 100001, sourceKey: 'kitsu:1', title: 'Fruits Basket', year: 2001 }], watchedList: [] };
    const plan = planImport({ watchLater: [fromAnilist(105334, 38680, 'Fruits Basket', { year: 2019 })] }, library);
    expect(plan.watchLater).toHaveLength(1);
  });

  it('el mismo anime repetido dentro de la importación entra una sola vez', () => {
    const a = fromAnilist(1, 10, 'A');
    const plan = planImport({ schedule: [a], watchLater: [{ ...a }] }, { schedule: week() });
    expect(plan.schedule).toHaveLength(1);
    expect(plan.watchLater).toHaveLength(0);
  });

  it('va al día en que sale; si no se sabe, al día con menos animes', () => {
    const library = { schedule: week({ Lunes: [{ id: 1 }], Martes: [{ id: 2 }] }) };
    const plan = planImport({
      schedule: [
        fromAnilist(11, 111, 'Sale el jueves', { airDay: 'Jueves' }),
        fromAnilist(12, 112, 'Sin día 1'),
        fromAnilist(13, 113, 'Sin día 2'),
      ],
    }, library);
    expect(plan.schedule.map(({ anime, day }) => `${anime.title}→${day}`)).toEqual([
      'Sale el jueves→Jueves', 'Sin día 1→Miércoles', 'Sin día 2→Viernes',
    ]);
  });
});
