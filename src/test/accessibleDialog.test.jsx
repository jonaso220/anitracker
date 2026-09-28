import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';
import UpdateBanner from '../components/UpdateBanner';
import StorageErrorBanner from '../components/StorageErrorBanner';

function Dialog({ name, onClose }) {
  const ref = useAccessibleDialog(onClose);
  return (
    <div className="modal-overlay">
      <div ref={ref} role="dialog" aria-label={name} tabIndex={-1}>
        <button>{`${name} botón`}</button>
      </div>
    </div>
  );
}

function Harness({ onCloseA, onCloseB }) {
  const [a, setA] = useState(true);
  const [b, setB] = useState(true);
  return (
    <div className="anime-tracker">
      <main data-testid="page">Página</main>
      {a && <Dialog name="A" onClose={() => { onCloseA(); setA(false); }} />}
      {b && <Dialog name="B" onClose={() => { onCloseB(); setB(false); }} />}
    </div>
  );
}

describe('useAccessibleDialog', () => {
  it('Escape cierra solo el diálogo de arriba, y el fondo queda inerte hasta cerrar todos', () => {
    const onCloseA = vi.fn();
    const onCloseB = vi.fn();
    render(<Harness onCloseA={onCloseA} onCloseB={onCloseB} />);
    const page = screen.getByTestId('page');
    expect(page).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseB).toHaveBeenCalledTimes(1);
    expect(onCloseA).not.toHaveBeenCalled();
    // A sigue abierto: el fondo no se reactiva al cerrar B.
    expect(page).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCloseA).toHaveBeenCalledTimes(1);
    expect(page).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });

  it('usa siempre el onClose más reciente', () => {
    const first = vi.fn();
    const second = vi.fn();
    function Swap() {
      const [handler, setHandler] = useState(() => first);
      const ref = useAccessibleDialog(handler);
      return <div ref={ref}><button onClick={() => setHandler(() => second)}>cambiar</button></div>;
    }
    render(<Swap />);
    fireEvent.click(screen.getByText('cambiar'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('avisos flotantes', () => {
  it('el aviso de actualización se puede dejar para más tarde', () => {
    const onDismiss = vi.fn();
    render(<UpdateBanner visible onUpdate={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Más tarde' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('el aviso de almacenamiento se puede cerrar', () => {
    render(<StorageErrorBanner />);
    act(() => { window.dispatchEvent(new CustomEvent('anitracker-storage-error', { detail: { key: 'x', error: new Error('bloqueado') } })); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
