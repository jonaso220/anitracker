import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnimeCard from '../components/AnimeCard';
import StatsPanel from '../components/StatsPanel';
import DiscoveryCard from '../components/DiscoveryCard';
import SeasonSection from '../components/SeasonSection';
import DirectorySection from '../components/DirectorySection';
import AnimeDetailModal from '../components/modals/AnimeDetailModal';
import SearchModal from '../components/modals/SearchModal';
import TodayPanel from '../components/TodayPanel';
import { buildAgenda } from '../agenda';
import { clearRelationsCache } from '../services/anilistService';

const mockAnime = {
  id: 1,
  title: 'Naruto Shippuden',
  titleJp: 'ナルト 疾風伝',
  image: 'https://example.com/naruto.jpg',
  imageSm: 'https://example.com/naruto-sm.jpg',
  genres: ['Action', 'Adventure'],
  rating: 8.2,
  episodes: 500,
  currentEp: 120,
  userRating: 4,
  watchLink: '',
};

describe('SearchModal URL search', () => {
  const crunchyrollUrl = 'https://www.crunchyroll.com/es-es/series/GDKHZEJ0K/solo-leveling?utm_source=share';
  const renderSearch = (overrides = {}) => render(
    <SearchModal
      setShowSearch={vi.fn()}
      searchQuery={crunchyrollUrl}
      handleSearch={vi.fn()}
      searchResults={[{
        ...mockAnime,
        id: 151807,
        title: 'Solo Leveling',
        source: 'MAL',
        malUrl: 'https://myanimelist.net/anime/151807',
        watchLink: crunchyrollUrl,
      }]}
      isSearching={false}
      setSearchResults={vi.fn()}
      setSearchQuery={vi.fn()}
      setShowDayPicker={vi.fn()}
      addToWatchLater={vi.fn()}
      markAsWatchedFromSearch={vi.fn()}
      {...overrides}
    />,
  );

  it('confirms the extracted title and the exact URL that will be saved', () => {
    renderSearch();
    expect(screen.getByText(/Buscando/)).toHaveTextContent('Buscando solo leveling');
    expect(screen.getByRole('link', { name: '✓ URL de Crunchyroll lista' })).toHaveAttribute('href', crunchyrollUrl);
    expect(screen.getByText('Solo Leveling')).toBeInTheDocument();
  });

  it('explains that a Crunchyroll episode URL cannot identify the series', () => {
    renderSearch({
      searchQuery: 'https://www.crunchyroll.com/watch/GN7UNM9XJ/the-final-battle',
      searchResults: [],
    });
    expect(screen.getByText('No pude identificar el anime desde esa URL.')).toBeInTheDocument();
    expect(screen.getByText(/página de la serie/)).toBeInTheDocument();
  });
});

