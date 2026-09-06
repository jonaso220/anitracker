// Capture only the entry being changed, including its neighbours for undo.
export function captureEntry(list, id) {
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return null;
  return {
    item: structuredClone(list[index]), index,
    beforeId: list[index - 1]?.id, afterId: list[index + 1]?.id,
  };
}

export function restoreEntry(list, entry) {
  if (!entry || list.some((item) => item.id === entry.item.id)) return list;
  const after = list.findIndex((item) => item.id === entry.afterId);
  const before = list.findIndex((item) => item.id === entry.beforeId);
  const index = after >= 0 ? after : before >= 0 ? before + 1 : Math.min(entry.index, list.length);
  return [...list.slice(0, index), entry.item, ...list.slice(index)];
}

export function changeEpisode(current, delta, total) {
  const count = Number(current) || 0;
  const limit = Number(total);
  const next = Math.max(0, count + delta);
  return limit > 0 ? Math.min(next, limit) : next;
}
