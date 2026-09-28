import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimeData } from '../hooks/useAnimeData';
import { fetchAiringByIds } from '../services/anilistService';
import { fetchVikiAiringInfo } from '../services/vikiService';
import { fetchTvmazeAiringInfo } from '../services/tvmazeService';

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
    localStorage.setItem('anitracker-airing-ids', 'm20');
    const schedule = { Lunes: [malAnime] };
    const { result } = renderHook(() => useAnimeData(schedule));
    expect(result.current.airingData).toEqual({ 20: { episode: 5 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(fetchAiringByIds).not.toHaveBeenCalled();
  });

  it('si la semana cambió, sigue mostrando lo anterior mientras consulta y después lo nuevo', async () => {
    localStorage.setItem('anitracker-airing-cache', JSON.stringify({ 20: { episode: 5 } }));
    localStorage.setItem('anitracker-airing-time', String(Date.now()));
    localStorage.setItem('anitracker-airing-ids', 'm20');
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
