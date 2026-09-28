// Comparación de textos para la búsqueda: normalización y palabras con
// significado. Sin esto "el oficinista…" matcheaba "El Hazard" y "los
// simpson" matcheaba "LOS ANGELES LAKERS" solo por el artículo.

export const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const STOPWORDS = new Set([
  // español
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'al', 'y', 'e', 'o', 'u', 'en',
  'que', 'con', 'por', 'para', 'su', 'sus', 'se', 'mi', 'tu', 'lo',
  // inglés
  'the', 'of', 'and', 'an', 'to', 'in', 'on', 'at', 'for', 'is', 'my',
]);

const splitWords = (text) => normalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Palabras de la consulta que importan (si todas son vacías, todas). */
export function meaningfulWords(query) {
  const words = splitWords(query);
  const kept = words.filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return kept.length ? kept : words;
}

/**
 * Fracción (0–1) de palabras con significado de la consulta que empiezan
 * alguna palabra de los títulos ("simpson" → "Simpsons", no "el" → "Hazard").
 */
export function wordMatchRatio(titles, query) {
  const words = meaningfulWords(query);
  if (!words.length) return 0;
  const titleWords = [...new Set(titles.flatMap(splitWords))];
  return words.filter((w) => titleWords.some((tw) => tw.startsWith(w))).length / words.length;
}
