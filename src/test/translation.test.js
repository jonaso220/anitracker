import { describe, it, expect, vi, afterEach } from 'vitest';
import { splitForTranslation, translateEnToEs } from '../services/translationService';

const rejoin = (chunks) => chunks.map((c) => c.text + c.sep).join('');
const squash = (t) => t.replace(/\s+/g, ' ').trim();

const LONG = [
  'Frieren is an elf mage who was part of the hero party that defeated the Demon King.',
  'Decades later, she sets out on a new journey to understand people... and herself!',
  'Along the way she meets Fern, an apprentice, and Stark, a warrior who fears everything.',
  '"Why do humans live so briefly?" she wonders.',
].join(' ');
const repeat = (text, n) => Array(n).fill(text).join(' ');
const LONG_X3 = repeat(LONG, 3);

describe('splitForTranslation', () => {
  it('no parte textos cortos', () => {
    expect(splitForTranslation('Short text.', 450)).toEqual([{ text: 'Short text.', sep: '' }]);
  });

  it('parte por oraciones sin pasar el máximo y sin perder texto', () => {
    const chunks = splitForTranslation(LONG_X3, 450);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.text.length <= 450)).toBe(true);
    expect(chunks.every((c) => /[.!?"]$/.test(c.text))).toBe(true);
    expect(squash(rejoin(chunks))).toBe(squash(LONG_X3));
  });

  it('respeta los párrafos y no pierde signos al principio', () => {
    const text = 'First paragraph.\n\n...and then the second one! It goes on.';
    const chunks = splitForTranslation(text, 20);
    expect(rejoin(chunks)).toContain('\n\n');
    expect(squash(rejoin(chunks))).toBe(squash(text));
    expect(chunks.find((c) => c.text.startsWith('...'))).toBeTruthy();
  });

  it('una oración sin puntos más larga que el máximo se corta entre palabras', () => {
    const text = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const chunks = splitForTranslation(text, 100);
    expect(chunks.every((c) => c.text.length <= 100 && !c.text.startsWith(' '))).toBe(true);
    expect(squash(rejoin(chunks))).toBe(text);
  });
});

describe('translateEnToEs con textos largos', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  const googleOk = (q) => ({ ok: true, json: async () => [[[`es(${q.length})`, q]]] });
  const myMemoryOk = (q) => ({ ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: `es(${q.length})` } }) });
  const qOf = (url) => decodeURIComponent(new URL(url).searchParams.get('q'));

  it('si Google falla, MyMemory traduce todo en trozos de hasta 450 caracteres', async () => {
    const sent = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.includes('googleapis')) return { ok: false, status: 429 };
      const q = qOf(url);
      sent.push(q);
      if (q.length > 500) return { ok: true, json: async () => ({ responseStatus: '403', responseData: { translatedText: 'QUERY LENGTH LIMIT EXCEEDED' } }) };
      return myMemoryOk(q);
    });
    const tr = await translateEnToEs(LONG_X3);
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.every((q) => q.length <= 450)).toBe(true);
    expect(tr).toBe(sent.map((q) => `es(${q.length})`).join(' '));
  });

  it('Google recibe el texto entero (antes se cortaba en 5000) en trozos de hasta 1800', async () => {
    const huge = repeat(LONG, 24);
    const sent = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => { const q = qOf(url); sent.push(q); return googleOk(q); });
    await translateEnToEs(huge);
    expect(sent.every((q) => q.length <= 1800)).toBe(true);
    expect(squash(sent.join(' '))).toBe(squash(huge));
  });

  it('si un trozo falla en Google, no mezcla: traduce todo con MyMemory', async () => {
    let googleCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const q = qOf(url);
      if (url.includes('googleapis')) { googleCalls += 1; return googleCalls === 2 ? { ok: false, status: 500 } : googleOk(q); }
      return myMemoryOk(q);
    });
    const tr = await translateEnToEs(repeat(LONG, 9));
    expect(googleCalls).toBe(2);
    expect(tr.startsWith('es(')).toBe(true);
    expect(tr.split(' ').every((part) => /^es\(\d+\)$/.test(part))).toBe(true);
    expect(Math.max(...tr.match(/\d+/g).map(Number))).toBeLessThanOrEqual(450);
  });
});
