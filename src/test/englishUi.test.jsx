import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { daysOfWeek } from '../constants';
import { initLocale } from '../i18n';
import { translateEnToEs } from '../services/translationService';
import { useTranslatedSynopsis } from '../hooks/useTranslatedSynopsis';
import AnimeCard from '../components/AnimeCard';
import DayPickerModal from '../components/modals/DayPickerModal';
import MoveDayPickerModal from '../components/modals/MoveDayPickerModal';
import SearchModal from '../components/modals/SearchModal';
import AnimeDetailModal from '../components/modals/AnimeDetailModal';
import { fetchAnilistRelations } from '../services/anilistService';
import { hashLibrary, inspectCloudSnapshot } from '../syncMerge';

// La app en inglés: se traduce lo que se ve y nunca lo que se guarda (los días
// del horario, el tipo y los géneros siguen siendo los valores en español).

vi.mock('../services/translationService', () => ({ translateEnToEs: vi.fn() }));
vi.mock('../hooks/useFirebase', () => ({
  useFirebase: () => ({
    user: null, cloudLoaded: false, syncing: false, syncError: null, syncTooLarge: false, retrySync: () => {},
    authError: '', authReady: true, authBusy: false, loginWithGoogle: () => {}, logout: () => {}, FIREBASE_ENABLED: true,
  }),
}));
vi.mock('../services/searchAnime', async (importOriginal) => ({
  ...(await importOriginal()),
  searchAnime: vi.fn(() => new Promise(() => {})),
}));
vi.mock('../services/anilistService', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAiringByIds: vi.fn(async () => ({ byAnilist: {}, byMal: {} })),
  fetchSeason: vi.fn(() => new Promise(() => {})),
  fetchDirectory: vi.fn(() => new Promise(() => {})),
  fetchAnilistRelations: vi.fn(async () => []),
}));

const { default: App } = await import('../App');

const EN_SYNOPSIS = 'A young mage travels the world with her friends after the war is over and learns what the years meant.';

beforeEach(async () => {
  localStorage.clear();
  window.history.replaceState(null, '', '/');
  translateEnToEs.mockReset();
  await initLocale('en');
});
afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

