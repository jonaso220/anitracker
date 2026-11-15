import { afterEach, describe, expect, it, vi } from 'vitest';
import { initLocale } from '../i18n';
import { toAnime as vikiToAnime } from '../services/vikiService';

// Lo que cada fuente devuelve según el idioma de la app. Los géneros y el tipo
// se guardan siempre igual (son datos): solo cambian título, sinopsis y el
// idioma que se le pide a la API.

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Viki según el idioma', () => {
  const hit = { id: '41650c', t: 'series', tt: 'Crash Landing on You', te: 'Aterrizaje de emergencia en tu corazón' };
  const detail = {
    id: '41650c', type: 'series',
    titles: { en: 'Crash Landing on You', es: 'Aterrizaje de emergencia en tu corazón' },
    descriptions: { en: 'A paragliding mishap drops an heiress in North Korea.', es: 'Un accidente de parapente deja a una heredera en Corea del Norte.' },
    genres: ['18g', '9g'],
  };

  it('en español prefiere título y sinopsis en español', () => {
    const anime = vikiToAnime(hit, detail);
    expect(anime.title).toBe('Aterrizaje de emergencia en tu corazón');
    expect(anime.synopsis).toMatch(/^Un accidente/);
    expect(anime.genres).toEqual(['Comedia romántica', 'Drama']);
    expect(anime.type).toBe('Serie');
  });

  it('en inglés prefiere los de inglés y deja los datos como estaban', async () => {
    await initLocale('en');
    const anime = vikiToAnime(hit, detail);
    expect(anime.title).toBe('Crash Landing on You');
    expect(anime.synopsis).toMatch(/^A paragliding/);
    expect(anime.altTitles).toContain('Aterrizaje de emergencia en tu corazón');
    // Los géneros y el tipo se guardan igual en cualquier idioma.
    expect(anime.genres).toEqual(['Comedia romántica', 'Drama']);
    expect(anime.type).toBe('Serie');
  });

  it('si falta el título en un idioma usa el otro', async () => {
    expect(vikiToAnime({ id: '7c', t: 'film', tt: 'Only English' }).title).toBe('Only English');
    await initLocale('en');
    expect(vikiToAnime({ id: '8c', t: 'film', te: 'Solo español' }).title).toBe('Solo español');
  });
});

describe('TMDB según el idioma', () => {
  it('pide los datos en el idioma de la app', async () => {
    // La key se lee al cargar el módulo: instancias nuevas del servicio y de i18n.
    vi.stubEnv('VITE_TMDB_API_KEY', 'test-key');
    vi.resetModules();
    const i18n = await import('../i18n');
    const { searchTmdb, fetchTmdbExtras } = await import('../services/tmdbService');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    const lastUrl = () => new URL(fetchSpy.mock.calls.at(-1)[0]);

    i18n.setLocale('es');
    await searchTmdb('dark');
    expect(lastUrl().searchParams.get('language')).toBe('es-ES');
    await fetchTmdbExtras('tmdb:tv:1', { region: 'AR' });
    expect(lastUrl().searchParams.get('include_video_language')).toBe('es,en,null');

    await i18n.initLocale('en');
    await searchTmdb('dark');
    expect(lastUrl().searchParams.get('language')).toBe('en-US');
    // El trailer cacheado en español no se reusa en inglés.
    await fetchTmdbExtras('tmdb:tv:1', { region: 'AR' });
    expect(lastUrl().searchParams.get('language')).toBe('en-US');
    expect(lastUrl().searchParams.get('include_video_language')).toBe('en,null');
    vi.resetModules();
  });
});