describe('TodayPanel', () => {
  afterEach(() => vi.useRealTimers());

  const sundaySchedule = (sunday, monday = []) => ({
    Lunes: monday, Martes: [], Miércoles: [], Jueves: [], Viernes: [], Sábado: [], Domingo: sunday,
  });

  it('recommends today\'s episode only while it is still pending', () => {
    const now = new Date('2026-07-12T15:00:00Z');
    const due = { id: 101, title: 'Sale hoy', currentEp: 2, episodes: 12 };
    const caughtUp = { id: 102, title: 'Ya al día', currentEp: 3, episodes: 12 };
    const airingData = {
      101: { episode: 3, isToday: true, hasAired: false, airingAt: 1783868400 },
      102: { episode: 3, isToday: true, hasAired: false, airingAt: 1783868400 },
    };

    const agenda = buildAgenda(sundaySchedule([due, caughtUp]), airingData, now);
    expect(agenda.active.day).toBe('Domingo');
    expect(agenda.active.items.map((anime) => anime.title)).toEqual(['Sale hoy']);
    expect(agenda.active.items[0]._nextToWatch).toBe(3);
  });

  it('moves the next pending day into the main column as soon as today is completed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T15:00:00Z'));
    const onIncrementEpisode = vi.fn();
    const today = { id: 201, title: 'Domingo pendiente', currentEp: 2, episodes: 12, image: 'today.jpg' };
    const tomorrow = { id: 202, title: 'Lunes atrasado', currentEp: 0, episodes: 12, image: 'next.jpg' };
    const airingData = {
      201: { episode: 3, isToday: true, hasAired: false, airingAt: 1783868400 },
      202: { episode: 4, isToday: false, hasAired: false, airingAt: 1784127600 },
    };
    const { rerender } = render(
      <TodayPanel schedule={sundaySchedule([today], [tomorrow])} airingData={airingData} onDetail={() => {}} onIncrementEpisode={onIncrementEpisode} />,
    );

    expect(screen.getByText('Domingo pendiente')).toBeInTheDocument();
    expect(screen.getByText('Lunes atrasado')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Marcar episodio 3 de Domingo pendiente'));
    expect(onIncrementEpisode).toHaveBeenCalledWith(201, 1);

    rerender(
      <TodayPanel schedule={sundaySchedule([{ ...today, currentEp: 3 }], [tomorrow])} airingData={airingData} onDetail={() => {}} onIncrementEpisode={onIncrementEpisode} />,
    );
    expect(screen.queryByText('Domingo pendiente')).not.toBeInTheDocument();
    expect(screen.getByText('▶ Continuar · Lunes')).toBeInTheDocument();
    expect(screen.getByText('Ver episodio 1 · 3 pendientes')).toBeInTheDocument();
  });

  it('does not recommend a future episode when the user is already caught up', () => {
    const future = { id: 301, title: 'Al día hasta la semana que viene', currentEp: 3, episodes: 12 };
    const airingData = { 301: { episode: 4, isToday: false, hasAired: false, airingAt: 1784473200 } };
    expect(buildAgenda(sundaySchedule([future]), airingData, new Date('2026-07-12T15:00:00Z')).active).toBeNull();
  });
});

