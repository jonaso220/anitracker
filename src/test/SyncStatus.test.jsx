import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SyncStatus from '../components/SyncStatus';
it.each([['synced', 'Sincronizado'], ['pending', 'Cambios pendientes'], ['offline', 'Sin conexión']])('shows %s outside the account menu', (status, label) => {
  render(<SyncStatus status={status} />);
  expect(screen.getByRole('status')).toHaveTextContent(label);
});
it('shows both conflicting values, explains preservation, and passes an explicit choice', () => {
  const onResolve = vi.fn(), onDownload = vi.fn();
  render(<SyncStatus status="conflict" conflict={{ conflicts: [{ key: 'w|1', field: 'currentEp', label: 'Ficción', local: 2, cloud: 3 }], storageError: true }} onResolve={onResolve} onDownload={onDownload} />);
  fireEvent.click(screen.getByRole('button', { name: 'Revisar diferencias' }));
  expect(screen.getByRole('region', { name: 'Resolver diferencias entre dispositivos' })).toHaveTextContent('Ficción · Episodio');
  expect(screen.getByText('2')).toBeInTheDocument(); expect(screen.getByText('3')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('sincronización sigue pausada');
  fireEvent.click(screen.getByRole('button', { name: 'Descargar ambas versiones' }));
  expect(onDownload).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Usar nube en las diferencias' }));
  expect(onResolve).toHaveBeenCalledWith('cloud');
});
