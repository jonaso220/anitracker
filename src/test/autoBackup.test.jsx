import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook } from '@testing-library/react';
import {
  MAX_SNAPSHOTS,
  clearAutoBackups,
  countScheduled,
  listAutoBackups,
  readAutoBackup,
  saveAutoBackup,
} from '../autoBackup';
import { useAutoBackup } from '../hooks/useAutoBackup';
import BackupModal from '../components/modals/BackupModal';

const lib = (watchedList = [], schedule = {}) => ({ schedule, watchedList, watchLater: [], customLists: [] });
const brokenFactory = { open: () => { throw new Error('IndexedDB no disponible'); } };

/** Espera (con timers reales) a que haya exactamente `n` copias guardadas. */
async function waitForCount(n) {
  for (let i = 0; i < 50; i++) {
    if ((await listAutoBackups()).length === n) return true;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  return false;
}

describe('autoBackup (IndexedDB)', () => {
  beforeEach(async () => { await clearAutoBackups(); localStorage.clear(); });

  it('guarda una copia y la lista con su resumen', async () => {
    const meta = await saveAutoBackup(lib([{ id: 1 }, { id: 2 }], { Lunes: [{ id: 3 }] }), 'u1', new Date('2026-08-01T10:00:00Z'));
    expect(meta).toMatchObject({ owner: 'u1', counts: { schedule: 1, watched: 2, watchLater: 0, lists: 0 } });
    const list = await listAutoBackups();
    expect(list).toHaveLength(1);
    expect(list[0].at).toBe('2026-08-01T10:00:00.000Z');
  });

  it('devuelve la biblioteca completa al leerla', async () => {
    const data = lib([{ id: 7, title: 'Vuelve' }], { Martes: [{ id: 8 }] });
    const meta = await saveAutoBackup(data);
    expect(await readAutoBackup(meta.id)).toEqual(data);
  });

  it(`conserva solo las últimas ${MAX_SNAPSHOTS} copias, de la más nueva a la más vieja`, async () => {
    for (let i = 1; i <= MAX_SNAPSHOTS + 2; i++) {
      // Cada copia tiene `i` animes, así se distingue cuáles sobrevivieron.
      const entries = Array.from({ length: i }, (_, k) => ({ id: k }));
      await saveAutoBackup(lib(entries), null, new Date(`2026-08-0${i}T10:00:00Z`));
    }
    const list = await listAutoBackups();
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list.map((b) => b.counts.watched)).toEqual([5, 4, 3]);
  });

  it('no rompe nada si IndexedDB no está disponible', async () => {
    expect(await saveAutoBackup(lib([{ id: 1 }]), null, new Date(), brokenFactory)).toBeNull();
    expect(await listAutoBackups(brokenFactory)).toEqual([]);
    expect(await readAutoBackup(1, brokenFactory)).toBeNull();
    await expect(clearAutoBackups(brokenFactory)).resolves.toBeUndefined();
  });

  it('devuelve null al leer una copia que no existe', async () => {
    expect(await readAutoBackup(999)).toBeNull();
  });

  it('cuenta los animes del horario', () => {
    expect(countScheduled({ Lunes: [{ id: 1 }], Martes: [{ id: 2 }, { id: 3 }] })).toBe(3);
    expect(countScheduled(undefined)).toBe(0);
  });
});

describe('useAutoBackup', () => {
  beforeEach(async () => { cleanup(); await clearAutoBackups(); localStorage.clear(); });

  const props = (over = {}) => ({
    schedule: { Lunes: [{ id: 1 }] }, watchedList: [], watchLater: [], customLists: [], owner: 'u1', ...over,
  });

  it('guarda una copia cuando hay datos', async () => {
    renderHook(() => useAutoBackup(props()));
    expect(await waitForCount(1)).toBe(true);
  });

  it('no guarda dos veces el mismo día', async () => {
    const { rerender } = renderHook((p) => useAutoBackup(p), { initialProps: props() });
    expect(await waitForCount(1)).toBe(true);
    rerender(props({ schedule: { Lunes: [{ id: 1 }, { id: 2 }] } }));
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(await listAutoBackups()).toHaveLength(1);
  });

  it('no guarda nada si la biblioteca está vacía', async () => {
    renderHook(() => useAutoBackup({ schedule: {}, watchedList: [], watchLater: [], customLists: [], owner: null }));
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    expect(await listAutoBackups()).toHaveLength(0);
  });
});

describe('BackupModal con copias automáticas', () => {
  beforeEach(async () => { cleanup(); await clearAutoBackups(); localStorage.clear(); });

  it('las lista y las restaura desde el modal', async () => {
    await saveAutoBackup(lib([{ id: 42, title: 'Recuperado' }]), 'u1', new Date('2026-08-01T10:00:00Z'));
    const onRestore = vi.fn();
    render(<BackupModal onClose={() => {}} onExport={() => {}} onRestore={onRestore} />);

    expect(await screen.findByText(/Copias automáticas/)).toBeInTheDocument();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Restaurar' }))[0]);

    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar datos' }));
    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({
      watchedList: [{ id: 42, title: 'Recuperado' }],
    }));
  });
});