describe('AnimeCard', () => {
  it('renders anime title', () => {
    render(<AnimeCard anime={mockAnime} airingData={{}} onClick={() => {}} />);
    expect(screen.getByText('Naruto Shippuden')).toBeInTheDocument();
  });

  it('renders score badge when rating > 0', () => {
    const { container } = render(<AnimeCard anime={mockAnime} airingData={{}} onClick={() => {}} />);
    expect(container.querySelector('.anime-card-score')).toBeInTheDocument();
  });

  it('renders progress bar when episodes known', () => {
    const { container } = render(<AnimeCard anime={mockAnime} airingData={{}} onClick={() => {}} />);
    const progressFill = container.querySelector('.anime-card-progress-fill');
    expect(progressFill).toBeInTheDocument();
    // 120 / 500 → 24%
    expect(progressFill.style.width).toBe('24%');
  });

  it('renders genres', () => {
    render(<AnimeCard anime={mockAnime} airingData={{}} onClick={() => {}} />);
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Adventure')).toBeInTheDocument();
  });

  it('renders completed badge for watched finished anime', () => {
    const finished = { ...mockAnime, finished: true };
    const { container } = render(<AnimeCard anime={finished} airingData={{}} isWatched onClick={() => {}} />);
    const badge = container.querySelector('.anime-card-status-pill.finished');
    expect(badge).toBeInTheDocument();
  });

  it('renders dropped badge for watched unfinished anime', () => {
    const dropped = { ...mockAnime, finished: false };
    const { container } = render(<AnimeCard anime={dropped} airingData={{}} isWatched onClick={() => {}} />);
    const badge = container.querySelector('.anime-card-status-pill.dropped');
    expect(badge).toBeInTheDocument();
  });

  it('renders hover strip with the airing day for episodes further out than tomorrow', () => {
    // Un sábado fijo (2026-07-11 12:00 UTC) para que el nombre del día sea estable.
    const airingData = {
      1: { episode: 9, airingAt: 1783771200, timeUntilAiring: 200000, isToday: false, isTomorrow: false, isThisWeek: true, hasAired: false },
    };
    const { container } = render(<AnimeCard anime={mockAnime} airingData={airingData} onClick={() => {}} />);
    const strip = container.querySelector('.anime-card-airing.airing-later');
    expect(strip).toBeInTheDocument();
    expect(strip.textContent).toContain('Ep. 9');
    expect(strip.textContent).toContain('Sábado');
    expect(container.querySelector('.anime-card.has-airing-later')).toBeInTheDocument();
  });

  it('keeps the always-visible badge (and no hover strip) when the episode airs today', () => {
    const airingData = {
      1: { episode: 9, airingAt: Math.floor(Date.now() / 1000) + 3600, timeUntilAiring: 3600, isToday: true, isTomorrow: false, isThisWeek: true, hasAired: false },
    };
    const { container } = render(<AnimeCard anime={mockAnime} airingData={airingData} onClick={() => {}} />);
    expect(container.querySelector('.anime-card-airing.airing-today')).toBeInTheDocument();
    expect(container.querySelector('.anime-card-airing.airing-later')).not.toBeInTheDocument();
  });

  it('shows animated feedback after incrementing an episode', () => {
    const onIncrementEpisode = vi.fn();
    const { container } = render(
      <AnimeCard anime={{ ...mockAnime, currentEp: 2, episodes: 12 }} airingData={{}} onIncrementEpisode={onIncrementEpisode} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sumar un episodio' }));

    expect(onIncrementEpisode).toHaveBeenCalledWith(mockAnime.id, 1);
    expect(container.querySelector('.quick-ep-value.is-confirmed')).toBeInTheDocument();
    expect(container.querySelector('.quick-ep-feedback')).toHaveTextContent('✓ +1');
  });

  it('allows incrementing when the provider omits the episode total', () => {
    const onIncrementEpisode = vi.fn();
    render(
      <AnimeCard anime={{ ...mockAnime, currentEp: 3, episodes: undefined }} airingData={{}} onIncrementEpisode={onIncrementEpisode} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sumar un episodio' }));

    expect(onIncrementEpisode).toHaveBeenCalledWith(mockAnime.id, 1);
  });
});

describe('DiscoveryCard', () => {
  const noop = () => {};
  const baseProps = { onDetail: noop, onAddToSchedule: noop, onAddToWatchLater: noop, onMarkWatched: noop };
  const discoveryAnime = { id: 7, title: 'Seasonal Show', image: 'https://example.com/x.jpg', genres: [], rating: 7.5 };

  it('renders the last aired episode footer', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const { container } = render(
      <DiscoveryCard {...baseProps} anime={discoveryAnime} airing={{ lastEpisode: 3, lastAiredAt: nowSec - 3 * 3600 }} />
    );
    expect(container.querySelector('.season-card-airing')).toBeInTheDocument();
    expect(screen.getByText(/Último capítulo/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('hace 3 horas')).toBeInTheDocument();
  });

  it('renders a premiere countdown when nothing has aired yet', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    render(
      <DiscoveryCard {...baseProps} anime={discoveryAnime} airing={{ nextEpisode: 1, nextAiringAt: nowSec + 3 * 86400 + 60 }} />
    );
    expect(screen.getByText('Estreno')).toBeInTheDocument();
    expect(screen.getByText('en 3 días')).toBeInTheDocument();
  });

  it('renders no footer without airing info', () => {
    const { container } = render(<DiscoveryCard {...baseProps} anime={discoveryAnime} />);
    expect(container.querySelector('.season-card-airing')).not.toBeInTheDocument();
  });

  it('shows the "Continúa" tag for shows carried over from previous seasons', () => {
    render(<DiscoveryCard {...baseProps} anime={{ ...discoveryAnime, _continuing: true }} />);
    expect(screen.getByText('Continúa')).toBeInTheDocument();
  });
});

describe('SeasonSection', () => {
  const noop = () => {};
  const now = new Date();
  const month = now.getMonth() + 1;
  const currentSeason = {
    season: month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL',
    year: now.getFullYear(),
  };
  const nowSec = Math.floor(now.getTime() / 1000);
  const baseProps = {
    seasonLoading: false, schedule: {}, watchedList: [], watchLater: [],
    onChangeSeason: noop, setShowDayPicker: noop, addToWatchLater: noop, markAsWatched: noop, onDetail: noop,
  };
  // nextAiringAt = ahora → cae siempre en el día local de hoy.
  const airingToday = {
    id: 1, title: 'Today Show', image: '', genres: [], rating: 8,
    _airing: { lastEpisode: 2, lastAiredAt: nowSec - 2 * 3600, nextEpisode: 3, nextAiringAt: nowSec },
  };

  it('shows day tabs with HOY marker for the current season, defaulting to today', () => {
    render(<SeasonSection {...baseProps} seasonAnime={[airingToday]} selectedSeason={currentSeason} />);
    expect(screen.getAllByRole('tab')).toHaveLength(8); // 7 días + "Todos"
    expect(screen.getByText('HOY')).toBeInTheDocument();
    expect(screen.getByText('Today Show')).toBeInTheDocument();
    expect(screen.getByText('hace 2 horas')).toBeInTheDocument();
  });

  it('switching to the "Todos" tab hides continuing shows', () => {
    const continuing = { ...airingToday, id: 2, title: 'Continuing Show', _continuing: true };
    render(<SeasonSection {...baseProps} seasonAnime={[airingToday, continuing]} selectedSeason={currentSeason} />);
    // En la pestaña de hoy aparecen ambos.
    expect(screen.getByText('Continuing Show')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Todos' }));
    expect(screen.getByText('Today Show')).toBeInTheDocument();
    expect(screen.queryByText('Continuing Show')).not.toBeInTheDocument();
  });

  it('renders a plain grid without day tabs for past seasons', () => {
    render(<SeasonSection {...baseProps} seasonAnime={[{ id: 3, title: 'Old Show', image: '', genres: [], rating: 7 }]} selectedSeason={{ season: 'WINTER', year: 2020 }} />);
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByText('Old Show')).toBeInTheDocument();
  });
});

describe('DirectorySection', () => {
  beforeEach(() => { localStorage.clear(); });
  const noop = () => {};
  const makeDirectory = (over = {}) => ({
    filters: { search: '', genre: '', demography: '', format: '', status: '', year: '', season: '', sort: 'POPULARITY_DESC' },
    results: [], loading: false, loadingMore: false, hasNextPage: false,
    updateFilter: vi.fn(), resetFilters: vi.fn(), loadInitial: noop, loadMore: vi.fn(),
    ...over,
  });
  const baseProps = {
    schedule: {}, watchedList: [], watchLater: [],
    setShowDayPicker: noop, addToWatchLater: noop, markAsWatched: noop, onDetail: noop,
  };

  it('renders the filter controls and results grid', () => {
    const directory = makeDirectory({ results: [{ id: 1, title: 'Dir Show', image: '', genres: [], rating: 8 }], hasNextPage: true });
    render(<DirectorySection {...baseProps} directory={directory} />);
    expect(screen.getByLabelText(/Género/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Estado/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Ordenar por/)).toBeInTheDocument();
    expect(screen.getByText('Dir Show')).toBeInTheDocument();
    expect(screen.getByText('Cargar más')).toBeInTheDocument();
  });

  it('changing a select calls updateFilter and loadMore loads the next page', () => {
    const directory = makeDirectory({ results: [{ id: 1, title: 'Dir Show', image: '', genres: [], rating: 8 }], hasNextPage: true });
    render(<DirectorySection {...baseProps} directory={directory} />);
    fireEvent.change(screen.getByLabelText(/Género/), { target: { value: 'Action' } });
    expect(directory.updateFilter).toHaveBeenCalledWith('genre', 'Action');
    fireEvent.click(screen.getByText('Cargar más'));
    expect(directory.loadMore).toHaveBeenCalled();
  });

  it('toggles to list view with rows and remembers the choice', () => {
    const directory = makeDirectory({ results: [{ id: 1, title: 'Dir Show', image: '', genres: ['Action'], rating: 8, synopsis: 'Una sinopsis.', type: 'TV', year: '2020' }] });
    const { container } = render(<DirectorySection {...baseProps} directory={directory} />);
    expect(container.querySelector('.season-grid')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Vista de lista'));
    expect(container.querySelector('.season-grid')).not.toBeInTheDocument();
    expect(container.querySelector('.directory-list')).toBeInTheDocument();
    expect(screen.getByText('Dir Show')).toBeInTheDocument();
    expect(screen.getByText('Una sinopsis.')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('anitracker-directory-view'))).toBe('list');
  });

  it('shows the clear button only with active filters and empty state without results', () => {
    const inactive = makeDirectory();
    const { rerender } = render(<DirectorySection {...baseProps} directory={inactive} />);
    expect(screen.queryByText(/Limpiar filtros/)).not.toBeInTheDocument();
    expect(screen.getByText('Sin resultados con esos filtros')).toBeInTheDocument();

    const active = makeDirectory({ filters: { ...inactive.filters, genre: 'Action' } });
    rerender(<DirectorySection {...baseProps} directory={active} />);
    fireEvent.click(screen.getByText(/Limpiar filtros/));
    expect(active.resetFilters).toHaveBeenCalled();
  });
});

describe('AnimeDetailModal', () => {
  const noop = () => {};
  const baseProps = {
    airingData: {}, updateEpisode: noop, updateUserRating: noop, updateAnimeLink: noop,
    mergeAnimeExtras: noop, markAsFinished: noop, dropAnime: noop, deleteAnime: noop,
    addToWatchLater: noop, markAsWatched: noop, setShowMoveDayPicker: noop, setShowDayPicker: noop,
    resumeAnime: noop, addToCustomList: noop, removeFromCustomList: noop,
  };
  const detailAnime = {
    id: 20, sourceKey: 'mal:20', malId: 20, title: 'Naruto', image: 'x.jpg',
    genres: [], rating: 8, currentEp: 0, userRating: 0, watchLink: '',
    synopsis: 'Una historia que sigue a los ninjas de la aldea, con batallas y más aventuras para todos.',
    _isDirectory: true,
  };

  beforeEach(() => {
    localStorage.clear();
    clearRelationsCache();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        data: { Media: { relations: { edges: [
          { relationType: 'SEQUEL', node: { id: 21, idMal: 21, type: 'ANIME', format: 'MOVIE', seasonYear: 2021, title: { romaji: 'Naruto: The Movie' }, coverImage: {} } },
        ] } } },
      }),
    });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('recommends related works at the end of the card and opens them on click', async () => {
    const setShowAnimeDetail = vi.fn();
    render(<AnimeDetailModal {...baseProps} showAnimeDetail={detailAnime} setShowAnimeDetail={setShowAnimeDetail} />);
    expect(await screen.findByText('🎬 Más de este anime')).toBeInTheDocument();
    expect(screen.getByText('Naruto: The Movie')).toBeInTheDocument();
    expect(screen.getByText('Secuela')).toBeInTheDocument();
    expect(screen.getByText('Película · 2021')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Naruto: The Movie'));
    expect(setShowAnimeDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 21, _isDirectory: true }));
  });

  it('marks related works that are already in the library', async () => {
    render(<AnimeDetailModal {...baseProps} showAnimeDetail={detailAnime} setShowAnimeDetail={noop} libraryIds={new Set([21])} />);
    expect(await screen.findByLabelText('Ya está en tu biblioteca')).toBeInTheDocument();
  });

  it('no longer renders the notes section', async () => {
    render(<AnimeDetailModal {...baseProps} showAnimeDetail={detailAnime} setShowAnimeDetail={noop} />);
    expect(screen.queryByText('📝 Notas')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/notas sobre este anime/i)).not.toBeInTheDocument();
    await screen.findByText('🎬 Más de este anime'); // dejar asentar el efecto de relacionados
  });

  it('orders "Dónde ver" by preferred platform and never uses dead ones for "Ver ahora"', async () => {
    const anime = { ...detailAnime, watchLink: 'https://www.hidive.com/stream/x', streamingLinks: [
      { site: 'HIDIVE', url: 'https://www.hidive.com/stream/x', language: '' },
      { site: 'iQ', url: 'https://www.iq.com/x', language: '' },
      { site: 'Crunchyroll', url: 'https://www.crunchyroll.com/x', language: '' },
    ] };
    const { container } = render(<AnimeDetailModal {...baseProps} showAnimeDetail={anime} setShowAnimeDetail={noop} />);
    const chips = [...container.querySelectorAll('.streaming-chip')].map((el) => el.textContent);
    expect(chips[0]).toContain('Crunchyroll');
    expect(chips[1]).toContain('JKAnime'); // link fan generado a partir del título
    expect(chips[2]).toContain('AnimeFLV · buscar');
    expect(chips[chips.length - 1]).toContain('HIDIVE');
    const verAhora = screen.getByText('▶ Ver ahora').closest('a');
    expect(verAhora.getAttribute('href')).toBe('https://www.crunchyroll.com/x');
    await screen.findByText('🎬 Más de este anime'); // dejar asentar el efecto de relacionados
  });

  it('shows Spanish synopses as-is, querying only AniList (no translators)', async () => {
    render(<AnimeDetailModal {...baseProps} showAnimeDetail={detailAnime} setShowAnimeDetail={noop} />);
    expect(screen.getByText(detailAnime.synopsis)).toBeInTheDocument();
    await screen.findByText('🎬 Más de este anime');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const urls = globalThis.fetch.mock.calls.map((c) => String(c[0]));
    expect(urls.every((u) => u.includes('graphql.anilist.co'))).toBe(true);
  });
});

