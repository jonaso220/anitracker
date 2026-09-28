import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchAnime, clearSearchCache, SOURCE_TIMEOUT_MS } from '../services/searchAnime';
import { searchJikan } from '../services/jikanService';
import { searchKitsu } from '../services/kitsuService';
import { searchAnilist } from '../services/anilistService';
import { searchViki } from '../services/vikiService';
import { searchTvmaze } from '../services/tvmazeService';
import { searchItunes } from '../services/itunesService';
import { searchViaSpanishWikipedia, searchViaEnglishWikipedia } from '../services/wikipediaBridge';
import { meaningfulWords, wordMatchRatio } from '../services/searchText';

vi.mock('../services/jikanService', () => ({ searchJikan: vi.fn() }));
vi.mock('../services/kitsuService', () => ({ searchKitsu: vi.fn() }));
vi.mock('../services/anilistService', () => ({ searchAnilist: vi.fn() }));
vi.mock('../services/vikiService', () => ({ searchViki: vi.fn() }));
vi.mock('../services/tvmazeService', () => ({ searchTvmaze: vi.fn() }));
vi.mock('../services/itunesService', () => ({ searchItunes: vi.fn() }));
vi.mock('../services/wikipediaBridge', () => ({ searchViaSpanishWikipedia: vi.fn(), searchViaEnglishWikipedia: vi.fn() }));

const SOURCES = { MAL: searchJikan, Kitsu: searchKitsu, AniList: searchAnilist, Viki: searchViki, TVMaze: searchTvmaze, iTunes: searchItunes };
const item = (source, id, title, extra = {}) => ({ id, source, sourceKey: `${source.toLowerCase()}:${id}`, title, altTitles: [], ...extra });

function respond(bySource = {}) {
  for (const [name, fn] of Object.entries(SOURCES)) fn.mockResolvedValue(bySource[name] || []);
  searchViaSpanishWikipedia.mockResolvedValue({ hits: [], titles: [] });
  searchViaEnglishWikipedia.mockResolvedValue({ hits: [], titles: [] });
}

const titles = (results) => results.map((r) => `${r.title}|${r.year || ''}|${r.source}`);

describe('searchAnime: fusión de resultados', () => {
  beforeEach(() => { clearSearchCache(); vi.clearAllMocks(); });

  it('no fusiona obras con el mismo título y años distintos (Fruits Basket 2001 / 2019)', async () => {
    respond({
      Kitsu: [item('Kitsu', 100001, 'Fruits Basket', { year: '2001', type: 'TV' })],
      AniList: [item('AniList', 400001, 'Fruits Basket', { year: '2019', type: 'TV', altTitles: ['Furuba'] })],
    });
    const { results } = await searchAnime('fruits basket');
    expect(titles(results)).toEqual(['Fruits Basket|2001|Kitsu', 'Fruits Basket|2019|AniList']);
  });

  it('tampoco por compartir un sinónimo, ni dentro de una misma fuente', async () => {
    respond({
      AniList: [
        item('AniList', 400002, 'Fruits Basket', { year: '2001', altTitles: ['Furuba'] }),
        item('AniList', 400003, 'Fruits Basket 2nd Season', { year: '2020', altTitles: ['Furuba'] }),
      ],
    });
    const { results } = await searchAnime('fruits basket');
    expect(results).toHaveLength(2);
  });

  it('fusiona entre fuentes ignorando "(año)" y puntuación, y completa datos faltantes', async () => {
    respond({
      Kitsu: [item('Kitsu', 100005, 'Frieren: Beyond Journey’s End (2023)', { year: '2023', type: 'TV' })],
      TVMaze: [item('TVMaze', 400005, "Frieren: Beyond Journey's End", {
        year: '2023', type: 'Serie', streamingLinks: [{ site: 'Crunchyroll', url: 'https://crunchyroll.com/x' }],
      })],
    });
    const { results } = await searchAnime('frieren');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('Kitsu');
    expect(results[0].streamingLinks).toHaveLength(1);
  });

  it('no fusiona una película con una serie del mismo nombre', async () => {
    respond({
      Kitsu: [item('Kitsu', 100006, 'Dororo', { year: '2019', type: 'TV' })],
      iTunes: [item('iTunes', 500006, 'Dororo', { year: '2019', type: 'Película' })],
    });
    expect((await searchAnime('dororo')).results).toHaveLength(2);
  });

  it('el mismo id interno de fuentes distintas no es la misma obra (salvo el rango de MAL)', async () => {
    respond({
      AniList: [item('AniList', 450000, 'Donghua Legends', { year: '2025' })],
      TVMaze: [item('TVMaze', 450000, 'Sitcom Legends', { year: '2010' })],
    });
    expect((await searchAnime('legends')).results).toHaveLength(2);
  });
});

