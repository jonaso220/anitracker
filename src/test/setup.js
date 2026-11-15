import '@testing-library/jest-dom';
import { beforeEach } from 'vitest';

// jsdom no expone las streams de compresión que sí tienen los navegadores.
import { CompressionStream as NodeCompressionStream, DecompressionStream as NodeDecompressionStream } from 'node:stream/web';
import { setLocale } from '../i18n';

globalThis.CompressionStream ??= NodeCompressionStream;
globalThis.DecompressionStream ??= NodeDecompressionStream;

// Los tests buscan los textos en español: se fija el idioma para que no
// dependa del idioma de la máquina (jsdom se presenta como en-US, y con eso la
// app arrancaría en inglés). `setLocale` además cancela la detección que el
// módulo de i18n dispara al cargarse. Un test que cambie de idioma vuelve solo
// a español en el siguiente.
setLocale('es');
beforeEach(() => { setLocale('es'); });
