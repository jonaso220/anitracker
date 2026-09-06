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
  fireEvent.click(screen.getByRole('menuitem', {name:'Reintentar sincronización'}));
  expect(onRetrySync).toHaveBeenCalledOnce();
});
