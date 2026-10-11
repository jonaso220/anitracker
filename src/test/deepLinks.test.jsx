import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// Mismo arnés que weekOnboarding.test.jsx: la app entera con Firebase mockeado,
// para probar el enrutado por hash de punta a punta.
const fb = vi.hoisted(() => ({
  state: null,
  login: vi.fn(),
}));
vi.mock('../hooks/useFirebase', () => ({ useFirebase: () => fb.state }));
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

const guest = {
  user: null, cloudLoaded: false, syncing: false, syncError: null, syncTooLarge: false, retrySync: () => {},
  authError: '', authReady: true, authBusy: false, loginWithGoogle: fb.login, logout: () => {}, FIREBASE_ENABLED: true,
};

async function openAt(hash) {
  window.history.replaceState(null, '', hash || '/');
  render(<App />);
  await act(async () => {});
}

describe('deep links por pestaña', () => {
  beforeEach(() => { localStorage.clear(); fb.state = { ...guest }; });
  afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState(null, '', '/'); });

  it('abre directamente en la pestaña del enlace', async () => {
    localStorage.setItem('watchedAnimes', JSON.stringify([{ id: 8, title: 'Historial desde enlace', finished: true }]));
    await openAt('#/vistas');
    expect(screen.getByRole('tab', { name: /Vistas/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Historial desde enlace')).toBeInTheDocument();
  });

  it('un hash desconocido cae en Semana y se canonicaliza', async () => {
    await openAt('#/no-existe');
    expect(screen.getByRole('tab', { name: /Semana/ })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.hash).toBe('#/semana');
  });

  it('cambiar de pestaña actualiza la URL y el botón atrás vuelve', async () => {
    await openAt('#/semana');
    fireEvent.click(screen.getByRole('tab', { name: /Listas/ }));
    expect(window.location.hash).toBe('#/listas');

    act(() => {
      window.history.replaceState(null, '', '#/semana');
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(screen.getByRole('tab', { name: /Semana/ })).toHaveAttribute('aria-selected', 'true');
  });
});
