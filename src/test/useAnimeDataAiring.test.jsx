import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimeData } from '../hooks/useAnimeData';
import { fetchAiringByIds } from '../services/anilistService';
import { fetchVikiAiringInfo } from '../services/vikiService';
import { fetchTvmazeAiringInfo } from '../services/tvmazeService';
import { formatAiringWhen } from '../utils';

vi.mock('../services/searchAnime', () => ({ searchAnime: vi.fn() }));
vi.mock('../services/anilistService', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAiringByIds: vi.fn(),
}));
vi.mock('../services/vikiService', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchVikiAiringInfo: vi.fn(),
}));
vi.mock('../services/tvmazeService', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchTvmazeAiringInfo: vi.fn(),
}));

const vikiSeries = { id: 700041650, sourceKey: 'viki:41650c', title: 'El oficinista que ganó la lotería', type: 'Serie' };
const vikiFilm = { id: 700038609, sourceKey: 'viki:38609c', title: 'El humor del día', type: 'Película' };
const malAnime = { id: 20, title: 'Naruto', source: 'MAL', sourceKey: 'mal:20' };

async function runAiringCheck(schedule) {
  const hook = renderHook(() => useAnimeData(schedule));
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  return hook;
}

describe('useAnimeData: emisión de Viki', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fetchAiringByIds.mockReset();
    fetchVikiAiringInfo.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('pide solo las series de Viki (no películas) y mezcla con AniList', async () => {
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: { episode: 5 } } });
    fetchVikiAiringInfo.mockResolvedValue({ 700041650: { episode: 7 } });

    const { result } = await runAiringCheck({ Lunes: [malAnime], Jueves: [vikiSeries, vikiFilm] });

    expect(fetchVikiAiringInfo).toHaveBeenCalledWith(expect.objectContaining({ vikiIds: ['41650c'] }));
    expect(result.current.airingData).toEqual({ 20: { episode: 5 }, 700041650: { episode: 7 } });
    expect(result.current.airingError).toBeNull();
  });

  it('no consulta AniList cuando solo hay series de Viki', async () => {
    fetchVikiAiringInfo.mockResolvedValue({});
    await runAiringCheck({ Jueves: [vikiSeries] });
    expect(fetchAiringByIds).not.toHaveBeenCalled();
    expect(fetchVikiAiringInfo).toHaveBeenCalledTimes(1);
  });

  it('si Viki falla muestra lo de AniList, avisa y no cachea', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: { episode: 5 } } });
    fetchVikiAiringInfo.mockRejectedValue(new Error('Viki HTTP 500'));

    const { result } = await runAiringCheck({ Lunes: [malAnime], Jueves: [vikiSeries] });

    expect(result.current.airingData).toEqual({ 20: { episode: 5 } });
    expect(result.current.airingError).toEqual({ kind: 'service' });
    expect(localStorage.getItem('anitracker-airing-cache')).toBeNull();
  });
});

describe('useAnimeData: emisión de AniList por fuente', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); fetchAiringByIds.mockReset(); fetchVikiAiringInfo.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('incluye anime de AniList sin MAL (id interno ≥ 400000) y los asocia a su id interno', async () => {
    const donghua = { id: 517459, title: 'Anemone', source: 'AniList', sourceKey: 'anilist:217459' };
    const withMal = { id: 52991, title: 'Frieren', source: 'AniList', sourceKey: 'anilist:154587', malId: 52991 };
    fetchAiringByIds.mockResolvedValue({ byAnilist: { 217459: { episode: 3 }, 154587: { episode: 9 } }, byMal: {} });

    const { result } = await runAiringCheck({ Lunes: [donghua], Martes: [withMal] });

    expect(fetchAiringByIds).toHaveBeenCalledWith(expect.objectContaining({ anilistIds: [217459, 154587], malIds: [] }));
    expect(result.current.airingData).toEqual({ 517459: { episode: 3 }, 52991: { episode: 9 } });
  });

  it('un anime guardado sin MAL que después lo obtuvo sigue recibiendo su cuenta regresiva', async () => {
    const saved = { id: 517459, title: 'Anemone', source: 'AniList', sourceKey: 'anilist:217459' };
    // AniList ahora devuelve idMal: la respuesta se asocia igual por id de AniList.
    fetchAiringByIds.mockResolvedValue({ byAnilist: { 217459: { episode: 4 } }, byMal: { 63000: { episode: 4 } } });
    const { result } = await runAiringCheck({ Lunes: [saved] });
    expect(result.current.airingData).toEqual({ 517459: { episode: 4 } });
  });
});

