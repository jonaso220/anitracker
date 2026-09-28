import { describe, it, expect } from 'vitest';
import { stableStringify, hashLibrary, mergeLibraries, resolveCloudSnapshot } from '../syncMerge';
import { daysOfWeek } from '../constants';

const week = (days = {}) => Object.fromEntries(daysOfWeek.map((d) => [d, days[d] || []]));
const lib = ({ schedule = {}, watchedList = [], watchLater = [], customLists = [] } = {}) => ({
  schedule: week(schedule), watchedList, watchLater, customLists,
});
const a = (id, extra = {}) => ({ id, title: `Anime ${id}`, currentEp: 0, ...extra });

describe('stableStringify', () => {
  it('ignora el orden de las claves (Firestore no lo conserva) y los undefined', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 }, u: undefined })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe('resolveCloudSnapshot', () => {
  it('aplica la nube cuando el contenido es igual aunque cambie el orden de claves', () => {
    const local = lib({ watchedList: [{ id: 1, title: 'X', currentEp: 2 }] });
    const cloud = lib({ watchedList: [{ currentEp: 2, title: 'X', id: 1 }] });
    expect(resolveCloudSnapshot({ base: null, local, cloud }).action).toBe('apply');
  });

  it('invitado que inicia sesión: fusiona en vez de pisar la nube (sin base)', () => {
    const local = lib({ schedule: { Lunes: [a(1)] } });
    const cloud = lib({ watchedList: [a(2), a(3)], watchLater: [a(4)] });
    const { action, data } = resolveCloudSnapshot({
      base: null, local, cloud, localRev: '2026-09-28T12:00:00Z', cloudRev: '2026-09-20T12:00:00Z',
    });
    expect(action).toBe('merge');
    expect(data.schedule.Lunes.map((x) => x.id)).toEqual([1]);
    expect(data.watchedList.map((x) => x.id)).toEqual([2, 3]);
    expect(data.watchLater.map((x) => x.id)).toEqual([4]);
  });

  it('sin base y sin nada local, toma la nube', () => {
    expect(resolveCloudSnapshot({ base: null, local: lib(), cloud: lib({ watchedList: [a(1)] }) }).action).toBe('apply');
  });

  it('sin base (legado) toma la nube si no hubo ediciones locales posteriores', () => {
    const r = resolveCloudSnapshot({
      base: null, local: lib({ watchedList: [a(1)] }), cloud: lib({ watchedList: [a(1), a(2)] }),
      localRev: '2026-09-01T00:00:00Z', cloudRev: '2026-09-02T00:00:00Z',
    });
    expect(r.action).toBe('apply');
  });

  it('con base: sin cambios locales aplica, sin cambios en la nube conserva', () => {
    const synced = lib({ watchedList: [a(1)] });
    const base = hashLibrary(synced);
    expect(resolveCloudSnapshot({ base, local: synced, cloud: lib({ watchedList: [a(1), a(2)] }) }).action).toBe('apply');
    expect(resolveCloudSnapshot({ base, local: lib({ watchedList: [a(1), a(3)] }), cloud: synced }).action).toBe('keep');
  });

  it('un reloj adelantado ya no decide: con base se fusiona igual', () => {
    const synced = lib({ watchedList: [a(1)] });
    const r = resolveCloudSnapshot({
      base: hashLibrary(synced),
      local: lib({ watchedList: [a(1), a(2)] }),
      cloud: lib({ watchedList: [a(1), a(3)] }),
      localRev: '2099-01-01T00:00:00Z', cloudRev: '2026-01-01T00:00:00Z',
    });
    expect(r.action).toBe('merge');
    expect(r.data.watchedList.map((x) => x.id).sort()).toEqual([1, 2, 3]);
  });
});

