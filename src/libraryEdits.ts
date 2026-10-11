// Capture only the entry being changed, including its neighbours for undo.

type Identifiable = { id: string | number };

/** Instantánea de una entrada de una lista, con sus vecinas, para deshacer. */
export interface EntrySnapshot<T extends Identifiable> {
  item: T;
  index: number;
  beforeId?: T['id'];
  afterId?: T['id'];
}

export function captureEntry<T extends Identifiable>(list: T[], id: T['id']): EntrySnapshot<T> | null {
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return null;
  return {
    item: structuredClone(list[index]),
    index,
    beforeId: list[index - 1]?.id,
    afterId: list[index + 1]?.id,
  };
}

export function restoreEntry<T extends Identifiable>(list: T[], entry: EntrySnapshot<T> | null): T[] {
  if (!entry || list.some((item) => item.id === entry.item.id)) return list;
  const after = list.findIndex((item) => item.id === entry.afterId);
  const before = list.findIndex((item) => item.id === entry.beforeId);
  const index = after >= 0 ? after : before >= 0 ? before + 1 : Math.min(entry.index, list.length);
  return [...list.slice(0, index), entry.item, ...list.slice(index)];
}

/** Suma `delta` al episodio actual, sin bajar de 0 ni pasar del total (si hay). */
export function changeEpisode(current: number | string | null | undefined, delta: number, total?: number | string | null): number {
  const count = Number(current) || 0;
  const limit = Number(total);
  const next = Math.max(0, count + delta);
  return limit > 0 ? Math.min(next, limit) : next;
}