describe('useAnimeData: cache de emisión', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fetchAiringByIds.mockReset();
    fetchVikiAiringInfo.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('con cache fresca de la misma semana muestra los datos al instante y no consulta', async () => {
    localStorage.setItem('anitracker-airing-cache', JSON.stringify({ 20: { episode: 5 } }));
    localStorage.setItem('anitracker-airing-time', String(Date.now()));
    localStorage.setItem('anitracker-airing-ids', 'v2:m20');
    const schedule = { Lunes: [malAnime] };
    const { result } = renderHook(() => useAnimeData(schedule));
    expect(result.current.airingData).toEqual({ 20: { episode: 5 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(fetchAiringByIds).not.toHaveBeenCalled();
  });

  it('si la semana cambió, sigue mostrando lo anterior mientras consulta y después lo nuevo', async () => {
    localStorage.setItem('anitracker-airing-cache', JSON.stringify({ 20: { episode: 5 } }));
    localStorage.setItem('anitracker-airing-time', String(Date.now()));
    localStorage.setItem('anitracker-airing-ids', 'v2:m20');
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: { episode: 6 }, 21: { episode: 1 } } });
    const schedule = { Lunes: [malAnime, { id: 21, title: 'Otro', sourceKey: 'mal:21' }] };
    const { result } = renderHook(() => useAnimeData(schedule));
    expect(result.current.airingData).toEqual({ 20: { episode: 5 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(result.current.airingData).toEqual({ 20: { episode: 6 }, 21: { episode: 1 } });
  });

  it('sin nada que consultar queda vacío y sin error', () => {
    const { result } = renderHook(() => useAnimeData({ Lunes: [] }));
    expect(result.current.airingData).toEqual({});
    expect(result.current.airingError).toBeNull();
  });
});

describe('useAnimeData: emisión de TVMaze', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fetchAiringByIds.mockReset();
    fetchVikiAiringInfo.mockReset();
    fetchTvmazeAiringInfo.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('pide las series de TVMaze por su id y asocia la respuesta al id interno', async () => {
    fetchTvmazeAiringInfo.mockResolvedValue({ 83: { episode: 2, season: 38 } });
    const simpsons = { id: 400083, sourceKey: 'tvmaze:83', title: 'The Simpsons', type: 'Serie' };
    const { result } = await runAiringCheck({ Domingo: [simpsons] });
    expect(fetchTvmazeAiringInfo).toHaveBeenCalledWith(expect.objectContaining({ tvmazeIds: [83] }));
    expect(fetchAiringByIds).not.toHaveBeenCalled();
    expect(result.current.airingData).toEqual({ 400083: { episode: 2, season: 38 } });
  });
});

describe('useAnimeData: la emisión sigue el reloj', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Lunes 28 de septiembre de 2026, 10:00:30 hora local.
    vi.setSystemTime(new Date(2026, 8, 28, 10, 0, 30));
    localStorage.clear();
    fetchAiringByIds.mockReset();
    fetchVikiAiringInfo.mockReset();
    fetchTvmazeAiringInfo.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  const airsAt = (date) => ({ episode: 5, airingAt: Math.round(date.getTime() / 1000), totalEpisodes: 12, title: 'Naruto' });

  it('"En 2h" baja de a minuto y pasa a "¡Ya disponible!" sin volver a consultar', async () => {
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: airsAt(new Date(2026, 8, 28, 12)) } });
    const schedule = { Lunes: [malAnime] };
    const { result } = await runAiringCheck(schedule);
    // Al minuto, como el reloj: a las 10:00 faltan 2 h justas.
    expect(formatAiringWhen(result.current.airingData[20])).toBe('En 2h 0m');
    const first = result.current.airingData;

    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
    expect(formatAiringWhen(result.current.airingData[20])).toBe('En 1h 59m');
    expect(result.current.airingData).not.toBe(first);

    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000); });
    expect(result.current.airingData[20].hasAired).toBe(true);
    expect(formatAiringWhen(result.current.airingData[20])).toBe('¡Ya disponible!');
    expect(fetchAiringByIds).toHaveBeenCalledTimes(1);
  });

  it('dentro del mismo minuto la identidad de airingData no cambia', async () => {
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: airsAt(new Date(2026, 8, 28, 12)) } });
    const schedule = { Lunes: [malAnime] };
    const { result, rerender } = await runAiringCheck(schedule);
    const first = result.current.airingData;
    rerender();
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 1000); });
    expect(result.current.airingData).toBe(first);
  });

  it('con la pestaña oculta no hace tics; al volver se actualiza y reconsulta si la cache venció', async () => {
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: airsAt(new Date(2026, 8, 29, 12)) } });
    const schedule = { Lunes: [malAnime] };
    const { result } = await runAiringCheck(schedule);
    expect(result.current.airingData[20].isTomorrow).toBe(true);

    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = result.current.airingData;
    // Al día siguiente, todavía oculta: nada se recalcula ni se consulta.
    await act(async () => { await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); });
    expect(result.current.airingData).toBe(hidden);
    expect(fetchAiringByIds).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue('visible');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    // "Mañana" pasó a "hoy" al instante...
    expect(result.current.airingData[20]).toMatchObject({ isToday: true, isTomorrow: false });
    // ...y como la cache (15 min) venció, se vuelve a consultar.
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(fetchAiringByIds).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });

  it('con la app abierta, cuando un episodio deja de estar disponible baja el siguiente', async () => {
    // Salió ayer a las 11:00: hoy a las 11:00 deja de contar como disponible.
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: airsAt(new Date(2026, 8, 27, 11)) } });
    const { result } = await runAiringCheck({ Lunes: [malAnime] });
    expect(result.current.airingData[20].hasAired).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60 * 1000); });
    expect(fetchAiringByIds).toHaveBeenCalledTimes(1);
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: { ...airsAt(new Date(2026, 9, 4, 11)), episode: 6 } } });
    await act(async () => { await vi.advanceTimersByTimeAsync(31 * 60 * 1000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(fetchAiringByIds).toHaveBeenCalledTimes(2);
    expect(result.current.airingData[20].episode).toBe(6);
  });

  it('al volver a primer plano con la cache fresca no consulta', async () => {
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: airsAt(new Date(2026, 8, 28, 12)) } });
    await runAiringCheck({ Lunes: [malAnime] });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(fetchAiringByIds).toHaveBeenCalledTimes(1);
  });
});

