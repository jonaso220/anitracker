import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from '../components/modals/SettingsModal';
import * as episodeAlerts from '../episodeAlerts';
import * as i18n from '../i18n';

vi.mock('../episodeAlerts', async (original) => ({
  ...(await original()),
  alertsSupported: vi.fn(() => true),
  alertsPermission: vi.fn(() => 'default'),
  requestAlertsPermission: vi.fn(async () => 'granted'),
}));

const anilistBase = {
  available: true, connected: false, viewerName: '', status: 'idle', pendingCount: 0,
  lastSyncedAt: null, lastError: '', sendableCount: 0, connect: vi.fn(), disconnect: vi.fn(), syncNow: vi.fn(), sendAll: vi.fn(),
};

const renderModal = (props = {}) => {
  const onSetAlerts = vi.fn();
  render(<SettingsModal onClose={() => {}} alertsEnabled={false} onSetAlerts={onSetAlerts} anilist={null} {...props} />);
  return { onSetAlerts };
};

beforeEach(() => {
  vi.clearAllMocks();
  episodeAlerts.alertsSupported.mockReturnValue(true);
  episodeAlerts.alertsPermission.mockReturnValue('default');
  episodeAlerts.requestAlertsPermission.mockResolvedValue('granted');
});

describe('SettingsModal · avisos', () => {
  it('prender los avisos pide permiso y solo los activa si se concede', async () => {
    const { onSetAlerts } = renderModal();
    fireEvent.click(screen.getByRole('checkbox', { name: /Avisarme cuando sale un episodio/ }));
    await waitFor(() => expect(onSetAlerts).toHaveBeenCalledWith(true));
    expect(episodeAlerts.requestAlertsPermission).toHaveBeenCalledTimes(1);
  });

  it('si el permiso se niega quedan apagados y se explica cómo habilitarlos', async () => {
    episodeAlerts.requestAlertsPermission.mockResolvedValue('denied');
    const { onSetAlerts } = renderModal();
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(onSetAlerts).toHaveBeenCalledWith(false));
    expect(await screen.findByText(/Bloqueaste las notificaciones/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('apagarlos no pide permiso', () => {
    episodeAlerts.alertsPermission.mockReturnValue('granted');
    const { onSetAlerts } = renderModal({ alertsEnabled: true });
    const toggle = screen.getByRole('checkbox');
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(onSetAlerts).toHaveBeenCalledWith(false);
    expect(episodeAlerts.requestAlertsPermission).not.toHaveBeenCalled();
  });

  it('sin soporte del navegador el control queda deshabilitado con una explicación', () => {
    episodeAlerts.alertsSupported.mockReturnValue(false);
    episodeAlerts.alertsPermission.mockReturnValue('unsupported');
    renderModal();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText(/no permite notificaciones/)).toBeInTheDocument();
  });
});

describe('SettingsModal · AniList', () => {
  it('no muestra la sección si la función no está disponible', () => {
    renderModal({ anilist: null });
    expect(screen.queryByText(/Progreso en AniList/)).toBeNull();
  });

  it('sin conectar ofrece conectar la cuenta', () => {
    const anilist = { ...anilistBase };
    renderModal({ anilist });
    fireEvent.click(screen.getByRole('button', { name: 'Conectar con AniList' }));
    expect(anilist.connect).toHaveBeenCalledTimes(1);
  });

  it('conectada muestra el usuario, el estado y permite desconectar', () => {
    const anilist = { ...anilistBase, connected: true, viewerName: 'jona', status: 'syncing', pendingCount: 2 };
    renderModal({ anilist });
    expect(screen.getByText(/Conectado como jona/)).toBeInTheDocument();
    expect(screen.getByText(/Enviando/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar AniList' }));
    expect(anilist.disconnect).toHaveBeenCalledTimes(1);
  });

  it('enviar toda la biblioteca pide confirmación, dice cuántos son y cuánto tarda', () => {
    const anilist = { ...anilistBase, connected: true, viewerName: 'jona', sendableCount: 172 };
    renderModal({ anilist });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar toda mi biblioteca' }));
    expect(anilist.sendAll).not.toHaveBeenCalled();
    const confirm = screen.getByRole('group', { name: '¿Enviar toda tu biblioteca a AniList?' });
    expect(confirm).toHaveTextContent('Son 172 animes');
    expect(confirm).toHaveTextContent('cerca de 7 min'); // 172 × 2,1 s
    fireEvent.click(screen.getByRole('button', { name: 'Sí, enviar todo' }));
    expect(anilist.sendAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: '¿Enviar toda tu biblioteca a AniList?' })).toBeNull();
  });

  it('cancelar la confirmación no envía nada', () => {
    const anilist = { ...anilistBase, connected: true, sendableCount: 5 };
    renderModal({ anilist });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar toda mi biblioteca' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(anilist.sendAll).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Enviar toda mi biblioteca' })).toBeEnabled();
  });

  it('mientras envía muestra cuántos quedan y no deja lanzar otro envío', () => {
    const anilist = { ...anilistBase, connected: true, status: 'syncing', pendingCount: 40, sendableCount: 172 };
    renderModal({ anilist });
    expect(screen.getByText('Enviando… quedan 40.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar toda mi biblioteca' })).toBeDisabled();
  });

  it('sin nada que se pueda enviar el botón queda deshabilitado', () => {
    renderModal({ anilist: { ...anilistBase, connected: true, sendableCount: 0 } });
    expect(screen.getByRole('button', { name: 'Enviar toda mi biblioteca' })).toBeDisabled();
  });

  it('con la sesión vencida ofrece volver a conectar', () => {
    const anilist = { ...anilistBase, connected: true, viewerName: 'jona', status: 'expired' };
    renderModal({ anilist });
    fireEvent.click(screen.getByRole('button', { name: 'Volver a conectar' }));
    expect(anilist.connect).toHaveBeenCalledTimes(1);
  });

  it('un error muestra el detalle que informa la sincronización', () => {
    const anilist = { ...anilistBase, connected: true, status: 'error', lastError: 'Cambios que AniList no aceptó: 1' };
    renderModal({ anilist });
    expect(screen.getByRole('alert')).toHaveTextContent('Cambios que AniList no aceptó: 1');
  });
});

describe('SettingsModal · idioma', () => {
  it('lista los idiomas y, al elegir uno, guarda la preferencia y recarga', () => {
    const reload = vi.fn();
    renderModal({ reload });
    const select = screen.getByRole('combobox', { name: 'Idioma de la app' });
    expect([...select.options].map((o) => o.value)).toEqual(['auto', 'es', 'en']);
    fireEvent.change(select, { target: { value: 'en' } });
    expect(localStorage.getItem(i18n.LOCALE_KEY)).toBe('en');
    expect(reload).toHaveBeenCalledTimes(1);
    localStorage.removeItem(i18n.LOCALE_KEY);
  });
});
