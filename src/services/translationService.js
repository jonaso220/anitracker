// Translation service with fallback providers.
// Order: Google Translate (unofficial endpoint) → MyMemory.
// Returns the translated string, or null if every provider fails.
//
// Both are GET requests with a length cap (MyMemory rejects queries over 500
// characters with "QUERY LENGTH LIMIT EXCEEDED"; Google's URL gets too long
// past a few thousand), so long synopses are split into sentence-aligned
// chunks, translated in order and joined back with their original breaks.

// Error texts some providers return as if they were the translation.
const isProviderError = (text) => {
  if (!text || !text.trim()) return true;
  const upper = text.toUpperCase();
  // MyMemory error responses come in many shapes:
  // "MYMEMORY WARNING: ...", "MYMEMORY: Not found", "PLEASE SELECT TWO DISTINCT LANGUAGES",
  // "YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY", "QUERY LENGTH LIMIT EXCEEDED", etc.
  return upper.includes('MYMEMORY') || upper.includes('PLEASE SELECT')
    || upper.includes('YOU USED ALL AVAILABLE') || upper.includes('QUERY LENGTH LIMIT');
};

// Sanity check on the whole joined translation.
const isLikelyFailure = (text) => {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 4) return true;
  if (isProviderError(t)) return true;
  if (t.length > 50 && t === t.toUpperCase()) return true;
  return false;
};

// Largest piece of `text` (≤ max) ending at a space, or a hard cut if a single
// word is longer than max.
const cutAtWord = (text, max) => {
  if (text.length <= max) return [text, ''];
  const space = text.lastIndexOf(' ', max);
  const at = space > 0 ? space : max;
  return [text.slice(0, at), text.slice(at).trimStart()];
};

/**
 * Splits text into chunks of at most `max` characters, preferring paragraph
 * and sentence boundaries. Each chunk carries the separator that followed it
 * so the translation can be rejoined with the same line breaks.
 * Exported for tests.
 */
export function splitForTranslation(text, max) {
  const chunks = [];
  const paragraphs = text.split(/(\n+)/);
  for (let p = 0; p < paragraphs.length; p += 2) {
    const paragraph = paragraphs[p].trim();
    const breakAfter = paragraphs[p + 1] || '';
    if (!paragraph) {
      if (chunks.length && breakAfter) chunks[chunks.length - 1].sep += breakAfter;
      continue;
    }
    // Oración = signos sueltos del principio ("...y entonces") + texto +
    // signos finales y comillas. Sin pérdida: cada carácter cae en una.
    const sentences = paragraph.match(/[.!?…]*[^.!?…]+(?:[.!?…]+["'”’)\]]*)?\s*|[.!?…]+\s*/g) || [paragraph];
    let current = '';
    const flush = () => {
      if (current.trim()) chunks.push({ text: current.trim(), sep: ' ' });
      current = '';
    };
    for (const sentence of sentences) {
      if ((current + sentence).trim().length <= max) { current += sentence; continue; }
      flush();
      let rest = sentence.trim();
      while (rest.length > max) {
        const [head, tail] = cutAtWord(rest, max);
        chunks.push({ text: head, sep: ' ' });
        rest = tail;
      }
      current = rest ? `${rest} ` : '';
    }
    flush();
    if (chunks.length) chunks[chunks.length - 1].sep = breakAfter;
  }
  if (chunks.length) chunks[chunks.length - 1].sep = '';
  return chunks;
}

const googleChunk = async (text, signal) => {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(text)}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`google ${r.status}`);
  const data = await r.json();
  // Format: [[[translation, original, ...], ...], ...]
  if (!Array.isArray(data?.[0])) throw new Error('google malformed');
  const tr = data[0].map((seg) => seg?.[0] || '').join('').trim();
  if (isProviderError(tr)) throw new Error('google empty');
  return tr;
};

const myMemoryChunk = async (text, signal) => {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|es`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`mymemory ${r.status}`);
  const data = await r.json();
  if (Number(data.responseStatus) !== 200) throw new Error('mymemory bad status');
  const tr = data.responseData?.translatedText?.trim();
  if (isProviderError(tr)) throw new Error('mymemory failure-text');
  return tr;
};

const PROVIDERS = [
  { translate: googleChunk, maxChunk: 1800 },
  // Límite de MyMemory sin cuenta: 500 caracteres por consulta.
  { translate: myMemoryChunk, maxChunk: 450 },
];

// Todo el texto con un mismo proveedor: si falla un trozo, se prueba el
// siguiente proveedor con el texto entero (nunca una sinopsis mitad traducida).
const translateWith = async ({ translate, maxChunk }, text, signal) => {
  const chunks = splitForTranslation(text, maxChunk);
  let out = '';
  for (const { text: chunk, sep } of chunks) {
    out += (await translate(chunk, signal)) + sep;
  }
  return out.trim();
};

export const translateEnToEs = async (text, signal) => {
  if (!text || text.length < 10) return null;
  for (const provider of PROVIDERS) {
    try {
      const tr = await translateWith(provider, text, signal);
      if (!isLikelyFailure(tr)) return tr;
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      // try next provider
    }
  }
  return null;
};
