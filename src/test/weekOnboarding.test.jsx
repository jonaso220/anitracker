import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { daysOfWeek } from '../constants';

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
const emptyWeek = () => Object.fromEntries(daysOfWeek.map((d) => [d, []]));

async function renderApp() {
  render(<App />);
  await act(async () => {});
}

describe('semana vacía', () => {
  beforeEach(() => { localStorage.clear(); fb.state = { ...guest }; fb.login.mockClear(); });
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('muestra la bienvenida en vez de siete días vacíos, con Buscar como acción principal', async () => {
    await renderApp();
    expect(screen.getByRole('heading', { name: 'Armá tu semana' })).toBeInTheDocument();
    expect(screen.queryByText('Sin animes este día')).not.toBeInTheDocument();
    const [first] = screen.getAllByRole('button', { name: /Buscar Anime, doramas/ });
    expect(first).toHaveClass('is-primary');
  });

  it('cada acción lleva a su lugar: buscador, temporada, importar', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Buscar Anime, doramas/ }));
    expect(await screen.findByRole('textbox', { name: 'Buscar anime o pegar una URL' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar buscador' }));

    fireEvent.click(screen.getByRole('button', { name: /Importar de AniList/ }));
    expect(await screen.findByRole('dialog', { name: 'Importar desde AniList' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));

    fireEvent.click(screen.getByRole('button', { name: /Ver la temporada/ }));
    expect(screen.getByRole('tab', { name: /Temporada/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('si hay pendientes en Después, pasarlos es lo primero', async () => {
    localStorage.setItem('watchLater', JSON.stringify([{ id: 1, title: 'A' }, { id: 2, title: 'B' }]));
    await renderApp();
    const action = screen.getByRole('button', { name: /Pasar de Después/ });
    expect(action).toHaveClass('is-primary');
    expect(action).toHaveTextContent('Tenés 2 animes guardados para ver');
    fireEvent.click(action);
    expect(screen.getByRole('tab', { name: /Después/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('invitado: ofrece iniciar sesión para traer la semana de otro dispositivo', async () => {
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: 'Iniciá sesión con Google' }));
    expect(fb.login).toHaveBeenCalled();
  });

  it('con sesión, mientras no llegó la nube muestra "Trayendo tu semana…" en vez de la bienvenida', async () => {
    fb.state = { ...guest, user: { uid: 'u1' }, cloudLoaded: false };
    await renderApp();
    expect(screen.getByRole('status')).toHaveTextContent('Trayendo tu semana…');
    expect(screen.queryByRole('heading', { name: 'Armá tu semana' })).not.toBeInTheDocument();
  });

  it('con sesión y la nube cargada vacía: bienvenida sin el botón de iniciar sesión', async () => {
    fb.state = { ...guest, user: { uid: 'u1' }, cloudLoaded: true };
    await renderApp();
    expect(screen.getByRole('heading', { name: 'Armá tu semana' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciá sesión con Google' })).not.toBeInTheDocument();
  });

  it('con algo en la semana (aunque sea en pausa) se ve la semana normal', async () => {
    localStorage.setItem('animeSchedule', JSON.stringify({ ...emptyWeek(), Lunes: [{ id: 5, title: 'Pausado', paused: true }] }));
    await renderApp();
    expect(screen.queryByRole('heading', { name: 'Armá tu semana' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /En pausa/ })).toBeInTheDocument();
  });

  it('al abrir, una biblioteca guardada con el par que chocaba queda migrada en el dispositivo', async () => {
    localStorage.setItem('animeSchedule', JSON.stringify({ ...emptyWeek(), Lunes: [{ id: 450000, sourceKey: 'tvmaze:50000', title: 'Serie TVMaze' }] }));
    localStorage.setItem('watchLater', JSON.stringify([{ id: 450000, sourceKey: 'anilist:150000', title: 'Donghua' }]));
    localStorage.setItem('anitracker-discovery-ignored', JSON.stringify([450001]));
    await renderApp();
    expect(JSON.parse(localStorage.getItem('watchLater'))[0].id).toBe(800150000);
    expect(JSON.parse(localStorage.getItem('animeSchedule')).Lunes[0].id).toBe(450000);
    expect(JSON.parse(localStorage.getItem('anitracker-discovery-ignored'))).toEqual([800150001]);
  });
});