describe('mergeLibraries', () => {
  const synced = lib({
    schedule: { Lunes: [a(1), a(2)] },
    watchedList: [a(10)],
    customLists: [{ id: 'list-1', name: 'Favs', emoji: '⭐', items: [a(20)] }],
  });
  const base = hashLibrary(synced);
  const clone = (v) => structuredClone(v);

  it('conserva ediciones de distintos anime hechas en cada dispositivo', () => {
    const local = clone(synced); local.schedule.Lunes[0].currentEp = 5;
    const cloud = clone(synced); cloud.schedule.Lunes[1].currentEp = 7;
    const m = mergeLibraries({ base, local, cloud });
    expect(m.schedule.Lunes.map((x) => [x.id, x.currentEp])).toEqual([[1, 5], [2, 7]]);
  });

  it('si los dos editaron el mismo anime gana el dispositivo en uso', () => {
    const local = clone(synced); local.schedule.Lunes[0].currentEp = 5;
    const cloud = clone(synced); cloud.schedule.Lunes[0].currentEp = 9;
    expect(mergeLibraries({ base, local, cloud }).schedule.Lunes[0].currentEp).toBe(5);
  });

  it('respeta un borrado si el otro lado no tocó ese anime', () => {
    const local = clone(synced); local.schedule.Lunes = [local.schedule.Lunes[1]];
    const cloud = clone(synced); cloud.watchedList.push(a(11));
    const m = mergeLibraries({ base, local, cloud });
    expect(m.schedule.Lunes.map((x) => x.id)).toEqual([2]);
    expect(m.watchedList.map((x) => x.id)).toEqual([10, 11]);
  });

  it('una edición gana a un borrado del otro lado', () => {
    const local = clone(synced); local.schedule.Lunes = [local.schedule.Lunes[1]];
    const cloud = clone(synced); cloud.schedule.Lunes[0].currentEp = 3;
    const m = mergeLibraries({ base, local, cloud });
    expect(m.schedule.Lunes.map((x) => x.id)).toEqual([1, 2]);
    expect(m.schedule.Lunes[0].currentEp).toBe(3);
  });

  it('un movimiento (Lunes → Vistos) no deja el anime duplicado aunque el otro lado lo edite', () => {
    const local = clone(synced);
    const [moved] = local.schedule.Lunes.splice(0, 1);
    local.watchedList.push({ ...moved, finished: true });
    const cloud = clone(synced); cloud.schedule.Lunes[0].currentEp = 4;
    const m = mergeLibraries({ base, local, cloud });
    expect(m.schedule.Lunes.map((x) => x.id)).toEqual([2]);
    expect(m.watchedList.map((x) => x.id)).toEqual([10, 1]);
  });

  it('agregados en el mismo día desde los dos lados quedan ambos', () => {
    const local = clone(synced); local.schedule.Lunes.push(a(3));
    const cloud = clone(synced); cloud.schedule.Lunes.push(a(4));
    expect(mergeLibraries({ base, local, cloud }).schedule.Lunes.map((x) => x.id)).toEqual([1, 2, 3, 4]);
  });

  it('respeta el reordenamiento hecho en un solo lado', () => {
    const local = clone(synced);
    const cloud = clone(synced); cloud.schedule.Lunes.reverse();
    expect(mergeLibraries({ base, local, cloud }).schedule.Lunes.map((x) => x.id)).toEqual([2, 1]);
  });

  it('fusiona listas personalizadas: renombre de un lado, anime agregado del otro', () => {
    const local = clone(synced); local.customLists[0].items.push(a(21));
    const cloud = clone(synced); cloud.customLists[0].name = 'Favoritos';
    const [list] = mergeLibraries({ base, local, cloud }).customLists;
    expect(list.name).toBe('Favoritos');
    expect(list.items.map((x) => x.id)).toEqual([20, 21]);
  });

  it('una lista borrada en un lado desaparece aunque el otro le haya agregado algo', () => {
    const local = clone(synced); local.customLists = [];
    const cloud = clone(synced); cloud.customLists[0].items.push(a(22));
    expect(mergeLibraries({ base, local, cloud }).customLists).toEqual([]);
  });

  it('siempre devuelve los siete días', () => {
    const m = mergeLibraries({ base: {}, local: { watchedList: [a(1)] }, cloud: { watchLater: [a(2)] } });
    expect(Object.keys(m.schedule)).toEqual(daysOfWeek);
  });
});
