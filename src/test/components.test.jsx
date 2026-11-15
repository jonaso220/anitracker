import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AnimeCard from '../components/AnimeCard';
import DiscoveryCard from '../components/DiscoveryCard';
import SeasonSection from '../components/SeasonSection';
import DirectorySection from '../components/DirectorySection';
import AnimeDetailModal from '../components/modals/AnimeDetailModal';
import SearchModal from '../components/modals/SearchModal';
import DayPickerModal from '../components/modals/DayPickerModal';
import BackupModal from '../components/modals/BackupModal';
import CustomListsTab from '../components/CustomListsTab';
import DirectoryListRow from '../components/DirectoryListRow';
import ImportModal from '../components/modals/ImportModal';
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
    const progressFill = container.querySelector('.card-progress-track > span');
    expect(progressFill).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '120');
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

  it('custom lists offer editing and scheduling without invalid agenda actions', async () => {
    render(<AnimeDetailModal {...baseProps} showAnimeDetail={{...detailAnime, _isDirectory: false, _isCustomList: true, _customListId: 'l1'}} setShowAnimeDetail={noop} />);
    expect(screen.queryByRole('button', {name: '✓ Finalizar'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '✗ Dropear'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: '↔ Mover día'})).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: '📅 Añadir a semana'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Siguiente episodio'})).toBeInTheDocument();
    await screen.findByText('🎬 Más de este anime');
  });

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
    expect(chips.some((text) => text.includes('Crunchyroll'))).toBe(false); // primary link already shows it
    expect(chips[0]).toContain('JKAnime'); // link fan generado a partir del título
    expect(chips[1]).toContain('AnimeFLV · buscar');
    expect(chips[chips.length - 1]).toContain('HIDIVE');
    const verAhora = screen.getByRole('link', { name: '▶ Ver en Crunchyroll' }).closest('a');
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

describe('DayPickerModal', () => {
  const renderPicker = (anime, addToSchedule = vi.fn()) => render(
    <DayPickerModal showDayPicker={anime} setShowDayPicker={vi.fn()} watchLater={[]} addToSchedule={addToSchedule} moveFromWatchLaterToSchedule={vi.fn()} />,
  );

  it('highlights the air day reported by the source', () => {
    const addToSchedule = vi.fn();
    const anime = { id: 700041650, title: 'El oficinista que ganó la lotería', source: 'Viki', airDay: 'Jueves' };
    renderPicker(anime, addToSchedule);
    expect(screen.getByText(/Nuevos episodios los jueves en Viki/)).toBeInTheDocument();
    const thursday = screen.getByRole('button', { name: /Jueves/ });
    expect(thursday).toHaveClass('suggested');
    fireEvent.click(thursday);
    expect(addToSchedule).toHaveBeenCalledWith(anime, 'Jueves');
  });

  it('shows no suggestion without an air day', () => {
    renderPicker({ id: 1, title: 'Naruto' });
    expect(screen.queryByText(/Nuevos episodios/)).toBeNull();
    expect(document.querySelector('.day-btn.suggested')).toBeNull();
  });
});

describe('BackupModal', () => {
  // jsdom's File has no .text(); the modal only needs that.
  const file = (content) => ({ name: 'backup.json', text: () => Promise.resolve(content) });
  const renderModal = (props = {}) => render(
    <BackupModal onClose={vi.fn()} onExport={vi.fn()} onRestore={vi.fn()} {...props} />,
  );

  it('avisa que reemplaza en todos los dispositivos cuando hay sesión', () => {
    renderModal({ synced: true });
    expect(screen.getByText(/en todos tus dispositivos sincronizados/)).toBeInTheDocument();
  });

  it('muestra cuántas entradas inválidas se omiten y restaura solo las válidas', async () => {
    const onRestore = vi.fn();
    const { container } = renderModal({ onRestore });
    const input = container.querySelector('#backup-file');
    fireEvent.change(input, { target: { files: [file(JSON.stringify({ watchedList: [{ id: 1, title: 'A' }, 'basura'] }))] } });
    expect(await screen.findByText(/Se omitirá 1 entrada inválida/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar datos' }));
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ watchedList: [{ id: 1, title: 'A' }], skipped: 1 }));
  });

  it('ofrece descargar la copia actual antes de restaurar', async () => {
    const onExport = vi.fn();
    const { container } = renderModal({ onExport });
    fireEvent.change(container.querySelector('#backup-file'), { target: { files: [file(JSON.stringify({ watchLater: [] }))] } });
    fireEvent.click(await screen.findByRole('button', { name: /descargá una copia de lo actual/ }));
    expect(onExport).toHaveBeenCalled();
  });
});

