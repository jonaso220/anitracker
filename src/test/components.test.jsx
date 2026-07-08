import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnimeCard from '../components/AnimeCard';
import StatsPanel from '../components/StatsPanel';

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
  notes: '',
};

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
