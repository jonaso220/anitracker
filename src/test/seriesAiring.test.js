import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildAiringInfo, airingEpisodeLabel, formatAiringWhen, formatAiringDate } from '../utils';
import { trackingAiring } from '../tracking';
import { buildAgenda } from '../agenda';
import { fetchTvmazeAiringInfo, tvmazeIdOf } from '../services/tvmazeService';
import { tmdbAiringFrom, tmdbTvIdOf } from '../services/tmdbService';
import { daysOfWeek } from '../constants';

// Lunes 28 de septiembre de 2026, 10:00 hora local.
const NOW = new Date(2026, 8, 28, 10);
const at = (d) => Math.round(d.getTime() / 1000);
const noon = (day) => at(new Date(2026, 8, day, 12));

describe('info de emisión con temporada y solo fecha', () => {
  it('la etiqueta incluye la temporada cuando la hay', () => {
    expect(airingEpisodeLabel({ episode: 5 })).toBe('Ep. 5');
    expect(airingEpisodeLabel({ episode: 2, season: 38 })).toBe('T38 · Ep. 2');
  });

  it('solo fecha: el día de estreno es "hoy" (sin horas), al día siguiente queda disponible', () => {
    const today = buildAiringInfo({ episode: 3, airingAt: noon(28), dateOnly: true }, NOW);
    expect(today).toMatchObject({ isToday: true, hasAired: false, dateOnly: true });
    expect(formatAiringWhen(today)).toBe('Hoy');
    expect(formatAiringDate(today.airingAt, today)).not.toMatch(/\d{2}:\d{2}/);

    const yesterday = buildAiringInfo({ episode: 2, airingAt: noon(27), dateOnly: true }, NOW);
    expect(yesterday).toMatchObject({ isToday: false, hasAired: true });
  });
});

describe('temporada que sigue el usuario', () => {
  const airing = { episode: 2, season: 38, isToday: true };

  it('se muestra si no eligió temporada o si es la misma; no si eligió otra', () => {
    expect(trackingAiring({ id: 1 }, airing)).toBe(airing);
    expect(trackingAiring({ id: 1, currentSeason: 38 }, airing)).toBe(airing);
    expect(trackingAiring({ id: 1, currentSeason: 3 }, airing)).toBeUndefined();
  });

  it('la agenda no inventa pendientes con episodios de otra temporada', () => {
    const schedule = Object.fromEntries(daysOfWeek.map((d) => [d, []]));
    schedule.Lunes = [
      { id: 1, title: 'Viendo la T1', currentEp: 3 },
      { id: 2, title: 'Al día en la T38', currentSeason: 38, currentEp: 0 },
    ];
    const airingData = {
      1: { episode: 2, season: 38, hasAired: true },
      2: { episode: 2, season: 38, hasAired: true },
    };
    const agenda = buildAgenda(schedule, airingData, NOW);
    const all = [...(agenda.active?.items || []), ...agenda.upcoming];
    expect(all.find((a) => a.id === 2)._pendingEpisodes).toBe(2);
    expect(all.find((a) => a.id === 1)._pendingEpisodes).toBe(1); // solo el siguiente, no 2 - 3
  });
});

describe('TVMaze', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  const show = (id, prev, next) => ({ id, name: `Show ${id}`, _embedded: { previousepisode: prev, nextepisode: next } });
  const ep = (season, number, date) => ({ season, number, airstamp: date.toISOString() });
  const respond = (byId) => vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const id = Number(/shows\/(\d+)/.exec(url)[1]);
    return { ok: true, json: async () => byId(id) };
  });

  it('id por sourceKey', () => {
    expect(tvmazeIdOf({ sourceKey: 'tvmaze:83' })).toBe(83);
    expect(tvmazeIdOf({ id: 400083, sourceKey: 'anilist:100083' })).toBeNull();
  });

  it('el que salió en las últimas 24 h cuenta como disponible; si no, el próximo', async () => {
    respond((id) => (id === 83
      ? show(83, ep(38, 1, new Date(2026, 8, 27, 21)), ep(38, 2, new Date(2026, 9, 4, 21)))
      : show(84, ep(2, 7, new Date(2026, 8, 20, 21)), ep(2, 8, new Date(2026, 9, 1, 21)))));
    const res = await fetchTvmazeAiringInfo({ tvmazeIds: [83, 84], now: NOW });
    expect(res[83]).toMatchObject({ episode: 1, season: 38, hasAired: true });
    expect(res[84]).toMatchObject({ episode: 8, season: 2, hasAired: false });
  });

  it('ignora especiales sin número y series sin próximo episodio', async () => {
    respond((id) => (id === 1 ? show(1, null, { season: 1, number: null, airstamp: new Date(2026, 9, 1).toISOString() }) : show(2, null, null)));
    expect(await fetchTvmazeAiringInfo({ tvmazeIds: [1, 2], now: NOW })).toEqual({});
  });

  it('respeta el límite de TVMaze: más de 18 series van en una segunda tanda 10 s después', async () => {
    vi.useFakeTimers();
    const fetchSpy = respond((id) => show(id, null, ep(1, 1, new Date(2026, 9, 1, 21))));
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const pending = fetchTvmazeAiringInfo({ tvmazeIds: ids, now: NOW });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchSpy).toHaveBeenCalledTimes(18);
    await vi.advanceTimersByTimeAsync(10000);
    const res = await pending;
    expect(fetchSpy).toHaveBeenCalledTimes(20);
    expect(Object.keys(res)).toHaveLength(20);
  });
});

describe('TMDB', () => {
  const detail = (last, next) => ({
    name: 'Serie', last_episode_to_air: last, next_episode_to_air: next,
    seasons: [{ season_number: 2, episode_count: 10 }],
  });

  it('id solo de series', () => {
    expect(tmdbTvIdOf({ sourceKey: 'tmdb:tv:1399' })).toBe(1399);
    expect(tmdbTvIdOf({ sourceKey: 'tmdb:movie:603' })).toBeNull();
  });

  it('usa el próximo episodio, con temporada y total de esa temporada, solo fecha', () => {
    const info = tmdbAiringFrom(detail(
      { air_date: '2026-09-21', episode_number: 4, season_number: 2 },
      { air_date: '2026-10-02', episode_number: 5, season_number: 2 },
    ), NOW);
    expect(info).toMatchObject({ episode: 5, season: 2, totalEpisodes: 10, dateOnly: true, hasAired: false });
    expect(new Date(info.airingAt * 1000).getDate()).toBe(2);
  });

  it('si el último salió ayer, lo muestra como disponible', () => {
    const info = tmdbAiringFrom(detail(
      { air_date: '2026-09-27', episode_number: 4, season_number: 2 },
      { air_date: '2026-10-04', episode_number: 5, season_number: 2 },
    ), NOW);
    expect(info).toMatchObject({ episode: 4, hasAired: true });
  });

  it('sin próximo episodio (terminada) no hay cuenta regresiva', () => {
    expect(tmdbAiringFrom(detail({ air_date: '2025-01-01', episode_number: 10, season_number: 2 }, null), NOW)).toBeNull();
  });
});
