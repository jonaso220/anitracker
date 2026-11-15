import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../components/Header';

it('disables Google during initialization and displays auth errors', () => {
  const loginWithGoogle = vi.fn();
  const { rerender } = render(<Header firebaseEnabled authReady={false} loginWithGoogle={loginWithGoogle} />);
  expect(screen.getByRole('button', { name: 'Iniciar sesión con Google' })).toBeDisabled();
  rerender(<Header firebaseEnabled authReady authError="El navegador bloqueó la ventana de Google." loginWithGoogle={loginWithGoogle} />);
  expect(screen.getByRole('alert').textContent).toContain('bloqueó');
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión con Google' }));
  expect(loginWithGoogle).toHaveBeenCalledOnce();
});
it('shows a retry control after a cloud read or write failure', () => {
  const onRetrySync = vi.fn();
  render(<Header user={{uid:'u1'}} syncError onRetrySync={onRetrySync} />);
  fireEvent.click(screen.getByRole('button', {name:'Menú de usuario'}));
  fireEvent.click(screen.getByRole('button', {name:'Reintentar sincronización'}));
  expect(onRetrySync).toHaveBeenCalledOnce();
});

it('el estado de la nube no dice "Sincronizado" sin conexión ni con cambios pendientes', () => {
  const { rerender } = render(<Header user={{ uid: 'u1', displayName: 'Ana' }} syncStatus="offline" />);
  fireEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }));
  expect(screen.getByText(/Sin conexión · los cambios quedan/)).toBeInTheDocument();
  expect(screen.queryByText('☁️ Sincronizado')).not.toBeInTheDocument();

  rerender(<Header user={{ uid: 'u1', displayName: 'Ana' }} syncStatus="pending" />);
  expect(screen.getByText('☁️ Cambios pendientes')).toBeInTheDocument();

  rerender(<Header user={{ uid: 'u1', displayName: 'Ana' }} syncStatus="synced" />);
  expect(screen.getByText('☁️ Sincronizado')).toBeInTheDocument();
});

it('el menú es un disclosure: botones comunes y Escape devuelve el foco', () => {
  render(<Header user={{ uid: 'u1' }} setDarkMode={vi.fn()} />);
  const trigger = screen.getByRole('button', { name: 'Menú de usuario' });
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  expect(screen.queryByRole('menu')).toBeNull();
  const item = screen.getByRole('button', { name: 'Copia de seguridad' });
  item.focus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(document.activeElement).toBe(trigger);
});
