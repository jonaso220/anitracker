// Translation service with fallback providers.
// Order: Google Translate (unofficial endpoint) → MyMemory.
// Returns the translated string, or null if every provider fails.

const isLikelyFailure = (text) => {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 4) return true;
  const upper = t.toUpperCase();
  // MyMemory error responses come in many shapes:
  // "MYMEMORY WARNING: ...", "MYMEMORY: Not found", "PLEASE SELECT TWO DISTINCT LANGUAGES",
  // "YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY", "QUERY LENGTH LIMIT EXCEEDED", etc.
  if (upper.includes('MYMEMORY')) return true;
  if (upper.includes('PLEASE SELECT')) return true;
  if (upper.includes('YOU USED ALL AVAILABLE')) return true;
  if (upper.includes('QUERY LENGTH LIMIT')) return true;
  if (t.length > 50 && t === upper) return true;
  return false;
};

const translateGoogle = async (text, signal) => {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(text.slice(0, 5000))}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`google ${r.status}`);
  const data = await r.json();
  // Format: [[[translation, original, ...], ...], ...]
  if (!Array.isArray(data?.[0])) throw new Error('google malformed');
  const tr = data[0].map((seg) => seg?.[0] || '').join('').trim();
  if (isLikelyFailure(tr)) throw new Error('google empty');
  return tr;
};

const translateMyMemory = async (text, signal) => {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 1500))}&langpair=en|es`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`mymemory ${r.status}`);
  const data = await r.json();
  if (data.responseStatus !== 200) throw new Error('mymemory bad status');
  const tr = data.responseData?.translatedText?.trim();
  if (isLikelyFailure(tr)) throw new Error('mymemory failure-text');
  return tr;
};

export const translateEnToEs = async (text, signal) => {
  if (!text || text.length < 10) return null;
  for (const provider of [translateGoogle, translateMyMemory]) {
    try {
      const tr = await provider(text, signal);
      if (tr) return tr;
    } catch (err) {
      if (err?.name === 'AbortError') return null;
      // try next provider
    }
  }
  return null;
};
