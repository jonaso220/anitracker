import { describe, it, expect } from 'vitest';
import { encodeLibrary, decodeLibrary, isCompressedDoc, LibraryTooLargeError, PLAIN_LIMIT_BYTES } from '../cloudCodec';

const fs = {
  deleteField: () => '__delete__',
  Bytes: { fromUint8Array: (bytes) => ({ toUint8Array: () => bytes }) },
};

const libraryJson = (watchedList) => JSON.stringify({ schedule: {}, watchedList, watchLater: [], customLists: [] });

// Biblioteca grande pero comprimible, como una real (claves y textos repetidos).
const bigLibrary = () => libraryJson(Array.from({ length: 700 }, (_, i) => ({
  id: i + 1, title: `Anime ${i + 1}`, synopsis: 'Una sinopsis larga que se repite bastante. '.repeat(30),
})));

describe('cloudCodec', () => {
  it('deja las bibliotecas normales en claro y borra el formato comprimido', async () => {
    const payload = await encodeLibrary(libraryJson([{ id: 1, title: 'A' }]), 'rev', fs);
    expect(payload.watchedList).toEqual([{ id: 1, title: 'A' }]);
    expect(payload.libraryGz).toBe('__delete__');
    expect(payload.libraryGzRev).toBe('__delete__');
  });

  it('comprime por encima del límite y el doc se vuelve a leer igual', async () => {
    const json = bigLibrary();
    expect(json.length).toBeGreaterThan(PLAIN_LIMIT_BYTES);
    const payload = await encodeLibrary(json, '2026-09-28T00:00:00Z', fs);
    expect(payload.watchedList).toBe('__delete__');
    expect(payload.libraryGzRev).toBe('2026-09-28T00:00:00Z');

    const doc = { ...payload, updatedAtIso: '2026-09-28T00:00:00Z' };
    expect(isCompressedDoc(doc)).toBe(true);
    expect(await decodeLibrary(doc)).toEqual(JSON.parse(json));
  });

  it('ignora el comprimido si una versión vieja escribió después en claro', () => {
    expect(isCompressedDoc({ libraryGz: {}, libraryGzRev: 'a', updatedAtIso: 'b' })).toBe(false);
    expect(isCompressedDoc({ watchedList: [] })).toBe(false);
  });

  it('lanza LibraryTooLargeError si ni comprimida entra', async () => {
    const noise = Array.from({ length: 1_300_000 }, () => String.fromCharCode(33 + Math.floor(Math.random() * 90))).join('');
    await expect(encodeLibrary(libraryJson([{ id: 1, title: noise }]), 'rev', fs)).rejects.toBeInstanceOf(LibraryTooLargeError);
  });
});
