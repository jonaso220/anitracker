import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimeData } from '../hooks/useAnimeData';
import { fetchAiringInfo } from '../services/anilistService';
import { fetchVikiAiringInfo } from '../services/vikiService';

vi.mock('../services/searchAnime', () => ({ searchAnime: vi.fn() }));
vi.mock('../services/anilistService', () => ({ fetchAiringInfo: vi.fn() }));
vi.mock('../services/vikiService', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchVikiAiringInfo: vi.fn(),
}));

const vikiSeries = { id: 700041650, sourceKey: 'viki:41650c', title: 'El oficinista que ganó la lotería', type: 'Serie' };
const vikiFilm = { id: 700038609, sourceKey: 'viki:38609c', title: 'El humor del día', type: 'Película' };
const malAnime = { id: 20, title: 'Naruto' };

async function runAiringCheck(schedule) {
  const hook = renderHook(() => useAnimeData(schedule));
  await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
  return hook;
}

describe('useAnimeData: emisión de Viki', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fetchAiringInfo.mockReset();
    fetchVikiAiringInfo.mockReset();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('pide solo las series de Viki (no películas) y mezcla con AniList', async () => {
    fetchAiringInfo.mockResolvedValue({ 20: { episode: 5 } });
    fetchVikiAiringInfo.mockResolvedValue({ 700041650: { episode: 7 } });

    const { result } = await runAiringCheck({ Lunes: [malAnime], Jueves: [vikiSeries, vikiFilm] });

    expect(fetchVikiAiringInfo).toHaveBeenCalledWith(expect.objectContaining({ vikiIds: ['41650c'] }));
    expect(result.current.airingData).toEqual({ 20: { episode: 5 }, 700041650: { episode: 7 } });
    expect(result.current.airingError).toBeNull();
  });

  it('no consulta AniList cuando solo hay series de Viki', async () => {
    fetchVikiAiringInfo.mockResolvedValue({});
    await runAiringCheck({ Jueves: [vikiSeries] });
    expect(fetchAiringInfo).not.toHaveBeenCalled();
    expect(fetchVikiAiringInfo).toHaveBeenCalledTimes(1);
  });

  it('si Viki falla muestra lo de AniList, avisa y no cachea', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchAiringInfo.mockResolvedValue({ 20: { episode: 5 } });
    fetchVikiAiringInfo.mockRejectedValue(new Error('Viki HTTP 500'));

    const { result } = await runAiringCheck({ Lunes: [malAnime], Jueves: [vikiSeries] });

    expect(result.current.airingData).toEqual({ 20: { episode: 5 } });
    expect(result.current.airingError).toEqual({ kind: 'service' });
    expect(localStorage.getItem('anitracker-airing-cache')).toBeNull();
  });
});
