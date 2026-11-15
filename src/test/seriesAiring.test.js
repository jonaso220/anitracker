import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildAiringInfo, airingEpisodeLabel, formatAiringWhen, formatAiringDate, refreshAiringInfo, isAiringStale } from '../utils';
import { trackingAiring } from '../tracking';
import { fetchTvmazeAiringInfo, tvmazeIdOf } from '../services/tvmazeService';
import { tmdbAiringFrom, tmdbTvIdOf } from '../services/tmdbService';

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

describe('TVMaze: fallas parciales', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const next = { season: 1, number: 3, airstamp: new Date(2026, 9, 1, 21).toISOString() };

  it('si algunas series fallan (429) devuelve el resto y avisa que quedó incompleto', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (url.includes('/shows/2?')
      ? { ok: false, status: 429 }
      : { ok: true, status: 200, json: async () => ({ name: 'Uno', _embedded: { nextepisode: next } }) }));
    const onPartialFailure = vi.fn();
    const res = await fetchTvmazeAiringInfo({ tvmazeIds: [1, 2], now: NOW, onPartialFailure });
    expect(Object.keys(res)).toEqual(['1']);
    expect(onPartialFailure).toHaveBeenCalledWith(expect.objectContaining({ message: 'TVMaze HTTP 429' }));
  });

  it('un 404 (serie borrada) no cuenta como falla', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => (url.includes('/shows/2?')
      ? { ok: false, status: 404 }
      : { ok: true, status: 200, json: async () => ({ name: 'Uno', _embedded: { nextepisode: next } }) }));
    const onPartialFailure = vi.fn();
    const res = await fetchTvmazeAiringInfo({ tvmazeIds: [1, 2], now: NOW, onPartialFailure });
    expect(Object.keys(res)).toEqual(['1']);
    expect(onPartialFailure).not.toHaveBeenCalled();
  });
});

describe('info de emisión: recalculada con el reloj', () => {
  it('refreshAiringInfo baja la cuenta regresiva y pasa a disponible al llegar la hora', () => {
    const fetched = buildAiringInfo({ episode: 5, airingAt: at(new Date(2026, 8, 28, 12)) }, NOW);
    expect(formatAiringWhen(fetched)).toBe('En 2h 0m');
    expect(formatAiringWhen(refreshAiringInfo(fetched, new Date(2026, 8, 28, 11, 30)))).toBe('En 30m');
    const aired = refreshAiringInfo(fetched, new Date(2026, 8, 28, 12, 1));
    expect(aired.hasAired).toBe(true);
    expect(formatAiringWhen(aired)).toBe('¡Ya disponible!');
  });

  it('al día siguiente "mañana" pasa a "hoy" y conserva los campos extra', () => {
    const fetched = { ...buildAiringInfo({ episode: 2, season: 38, airingAt: at(new Date(2026, 8, 29, 21)) }, NOW), extra: 'x' };
    expect(fetched.isTomorrow).toBe(true);
    const next = refreshAiringInfo(fetched, new Date(2026, 8, 29, 9));
    expect(next).toMatchObject({ isToday: true, isTomorrow: false, season: 38, extra: 'x' });
  });

  it('sin airingAt devuelve la misma info; isAiringStale marca lo que ya dejó de estar disponible', () => {
    const bare = { episode: 1 };
    expect(refreshAiringInfo(bare, NOW)).toBe(bare);
    expect(isAiringStale(bare, NOW)).toBe(false);
    const info = buildAiringInfo({ episode: 1, airingAt: at(new Date(2026, 8, 28, 9)) }, NOW);
    expect(isAiringStale(info, NOW)).toBe(false); // salió hace 1 h: disponible
    expect(isAiringStale(info, new Date(2026, 8, 29, 10))).toBe(true); // 25 h después
    // Solo fecha (TMDB): el día de estreno no está vencido aunque ya pasó el mediodía.
    const dated = buildAiringInfo({ episode: 1, airingAt: noon(28), dateOnly: true }, NOW);
    expect(isAiringStale(dated, new Date(2026, 8, 28, 20))).toBe(false);
    expect(isAiringStale(dated, new Date(2026, 8, 30, 10))).toBe(true);
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
