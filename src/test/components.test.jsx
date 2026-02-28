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

  it('renders episode badge when currentEp > 0', () => {
    const { container } = render(<AnimeCard anime={mockAnime} airingData={{}} onClick={() => {}} />);
    const epBadge = container.querySelector('.anime-card-ep');
    expect(epBadge).toBeInTheDocument();
    expect(epBadge.textContent).toContain('120');
  });

  it('renders progress bar when episodes known', () => {
    const { container } = render(<AnimeCard anime={mockAnime} airingData={{}} onClick={() => {}} />);
    const progressFill = container.querySelector('.card-progress-fill');
    expect(progressFill).toBeInTheDocument();
  });

  it('renders genres', () => {
    render(<AnimeCard anime={mockAnime} airingData={{}} onClick={() => {}} />);
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Adventure')).toBeInTheDocument();
  });

  it('renders completed badge for watched finished anime', () => {
    const finished = { ...mockAnime, finished: true };
    const { container } = render(<AnimeCard anime={finished} airingData={{}} isWatched onClick={() => {}} />);
    const badge = container.querySelector('.status-badge.finished');
    expect(badge).toBeInTheDocument();
  });

  it('renders dropped badge for watched unfinished anime', () => {
    const dropped = { ...mockAnime, finished: false };
    const { container } = render(<AnimeCard anime={dropped} airingData={{}} isWatched onClick={() => {}} />);
    const badge = container.querySelector('.status-badge.dropped');
    expect(badge).toBeInTheDocument();
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
  };

  it('renders total count', () => {
    render(<StatsPanel stats={mockStats} />);
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('renders stat labels', () => {
    render(<StatsPanel stats={mockStats} />);
    expect(screen.getByText('Total animes')).toBeInTheDocument();
    expect(screen.getByText('En semana')).toBeInTheDocument();
    expect(screen.getByText('Completados')).toBeInTheDocument();
  });

  it('renders genre bars', () => {
    render(<StatsPanel stats={mockStats} />);
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Comedy')).toBeInTheDocument();
  });
});
