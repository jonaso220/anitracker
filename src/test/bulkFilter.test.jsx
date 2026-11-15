import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useCallback, useRef, useState } from 'react';
import WatchedView from '../components/views/WatchedView';
import WatchLaterView from '../components/views/WatchLaterView';
import { useBulkMode } from '../hooks/useBulkMode';
import { useBulkActions } from '../hooks/useBulkActions';

// Estado + ref con el último valor, como usePersistedState.
function useStateWithRef(initial) {
  const [state, setState] = useState(initial);
  const ref = useRef(initial);
  const set = useCallback((update) => setState((prev) => {
    const next = typeof update === 'function' ? update(prev) : update;
    ref.current = next;
    return next;
  }), []);
  return [state, set, ref];
}

const noop = () => {};

// Cablea la vista como App.jsx: useBulkMode + useBulkActions reales.
function Harness({ tab, initial }) {
  const [, setSchedule, scheduleRef] = useStateWithRef({});
  const [watchedList, setWatchedList, watchedListRef] = useStateWithRef(tab === 'watched' ? initial : []);
  const [watchLater, setWatchLater, watchLaterRef] = useStateWithRef(tab === 'watchLater' ? initial : []);
  const [localSearch, setLocalSearch] = useState('');
  const [watchedFilter, setWatchedFilter] = useState('all');
  const [watchedSort, setWatchedSort] = useState('title');
  const bulk = useBulkMode();
  const actions = useBulkActions({
    activeTab: tab,
    setSchedule, scheduleRef, setWatchedList, watchedListRef, setWatchLater, watchLaterRef,
    bulkSelected: bulk.bulkSelected, exitBulkMode: bulk.exitBulkMode, showToast: noop,
  });
  const common = {
    airingData: {}, localSearch, setLocalSearch,
    bulkMode: bulk.bulkMode, bulkSelected: bulk.bulkSelected,
    enterBulkMode: bulk.enterBulkMode, exitBulkMode: bulk.exitBulkMode,
    toggleBulkSelect: bulk.toggleBulkSelect, bulkSelectAll: bulk.bulkSelectAll, bulkDeselectAll: bulk.bulkDeselectAll,
    onBulkDelete: actions.bulkDelete, setShowAnimeDetail: noop,
  };
  return (
    <>
      <output data-testid="ids">{(tab === 'watched' ? watchedList : watchLater).map((a) => a.id).join(',')}</output>
      {tab === 'watched'
        ? <WatchedView {...common} watchedList={watchedList} watchedFilter={watchedFilter} setWatchedFilter={setWatchedFilter} watchedSort={watchedSort} setWatchedSort={setWatchedSort} />
        : <WatchLaterView {...common} watchLater={watchLater} onOpenBulkDayPicker={noop} onBulkMarkWatched={actions.bulkMarkWatched} />}
    </>
  );
}

const toolbar = () => screen.getByRole('toolbar', { name: 'Acciones en lote' });

describe('acciones en lote con filtros', () => {
  it('Vistas: seleccionar todo, filtrar y borrar solo borra lo filtrado', () => {
    const initial = [
      { id: 1, title: 'A', finished: true },
      { id: 2, title: 'B', finished: false },
      { id: 3, title: 'C', finished: true },
      { id: 4, title: 'D', finished: false },
    ];
    render(<Harness tab="watched" initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: '☑ Seleccionar' }));
    fireEvent.click(within(toolbar()).getByRole('button', { name: '☑ Seleccionar todo' }));
    expect(within(toolbar()).getByText('4 seleccionados')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '✓ Completadas' }));
    // El contador refleja solo lo visible.
    expect(within(toolbar()).getByText('2 seleccionados')).toBeInTheDocument();

    fireEvent.click(within(toolbar()).getByRole('button', { name: '🗑 Eliminar' }));
    expect(screen.getByTestId('ids')).toHaveTextContent('2,4');
  });

  it('Vistas: la búsqueda local también recorta la selección', () => {
    const initial = [
      { id: 1, title: 'Frieren', finished: true },
      { id: 2, title: 'Bocchi', finished: true },
      { id: 3, title: 'Mushishi', finished: true },
      { id: 4, title: 'Monster', finished: true },
    ];
    render(<Harness tab="watched" initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: '☑ Seleccionar' }));
    fireEvent.click(within(toolbar()).getByRole('button', { name: '☑ Seleccionar todo' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Filtrar lista por nombre' }), { target: { value: 'mo' } });
    expect(within(toolbar()).getByText('1 seleccionado')).toBeInTheDocument();
    fireEvent.click(within(toolbar()).getByRole('button', { name: '🗑 Eliminar' }));
    expect(screen.getByTestId('ids')).toHaveTextContent('1,2,3');
  });

  it('Después: filtrar por valoración y marcar vistos solo toca lo visible', () => {
    const initial = [
      { id: 1, title: 'A', rating: 9.1 },
      { id: 2, title: 'B', rating: 6 },
      { id: 3, title: 'C', rating: 9.5 },
      { id: 4, title: 'D', rating: 7 },
    ];
    render(<Harness tab="watchLater" initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: '☑ Seleccionar' }));
    fireEvent.click(within(toolbar()).getByRole('button', { name: '☑ Seleccionar todo' }));
    fireEvent.click(screen.getByRole('button', { name: '9+' }));
    expect(within(toolbar()).getByText('2 seleccionados')).toBeInTheDocument();
    fireEvent.click(within(toolbar()).getByRole('button', { name: '✓ Marcar vistos' }));
    expect(screen.getByTestId('ids')).toHaveTextContent('2,4');
  });

  it('Después: un filtro de valoración sin coincidencias no dice "No hay animes guardados"', () => {
    const initial = [1, 2, 3, 4].map((id) => ({ id, title: `T${id}`, rating: 6 }));
    render(<Harness tab="watchLater" initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: '9+' }));
    expect(screen.queryByText('No hay animes guardados')).not.toBeInTheDocument();
    expect(screen.getByText('Ningún anime guardado tiene 9 o más de valoración')).toBeInTheDocument();
  });
});
