import '@testing-library/jest-dom';

// jsdom no expone las streams de compresión que sí tienen los navegadores.
import { CompressionStream as NodeCompressionStream, DecompressionStream as NodeDecompressionStream } from 'node:stream/web';
globalThis.CompressionStream ??= NodeCompressionStream;
globalThis.DecompressionStream ??= NodeDecompressionStream;
