// Formato de la biblioteca dentro del documento de Firestore (límite: 1 MiB).
//
// Bibliotecas normales: los cuatro campos en claro, como siempre (compatibles
// con versiones viejas de la app). Si el JSON supera PLAIN_LIMIT_BYTES se guarda
// comprimido con gzip en `libraryGz` y los campos en claro se borran; una app
// vieja ve los campos ausentes y conserva lo suyo en vez de vaciar nada.
// `libraryGzRev` = `updatedAtIso` del guardado comprimido: si no coinciden, una
// versión vieja escribió después en claro y esos campos son los vigentes.
import type { LibraryInput } from './types/anime';

export const PLAIN_LIMIT_BYTES = 900_000;
export const GZ_LIMIT_BYTES = 950_000;

export class LibraryTooLargeError extends Error {
  bytes: number;
  constructor(bytes: number) {
    super(`Library too large for Firestore (${bytes} bytes gzipped)`);
    this.name = 'LibraryTooLargeError';
    this.bytes = bytes;
  }
}

export const byteLength = (str: string): number => new TextEncoder().encode(str).length;

type GzipTransform = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
type PipeInput = string | Uint8Array;

async function pipe(input: PipeInput, transform: GzipTransform): Promise<Uint8Array> {
  // `Uint8Array` es válido en runtime (BufferSource); los genéricos de TypedArray
  // de TS 6 no lo aceptan directo en `BodyInit`.
  const body = new Response(input as BodyInit).body;
  if (!body) throw new Error('Response body is not readable');
  const stream = body.pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const gzipString = (str: string): Promise<Uint8Array> =>
  pipe(str, new CompressionStream('gzip') as unknown as GzipTransform);
export const gunzipToString = async (bytes: Uint8Array): Promise<string> =>
  new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip') as unknown as GzipTransform));

const FIELDS = ['schedule', 'watchedList', 'watchLater', 'customLists'] as const;

/** Lo mínimo que se usa del SDK de Firestore (inyectado para poder testear). */
export interface FirestoreCodecFs {
  Bytes: { fromUint8Array(bytes: Uint8Array): unknown };
  deleteField(): unknown;
}

/**
 * Campos de la biblioteca para `setDoc(..., { merge: true })`. `fs` aporta
 * `Bytes` y `deleteField` del SDK de Firestore (inyectados para poder testear).
 */
export async function encodeLibrary(json: string, updatedAtIso: string, fs: FirestoreCodecFs): Promise<Record<string, unknown>> {
  if (byteLength(json) <= PLAIN_LIMIT_BYTES) {
    const fields = JSON.parse(json) as Record<string, unknown>;
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

/** Campos crudos del documento de Firestore que lee el codec. */
export interface CloudDoc {
  libraryGz?: unknown;
  libraryGzRev?: unknown;
  updatedAtIso?: unknown;
}

/** ¿El doc tiene la biblioteca vigente en formato comprimido? */
export const isCompressedDoc = (data: CloudDoc | null | undefined): boolean =>
  !!data?.libraryGz && data.libraryGzRev === data.updatedAtIso;

/** Datos de Firestore `Bytes` (o bytes crudos en los tests). */
export interface CompressedDoc {
  libraryGz: { toUint8Array?(): Uint8Array } | Uint8Array;
}

/** Devuelve los campos de la biblioteca de un doc comprimido. */
export async function decodeLibrary(data: CompressedDoc): Promise<LibraryInput> {
  const gz = data.libraryGz;
  const bytes = typeof (gz as { toUint8Array?: unknown }).toUint8Array === 'function'
    ? (gz as { toUint8Array(): Uint8Array }).toUint8Array()
    : (gz as Uint8Array);
  return JSON.parse(await gunzipToString(bytes)) as LibraryInput;
}
