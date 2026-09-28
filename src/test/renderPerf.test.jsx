import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { daysOfWeek } from '../constants';

// Cuenta renders reales de cada tarjeta (el memo de afuera se conserva).
const cardRenders = { count: 0 };
vi.mock('../components/AnimeCard', async (importOriginal) => {
  const actual = await importOriginal();
  const Inner = actual.default.type;
  const Counted = (props) => { cardRenders.count += 1; return Inner(props); };
  return { default: React.memo(Counted) };
});
vi.mock('../hooks/useFirebase', () => {
  const stable = {
    user: null, syncing: false, syncError: null, syncTooLarge: false, retrySync: () => {},
    authError: '', authReady: true, authBusy: false, loginWithGoogle: () => {}, logout: () => {}, FIREBASE_ENABLED: false,
  };
  return { useFirebase: () => stable };
});
vi.mock('../services/searchAnime', async (importOriginal) => ({
  ...(await importOriginal()),
  searchAnime: vi.fn(() => new Promise(() => {})),
}));
vi.mock('../services/anilistService', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAiringByIds: vi.fn(async () => ({ byAnilist: {}, byMal: {} })),
  fetchSeason: vi.fn(() => new Promise(() => {})),
  fetchDirectory: vi.fn(() => new Promise(() => {})),
}));

const { default: App } = await import('../App');

const CARDS = 21;
function seedWeek() {
  const schedule = Object.fromEntries(daysOfWeek.map((day, d) => [day, Array.from({ length: 3 }, (_, i) => ({
    id: 1000 + d * 10 + i, title: `Anime ${d}-${i}`, episodes: 12, currentEp: 2, genres: [],
  }))]));
  localStorage.setItem('animeSchedule', JSON.stringify(schedule));
}

describe('rendimiento: la semana no se re-renderiza de más', () => {
  beforeEach(() => { localStorage.clear(); seedWeek(); cardRenders.count = 0; });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('tipear en la búsqueda no vuelve a renderizar las tarjetas de la semana', async () => {
    render(<App />);
    expect((await screen.findAllByText('Anime 0-0')).length).toBeGreaterThan(0);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Abrir buscador de anime' }));
    const input = await screen.findByRole('textbox', { name: /buscar/i });
    const before = cardRenders.count;
    for (const q of ['f', 'fr', 'fri', 'frie', 'frier']) fireEvent.change(input, { target: { value: q } });
    await act(async () => {});
    expect(cardRenders.count - before).toBe(0);
  });

  it('+1 en una tarjeta solo vuelve a renderizar esa tarjeta', async () => {
    render(<App />);
    await screen.findAllByText('Anime 0-0');
    await act(async () => {});
    const before = cardRenders.count;
    fireEvent.click(screen.getAllByRole('button', { name: 'Sumar un episodio' })[0]);
    await act(async () => {});
    // La tarjeta tocada (su render y el de la animación de confirmación), no las 21.
    expect(cardRenders.count - before).toBeLessThanOrEqual(3);
    expect(cardRenders.count - before).toBeLessThan(CARDS);
  });

  it('arrastrar por los días no vuelve a renderizar las tarjetas', async () => {
    const { container } = render(<App />);
    await screen.findAllByText('Anime 0-0');
    await act(async () => {});
    const dataTransfer = { setData: () => {}, effectAllowed: '', dropEffect: '' };
    const card = container.querySelector('[data-anime-id="1000"]');
    await act(async () => { fireEvent.dragStart(card, { dataTransfer }); await new Promise((r) => setTimeout(r, 0)); });
    const before = cardRenders.count;
    const rows = container.querySelectorAll('.day-row');
    for (const row of [rows[1], rows[2], rows[3]]) fireEvent.dragOver(row, { dataTransfer });
    await act(async () => {});
    expect(container.querySelector('.day-row.drop-target')).toBe(rows[3]);
    expect(cardRenders.count - before).toBe(0);
  });
});