describe('searchAnime: relevancia', () => {
  beforeEach(() => { clearSearchCache(); vi.clearAllMocks(); });

  it('descarta resultados que solo comparten artículos ("el", "los") y videos musicales', async () => {
    respond({
      Kitsu: [
        item('Kitsu', 100010, 'El Hazard: The Magnificent World'),
        item('Kitsu', 100011, 'Ad Meliora', { type: 'music', altTitles: ['Fruits Basket opening'] }),
      ],
      Viki: [item('Viki', 700000010, 'El oficinista que ganó la lotería', { year: '2026' })],
    });
    const { results } = await searchAnime('el oficinista que gano la loteria');
    expect(titles(results)).toEqual(['El oficinista que ganó la lotería|2026|Viki']);
  });

  it('si nada comparte palabras, devuelve igual lo que hay', async () => {
    respond({ Kitsu: [item('Kitsu', 100012, 'Something else')] });
    expect((await searchAnime('zzzz')).results).toHaveLength(1);
  });

  it('el puente de Wikipedia rankea con el título del artículo sin ensuciar altTitles', async () => {
    respond({
      TVMaze: [
        item('TVMaze', 400020, 'The Simpsons Specials', { year: '2021' }),
        item('TVMaze', 400021, 'The Simpsons', { year: '1989' }),
      ],
    });
    searchViaSpanishWikipedia.mockResolvedValue({
      hits: [item('TVMaze', 400021, 'The Simpsons', { year: '1989' })],
      titles: ['The Simpsons', 'Los Simpson'],
    });
    const { results } = await searchAnime('los simpson');
    expect(results[0].title).toBe('The Simpsons');
    expect(results.every((r) => !r.altTitles.includes('Los Simpson') && !r.altTitles.includes('los simpson'))).toBe(true);
  });
});

describe('searchAnime: tiempos y resultados parciales', () => {
  beforeEach(() => { clearSearchCache(); vi.clearAllMocks(); });
  afterEach(() => { vi.useRealTimers(); });

  it('una fuente colgada se da por caída al vencer el tiempo y no se cachea', async () => {
    vi.useFakeTimers();
    respond({ Kitsu: [item('Kitsu', 100030, 'Naruto')] });
    searchJikan.mockImplementation((q, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }));
    const pending = searchAnime('naruto');
    await vi.advanceTimersByTimeAsync(SOURCE_TIMEOUT_MS + 10);
    const { results, failedApis } = await pending;
    expect(failedApis).toEqual(['MAL']);
    expect(results.map((r) => r.title)).toEqual(['Naruto']);

    searchJikan.mockResolvedValue([]);
    await searchAnime('naruto');
    expect(searchKitsu).toHaveBeenCalledTimes(2); // no quedó en caché
  });

  it('avisa resultados parciales a medida que responden las fuentes', async () => {
    respond({ Kitsu: [item('Kitsu', 100031, 'Naruto')] });
    let release;
    searchTvmaze.mockImplementation(() => new Promise((resolve) => { release = () => resolve([item('TVMaze', 400031, 'Naruto Shippuden')]); }));
    const onProgress = vi.fn();
    const pending = searchAnime('naruto', { onProgress });
    await vi.waitFor(() => expect(onProgress).toHaveBeenCalled());
    expect(onProgress.mock.calls.at(-1)[0].map((r) => r.title)).toEqual(['Naruto']);
    release();
    const { results } = await pending;
    expect(results.map((r) => r.title)).toEqual(['Naruto', 'Naruto Shippuden']);
  });

  it('si se cancela durante el puente de Wikipedia, lanza AbortError y no cachea', async () => {
    respond({ Kitsu: [item('Kitsu', 100032, 'Otra cosa')] });
    const controller = new AbortController();
    searchViaSpanishWikipedia.mockImplementation(() => { controller.abort(); return Promise.reject(new DOMException('Aborted', 'AbortError')); });
    await expect(searchAnime('los simpson', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    searchViaSpanishWikipedia.mockResolvedValue({ hits: [], titles: [] });
    await searchAnime('los simpson');
    expect(searchKitsu).toHaveBeenCalledTimes(2);
  });
});

describe('searchText', () => {
  it('ignora artículos y conectores', () => {
    expect(meaningfulWords('El oficinista que ganó la lotería')).toEqual(['oficinista', 'gano', 'loteria']);
    expect(meaningfulWords('the')).toEqual(['the']);
  });

  it('matchea por comienzo de palabra (plurales), no por substring', () => {
    expect(wordMatchRatio(['The Simpsons'], 'los simpson')).toBe(1);
    expect(wordMatchRatio(['El Hazard'], 'el oficinista')).toBe(0);
    expect(wordMatchRatio(['Parasyte'], 'sit')).toBe(0);
  });
});