describe('interfaz en inglés', () => {
  it('la semana vacía da la bienvenida en inglés y marca el documento como en', async () => {
    render(<App />);
    await act(async () => {});
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { name: 'Build your week' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Week/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Armá tu semana')).not.toBeInTheDocument();
  });

  it('el horario muestra los días en inglés sin cambiar las claves guardadas', async () => {
    const schedule = Object.fromEntries(daysOfWeek.map((d) => [d, []]));
    schedule.Lunes = [{ id: 1, title: 'Frieren', genres: ['Fantasía'], currentEp: 3, episodes: 28 }];
    localStorage.setItem('animeSchedule', JSON.stringify(schedule));
    render(<App />);
    await act(async () => {});

    const week = await screen.findByRole('region', { name: 'Weekly schedule' });
    expect(within(week).getByText('Monday')).toBeInTheDocument();
    expect(within(week).getByText('Sunday')).toBeInTheDocument();
    expect(within(week).queryByText('Lunes')).not.toBeInTheDocument();
    expect(within(week).getByText('Fantasy')).toBeInTheDocument();
    expect(within(week).getByText('25 left')).toBeInTheDocument();
    // Lo guardado no se toca.
    expect(Object.keys(JSON.parse(localStorage.getItem('animeSchedule')))).toEqual(daysOfWeek);
  });

  it('elegir "Monday" agrega al día guardado como Lunes', () => {
    const addToSchedule = vi.fn();
    const anime = { id: 7, title: 'Dandadan', airDay: 'Jueves', source: 'Viki' };
    render(<DayPickerModal showDayPicker={anime} setShowDayPicker={vi.fn()} watchLater={[]} addToSchedule={addToSchedule} moveFromWatchLaterToSchedule={vi.fn()} />);

    expect(screen.getByRole('heading', { name: /Which day do you want to watch "Dandadan"\?/ })).toBeInTheDocument();
    expect(screen.getByText('New episodes every Thursday on Viki')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Monday' }));
    expect(addToSchedule).toHaveBeenCalledWith(anime, 'Lunes');
  });

  it('mover de día oculta el día actual y pasa la clave en español', () => {
    const moveAnimeToDay = vi.fn();
    const anime = { id: 7, title: 'Dandadan' };
    render(<MoveDayPickerModal showMoveDayPicker={{ anime, fromDay: 'Lunes' }} setShowMoveDayPicker={vi.fn()} moveAnimeToDay={moveAnimeToDay} />);

    expect(screen.queryByRole('button', { name: 'Monday' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Saturday' }));
    expect(moveAnimeToDay).toHaveBeenCalledWith(anime, 'Lunes', 'Sábado');
  });

  it('la tarjeta traduce géneros de TMDB/Viki, temporada y día en pausa', () => {
    const anime = { id: 9, title: 'Dark', genres: ['Ciencia ficción y fantasía', 'Drama'], currentEp: 2, episodes: 10, currentSeason: 3, paused: true };
    render(<AnimeCard anime={anime} day="Miércoles" />);
    expect(screen.getByText('Sci-Fi & Fantasy')).toBeInTheDocument();
    expect(screen.getByText('Drama')).toBeInTheDocument();
    expect(screen.getByText('S3 · 2/10')).toBeInTheDocument();
    expect(screen.getByText('On hold · Wednesday')).toBeInTheDocument();
  });

  it('el buscador filtra por el tipo guardado aunque la etiqueta esté traducida', () => {
    const results = [
      { id: 1, title: 'Your Name', type: 'Película', source: 'TMDB', genres: ['Animación'] },
      { id: 2, title: 'Dark', type: 'Serie', source: 'TMDB', genres: [] },
    ];
    render(<SearchModal setShowSearch={vi.fn()} searchQuery="x" handleSearch={vi.fn()} searchResults={results} isSearching={false}
      setSearchResults={vi.fn()} setSearchQuery={vi.fn()} setShowDayPicker={vi.fn()} addToWatchLater={vi.fn()} markAsWatchedFromSearch={vi.fn()} />);

    expect(screen.getByText('Animation')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
    fireEvent.click(screen.getByRole('button', { name: 'Movie' }));
    expect(screen.getByText('Your Name')).toBeInTheDocument();
    expect(screen.queryByText('Dark')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2 results')).toBeInTheDocument();
  });

  it('la sinopsis no se traduce al español: se muestra la original', () => {
    localStorage.setItem('anitracker-tr-5', 'Una traducción vieja en caché.');
    const { result } = renderHook(() => useTranslatedSynopsis({ id: 5, synopsis: EN_SYNOPSIS }));
    expect(result.current).toBe(EN_SYNOPSIS);
    expect(translateEnToEs).not.toHaveBeenCalled();
  });

  it('la ficha muestra tipo, géneros, relaciones y enlaces en inglés, y la sinopsis original', async () => {
    fetchAnilistRelations.mockResolvedValueOnce([{ id: 21, title: 'Naruto: The Movie', type: 'Película', year: 2021, _relation: 'Secuela' }]);
    const noop = () => {};
    const anime = {
      id: 700000001, sourceKey: 'viki:1c', source: 'Viki', title: 'Crash Landing on You', type: 'Serie', year: '2019', episodes: 16,
      genres: ['Comedia romántica', 'Drama'], synopsis: EN_SYNOPSIS, currentEp: 4, paused: true, _day: 'Sábado',
      watchLink: 'https://example.com/watch/1',
      streamingLinks: [{ site: 'Viki', url: 'https://www.viki.com/tv/1c', language: 'subtítulos en español' }],
    };
    render(<AnimeDetailModal showAnimeDetail={anime} setShowAnimeDetail={noop} airingData={{}} updateEpisode={noop} updateUserRating={noop}
      updateAnimeLink={noop} mergeAnimeExtras={noop} markAsFinished={noop} dropAnime={noop} deleteAnime={noop} addToWatchLater={noop}
      markAsWatched={noop} setShowMoveDayPicker={noop} setShowDayPicker={noop} resumeAnime={noop} setAnimePaused={noop}
      addToCustomList={noop} removeFromCustomList={noop} />);

    const dialog = screen.getByRole('dialog', { name: 'Crash Landing on You' });
    expect(within(dialog).getByText('Series')).toBeInTheDocument();
    expect(within(dialog).getByText('16 episodes')).toBeInTheDocument();
    expect(within(dialog).getByText('Romantic Comedy')).toBeInTheDocument();
    expect(within(dialog).getByText('On hold · Saturday')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '▶ Resume on Saturday' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '▶ Watch now' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: '▶ Viki · Spanish subtitles' })).toBeInTheDocument();
    // Sin traducción automática: el texto original, sin "Traduciendo…".
    expect(within(dialog).getByText(EN_SYNOPSIS)).toBeInTheDocument();
    expect(translateEnToEs).not.toHaveBeenCalled();

    expect(await within(dialog).findByText('Sequel')).toBeInTheDocument();
    expect(within(dialog).getByText('Movie · 2021')).toBeInTheDocument();
  });

  it('un conflicto de sincronización nombra el lugar en inglés', () => {
    const week = (day, currentEp) => ({
      schedule: { ...Object.fromEntries(daysOfWeek.map((d) => [d, []])), [day]: [{ id: 1, title: 'Frieren', currentEp }] },
      watchedList: [], watchLater: [], customLists: [],
    });
    // Mismo campo editado en los dos lados: el lugar va en la etiqueta.
    const edited = inspectCloudSnapshot({ base: hashLibrary(week('Lunes', 1)), local: week('Lunes', 2), cloud: week('Lunes', 3) });
    expect(edited.conflicts).toMatchObject([{ key: 's:Lunes|1', field: 'currentEp', label: 'Frieren · Week · Monday' }]);

    // Cada lado la movió a un día distinto: las claves siguen en español.
    const moved = inspectCloudSnapshot({ base: hashLibrary(week('Lunes', 1)), local: week('Martes', 1), cloud: week('Miércoles', 1) });
    expect(moved.conflicts).toEqual([{ key: 'p|1', kind: 'placement', label: 'Frieren · Location', local: 'Week · Tuesday', cloud: 'Week · Wednesday' }]);
  });
});