describe('useAnimeData: editar la biblioteca no reinicia las consultas', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fetchAiringByIds.mockReset();
    fetchVikiAiringInfo.mockReset();
    fetchTvmazeAiringInfo.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('un +1 (misma semana, otro objeto) no aborta ni repite el pedido en curso', async () => {
    let resolve;
    fetchTvmazeAiringInfo.mockReturnValue(new Promise((res) => { resolve = res; }));
    const simpsons = { id: 400083, sourceKey: 'tvmaze:83', title: 'The Simpsons', type: 'Serie', currentEp: 1 };
    const { result, rerender } = renderHook(({ schedule }) => useAnimeData(schedule), { initialProps: { schedule: { Domingo: [simpsons] } } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(fetchTvmazeAiringInfo).toHaveBeenCalledTimes(1);
    const { signal } = fetchTvmazeAiringInfo.mock.calls[0][0];

    rerender({ schedule: { Domingo: [{ ...simpsons, currentEp: 2 }] } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(signal.aborted).toBe(false);
    expect(fetchTvmazeAiringInfo).toHaveBeenCalledTimes(1);

    await act(async () => { resolve({ 83: { episode: 2, season: 38 } }); });
    expect(result.current.airingData).toEqual({ 400083: { episode: 2, season: 38 } });

    // Otra edición con la respuesta ya cacheada: tampoco consulta.
    rerender({ schedule: { Domingo: [{ ...simpsons, currentEp: 3 }] } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(fetchTvmazeAiringInfo).toHaveBeenCalledTimes(1);
  });

  it('si cambian los ids de la semana sí aborta y vuelve a consultar', async () => {
    fetchTvmazeAiringInfo.mockReturnValue(new Promise(() => {}));
    const a = { id: 400083, sourceKey: 'tvmaze:83', title: 'A', type: 'Serie' };
    const b = { id: 400084, sourceKey: 'tvmaze:84', title: 'B', type: 'Serie' };
    const { rerender } = renderHook(({ schedule }) => useAnimeData(schedule), { initialProps: { schedule: { Domingo: [a] } } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    const { signal } = fetchTvmazeAiringInfo.mock.calls[0][0];
    rerender({ schedule: { Domingo: [a, b] } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(signal.aborted).toBe(true);
    expect(fetchTvmazeAiringInfo).toHaveBeenCalledTimes(2);
    expect(fetchTvmazeAiringInfo.mock.calls[1][0].tvmazeIds).toEqual([83, 84]);
  });

  it('el reintento manual consulta aunque la semana sea la misma', async () => {
    fetchAiringByIds.mockResolvedValue({ byAnilist: {}, byMal: { 20: { episode: 5 } } });
    const { result } = await runAiringCheck({ Lunes: [malAnime] });
    act(() => { result.current.retryAiring(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(fetchAiringByIds).toHaveBeenCalledTimes(2);
  });
});

describe('useAnimeData: respuesta parcial de una fuente', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fetchAiringByIds.mockReset();
    fetchTvmazeAiringInfo.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('si TVMaze respondió solo algunas series, muestra lo que hay, avisa y no lo cachea como completo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchTvmazeAiringInfo.mockImplementation(async ({ onPartialFailure }) => {
      onPartialFailure(new Error('TVMaze HTTP 429'));
      return { 83: { episode: 2 } };
    });
    const a = { id: 400083, sourceKey: 'tvmaze:83', title: 'A', type: 'Serie' };
    const b = { id: 400084, sourceKey: 'tvmaze:84', title: 'B', type: 'Serie' };
    const { result } = await runAiringCheck({ Domingo: [a, b] });
    expect(result.current.airingData).toEqual({ 400083: { episode: 2 } });
    expect(result.current.airingError).toEqual({ kind: 'rate-limit' });
    expect(localStorage.getItem('anitracker-airing-cache')).toBeNull();
  });
});
