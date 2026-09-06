import { describe, it, expect } from 'vitest';
import { seasonPatch, episodePatch, totalTrackedEpisodes, trackingAiring } from '../tracking';
import { buildAgenda } from '../agenda';
import { buildBackup, parseBackup } from '../utils';

const legacy = { id: 1, title: 'Example', episodes: 12, currentEp: 8, watchLink: 'https://example.com/episode?share=1' };
describe('season tracking compatibility', () => {
  it('keeps legacy progress when enabling seasons', () => {
    expect(seasonPatch(legacy, 1)).toEqual({ currentSeason: 1, currentEp: 8, episodes: 12, seasonProgress: { 1: { currentEp: 8, episodes: 12 } } });
  });
  it('preserves independent progress across seasons, including unknown totals', () => {
    let anime = { ...legacy, ...seasonPatch(legacy, 2) };
    expect(anime).toMatchObject({ currentSeason: 2, currentEp: 0, episodes: 0 });
    anime = { ...anime, ...episodePatch(anime, 5) };
    anime = { ...anime, ...seasonPatch(anime, 1) };
    expect(anime).toMatchObject({ currentEp: 8, episodes: 12 });
    anime = { ...anime, ...seasonPatch(anime, 2) };
    expect(anime).toMatchObject({ currentEp: 5, episodes: 0 });
    expect(totalTrackedEpisodes(anime)).toBe(13);
    expect(anime.watchLink).toBe(legacy.watchLink);
  });
  it('preserves season and pause fields in exported and restored backups', () => {
    const anime = { ...legacy, ...seasonPatch(legacy, 2), paused: true };
    const data = { schedule: { Lunes: [anime] }, watchedList: [], watchLater: [], customLists: [] };
    expect(parseBackup(JSON.stringify(buildBackup(data)))).toEqual(data);
  });
  it('does not use earlier season broadcast info for a later season', () => {
    expect(trackingAiring({currentSeason:2},{episode:12})).toBeUndefined();
    expect(trackingAiring({currentSeason:1},{episode:12})).toEqual({episode:12});
  });
  it('excludes paused items from the agenda but preserves the underlying day', () => {
    const schedule = { Lunes: [{ ...legacy, paused:true }] };
    expect(buildAgenda(schedule, {}).active).toBeNull();
    expect(schedule.Lunes[0].currentEp).toBe(8);
  });
});