describe('CustomListsTab: renombrar', () => {
  it('permite escribir espacios y Enter sin plegar la lista', () => {
    const onRenameList = vi.fn();
    render(<CustomListsTab customLists={[{ id: 'l1', name: 'Favs', emoji: '⭐', items: [] }]}
      onCreateList={vi.fn()} onDeleteList={vi.fn()} onRenameList={onRenameList} onRemoveFromList={vi.fn()} onDetail={vi.fn()} airingData={{}} />);
    const header = screen.getByRole('button', { expanded: true });
    fireEvent.click(screen.getByRole('button', { name: 'Renombrar Favs' }));
    const input = screen.getByDisplayValue('Favs');

    const space = fireEvent.keyDown(input, { key: ' ' });
    expect(space).toBe(true); // no se canceló: el espacio se escribe
    fireEvent.change(input, { target: { value: 'Mis favs' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRenameList).toHaveBeenCalledWith('l1', 'Mis favs');
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });

  it('el encabezado sigue plegándose con teclado', () => {
    render(<CustomListsTab customLists={[{ id: 'l1', name: 'Favs', emoji: '⭐', items: [] }]}
      onCreateList={vi.fn()} onDeleteList={vi.fn()} onRenameList={vi.fn()} onRemoveFromList={vi.fn()} onDetail={vi.fn()} airingData={{}} />);
    const header = screen.getByRole('button', { expanded: true });
    fireEvent.keyDown(header, { key: ' ' });
    expect(header).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('modales migrados a useAccessibleDialog', () => {
  it('BackupModal y SearchModal cierran con Escape aunque el foco esté afuera', () => {
    const onClose = vi.fn();
    const { unmount } = render(<BackupModal onClose={onClose} onExport={vi.fn()} onRestore={vi.fn()} />);
    document.body.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const setShowSearch = vi.fn();
    render(<SearchModal setShowSearch={setShowSearch} searchQuery="" handleSearch={vi.fn()} searchResults={[]} isSearching={false}
      setSearchResults={vi.fn()} setSearchQuery={vi.fn()} setShowDayPicker={vi.fn()} addToWatchLater={vi.fn()} markAsWatchedFromSearch={vi.fn()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(setShowSearch).toHaveBeenCalledWith(false);
  });
});

describe('NavTabs', () => {
  it('cada pestaña tiene nombre accesible, con el contador si hay', async () => {
    const { default: NavTabs } = await import('../components/NavTabs');
    render(<NavTabs activeTab="schedule" counts={{ watchLater: 3 }} onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Semana' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Después (3)' })).toBeInTheDocument();
  });
});

describe('AnimeCard sin portada', () => {
  it('muestra la inicial y no renderiza un <img src=""> (el navegador volvería a pedir la página)', () => {
    const { container } = render(<AnimeCard anime={{ id: 1, title: 'Sin imagen', image: '', imageSm: '' }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.img-fallback')).toHaveStyle({ display: 'flex' });
    expect(container.querySelector('.img-fallback')).toHaveTextContent('S');
  });
});

describe('Directorio: página entera ya agregada', () => {
  beforeEach(() => { localStorage.clear(); });
  const noop = () => {};
  const filters = { search: '', genre: '', demography: '', format: '', status: '', year: '', season: '', sort: 'POPULARITY_DESC' };
  const directory = (over = {}) => ({
    filters, results: [{ id: 1, title: 'Ya la tengo', image: '', genres: [], rating: 8 }],
    loading: false, loadingMore: false, hasNextPage: true,
    updateFilter: vi.fn(), resetFilters: vi.fn(), loadInitial: noop, loadMore: vi.fn(), ...over,
  });
  const props = {
    schedule: {}, watchedList: [{ id: 1, title: 'Ya la tengo' }], watchLater: [],
    preferences: { personalized: false, hideAdded: true, genre: 'all', platform: 'all' },
    setShowDayPicker: noop, addToWatchLater: noop, markAsWatched: noop, onDetail: noop,
  };

  it('explica que todo está en la biblioteca y deja seguir cargando', () => {
    const dir = directory();
    const setPreferences = vi.fn();
    render(<DirectorySection {...props} setPreferences={setPreferences} directory={dir} />);
    expect(screen.queryByText('Sin resultados con esos filtros')).not.toBeInTheDocument();
    expect(screen.getByText('Todo lo de esta página ya está en tu biblioteca.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cargar más'));
    expect(dir.loadMore).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar añadidos' }));
    expect(setPreferences).toHaveBeenCalled();
    expect(setPreferences.mock.calls[0][0](props.preferences).hideAdded).toBe(false);
  });

  it('sin más páginas no ofrece "Cargar más"', () => {
    render(<DirectorySection {...props} directory={directory({ hasNextPage: false })} />);
    expect(screen.getByText('Todo lo de esta página ya está en tu biblioteca.')).toBeInTheDocument();
    expect(screen.queryByText('Cargar más')).not.toBeInTheDocument();
  });
});

describe('Temporada: vacío por filtros vs. nada se emite', () => {
  const noop = () => {};
  const now = new Date();
  const month = now.getMonth() + 1;
  const currentSeason = {
    season: month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL',
    year: now.getFullYear(),
  };
  const nowSec = Math.floor(now.getTime() / 1000);
  const show = { id: 1, title: 'Today Show', image: '', genres: [], rating: 8, _airing: { nextEpisode: 3, nextAiringAt: nowSec } };
  const baseProps = {
    seasonLoading: false, schedule: {}, watchLater: [], selectedSeason: currentSeason,
    onChangeSeason: noop, setShowDayPicker: noop, addToWatchLater: noop, markAsWatched: noop, onDetail: noop,
  };

  it('con "Ocultar añadidos" dice que ya está todo en la biblioteca', () => {
    render(<SeasonSection {...baseProps} seasonAnime={[show]} watchedList={[{ id: 1, title: 'Today Show' }]}
      preferences={{ personalized: false, hideAdded: true, genre: 'all', platform: 'all' }} setPreferences={noop} />);
    expect(screen.queryByText('Ningún anime se emite este día')).not.toBeInTheDocument();
    expect(screen.getByText('Ya tenés en tu biblioteca todo lo que hay acá.')).toBeInTheDocument();
    // También en "Todos".
    fireEvent.click(screen.getByRole('tab', { name: 'Todos' }));
    expect(screen.getByText('Ya tenés en tu biblioteca todo lo que hay acá.')).toBeInTheDocument();
  });

  it('un filtro de género que oculta todo no se confunde con "nada se emite"', () => {
    render(<SeasonSection {...baseProps} seasonAnime={[{ ...show, genres: ['Drama'] }]} watchedList={[]}
      preferences={{ personalized: false, hideAdded: false, genre: 'Action', platform: 'all' }} setPreferences={noop} />);
    expect(screen.getByText('Hay 1 anime acá, pero tus filtros lo ocultan.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar filtros' })).toBeInTheDocument();
  });

  it('un día sin emisiones sigue diciendo que no se emite nada', () => {
    const otherDay = { ...show, _airing: { nextEpisode: 3, nextAiringAt: nowSec + 86400 } };
    render(<SeasonSection {...baseProps} seasonAnime={[otherDay]} watchedList={[]} />);
    expect(screen.getByText('Ningún anime se emite este día')).toBeInTheDocument();
  });
});

describe('accesibilidad de controles', () => {
  it('la fila del Directorio se abre con un botón real (teclado)', () => {
    const onDetail = vi.fn();
    const anime = { id: 9, title: 'Fila', genres: [], synopsis: 'Texto en español para la sinopsis.' };
    render(<DirectoryListRow anime={anime} onDetail={onDetail} onAddToSchedule={vi.fn()} onAddToWatchLater={vi.fn()} onMarkWatched={vi.fn()} />);
    const open = screen.getByRole('button', { name: 'Abrir detalles de Fila' });
    expect(open.tagName).toBe('BUTTON');
    fireEvent.click(open);
    expect(onDetail).toHaveBeenCalledWith(anime);
    // Las acciones no abren la ficha.
    fireEvent.click(screen.getByRole('button', { name: 'Ver después' }));
    expect(onDetail).toHaveBeenCalledTimes(1);
  });

  it('el ✕ de una lista personalizada nombra el anime y la lista', () => {
    const onRemoveFromList = vi.fn();
    const onDetail = vi.fn();
    render(<CustomListsTab customLists={[{ id: 'l1', name: 'Favs', emoji: '⭐', items: [{ id: 5, title: 'Frieren' }] }]}
      onCreateList={vi.fn()} onDeleteList={vi.fn()} onRenameList={vi.fn()} onRemoveFromList={onRemoveFromList} onDetail={onDetail} airingData={{}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Frieren de Favs' }));
    expect(onRemoveFromList).toHaveBeenCalledWith('l1', 5);
    expect(onDetail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha de Frieren' }));
    expect(onDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 5, _customListId: 'l1', _isCustomList: true }));
  });

  it('el indicador de estado en Vistas tiene nombre y distingue dropeada de en pausa', () => {
    const { rerender } = render(<AnimeCard anime={{ id: 1, title: 'A', finished: true }} isWatched />);
    expect(screen.getByRole('img', { name: 'Completada' })).toBeInTheDocument();
    rerender(<AnimeCard anime={{ id: 1, title: 'A', finished: false }} isWatched />);
    const dropped = screen.getByRole('img', { name: 'Dropeada' });
    expect(dropped).not.toHaveTextContent('⏸');
  });

  it('el usuario de AniList tiene etiqueta', () => {
    render(<ImportModal onClose={vi.fn()} onImport={vi.fn()} />);
    expect(screen.getByLabelText('Usuario de AniList')).toBeInTheDocument();
  });
});

describe('AnimeDetailModal: quitar de una lista', () => {
  beforeEach(() => {
    localStorage.clear();
    clearRelationsCache();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { Media: null } }) });
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('el ✕ de cada lista tiene nombre accesible', () => {
    const noop = () => {};
    const removeFromCustomList = vi.fn();
    const anime = { id: 30, title: 'Bocchi', genres: [], synopsis: '', _isWatchLater: true };
    render(<AnimeDetailModal showAnimeDetail={anime} setShowAnimeDetail={noop} airingData={{}}
      updateEpisode={noop} updateUserRating={noop} updateAnimeLink={noop} markAsFinished={noop} dropAnime={noop}
      deleteAnime={noop} addToWatchLater={noop} markAsWatched={noop} setShowMoveDayPicker={noop} setShowDayPicker={noop}
      resumeAnime={noop} addToCustomList={noop} removeFromCustomList={removeFromCustomList}
      customLists={[{ id: 'l1', name: 'Favs', emoji: '⭐', items: [{ id: 30, title: 'Bocchi' }] }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar de Favs' }));
    expect(removeFromCustomList).toHaveBeenCalledWith('l1', 30);
  });
});
