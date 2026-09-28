// Formato de la biblioteca dentro del documento de Firestore (límite: 1 MiB).
//
// Bibliotecas normales: los cuatro campos en claro, como siempre (compatibles
// con versiones viejas de la app). Si el JSON supera PLAIN_LIMIT_BYTES se guarda
// comprimido con gzip en `libraryGz` y los campos en claro se borran; una app
// vieja ve los campos ausentes y conserva lo suyo en vez de vaciar nada.
// `libraryGzRev` = `updatedAtIso` del guardado comprimido: si no coinciden, una
// versión vieja escribió después en claro y esos campos son los vigentes.

export const PLAIN_LIMIT_BYTES = 900_000;
export const GZ_LIMIT_BYTES = 950_000;

export class LibraryTooLargeError extends Error {
  constructor(bytes) {
    super(`Library too large for Firestore (${bytes} bytes gzipped)`);
    this.name = 'LibraryTooLargeError';
    this.bytes = bytes;
  }
}

export const byteLength = (str) => new TextEncoder().encode(str).length;

async function pipe(bytesOrString, transform) {
  const stream = new Response(bytesOrString).body.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const gzipString = (str) => pipe(str, new CompressionStream('gzip'));
export const gunzipToString = async (bytes) => new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip')));

const FIELDS = ['schedule', 'watchedList', 'watchLater', 'customLists'];

/**
 * Campos de la biblioteca para `setDoc(..., { merge: true })`. `fs` aporta
 * `Bytes` y `deleteField` del SDK de Firestore (inyectados para poder testear).
 */
export async function encodeLibrary(json, updatedAtIso, fs) {
  if (byteLength(json) <= PLAIN_LIMIT_BYTES) {
    const fields = JSON.parse(json);
    return {
      ...Object.fromEntries(FIELDS.map((k) => [k, fields[k]])),
      libraryGz: fs.deleteField(),
      libraryGzRev: fs.deleteField(),
    };
  }
  // Sin CompressionStream (Safari < 16.4) no hay forma de que entre.
  if (typeof CompressionStream === 'undefined') throw new LibraryTooLargeError(byteLength(json));
  const gz = await gzipString(json);
  if (gz.byteLength > GZ_LIMIT_BYTES) throw new LibraryTooLargeError(gz.byteLength);
  return {
    ...Object.fromEntries(FIELDS.map((k) => [k, fs.deleteField()])),
    libraryGz: fs.Bytes.fromUint8Array(gz),
    libraryGzRev: updatedAtIso,
  };
}

/** ¿El doc tiene la biblioteca vigente en formato comprimido? */
export const isCompressedDoc = (data) => !!data?.libraryGz && data.libraryGzRev === data.updatedAtIso;

/** Devuelve los campos de la biblioteca de un doc comprimido. */
export async function decodeLibrary(data) {
  const bytes = typeof data.libraryGz.toUint8Array === 'function' ? data.libraryGz.toUint8Array() : data.libraryGz;
  return JSON.parse(await gunzipToString(bytes));
}