describe('StatsPanel', () => {
  const mockStats = {
    totalSchedule: 5,
    totalWatched: 10,
    totalWatchLater: 3,
    finished: 8,
    dropped: 2,
    totalEps: 150,
    avgRating: '7.5',
    topGenres: [['Action', 10], ['Comedy', 7], ['Drama', 3]],
    allTotal: 18,
    ratingDist: [0, 0, 0, 0, 0, 1, 2, 3, 2, 2],
    ratedCount: 10,
  };

  it('renders summary values', () => {
    render(<StatsPanel stats={mockStats} />);
    expect(screen.getByText('18')).toBeInTheDocument(); // allTotal
    expect(screen.getByText('150')).toBeInTheDocument(); // totalEps
    expect(screen.getByText('7.5')).toBeInTheDocument(); // avgRating
  });

  it('renders summary card labels', () => {
    render(<StatsPanel stats={mockStats} />);
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByText('En horario')).toBeInTheDocument();
    expect(screen.getByText('Episodios')).toBeInTheDocument();
  });

  it('renders the library composition and genre charts', () => {
    render(<StatsPanel stats={mockStats} />);
    expect(screen.getByText('Composición de tu biblioteca')).toBeInTheDocument();
    expect(screen.getByText('Géneros favoritos')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Comedy')).toBeInTheDocument();
  });

  it('renders the rating distribution when there are ratings', () => {
    render(<StatsPanel stats={mockStats} />);
    expect(screen.getByText('Tus puntuaciones')).toBeInTheDocument();
  });

  it('hides charts gracefully when everything is empty', () => {
    const emptyStats = {
      totalSchedule: 0, totalWatched: 0, totalWatchLater: 0,
      finished: 0, dropped: 0, totalEps: 0, avgRating: '—',
      topGenres: [], allTotal: 0, ratingDist: [], ratedCount: 0,
    };
    render(<StatsPanel stats={emptyStats} />);
    expect(screen.queryByText('Géneros favoritos')).not.toBeInTheDocument();
    expect(screen.queryByText('Composición de tu biblioteca')).not.toBeInTheDocument();
    expect(screen.queryByText('Tus puntuaciones')).not.toBeInTheDocument();
  });
});
