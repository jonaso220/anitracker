import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_PER_SESSION,
  errorReportingEnabled,
  installGlobalErrorHandlers,
  reportError,
  resetErrorReporter,
} from '../errorReporter';

const ENDPOINT = 'https://ejemplo.test/errors';

function stubSendBeacon(ok = true) {
  const beacon = vi.fn(() => ok);
  vi.stubGlobal('navigator', { sendBeacon: beacon });
  return beacon;
}

describe('errorReporter', () => {
  // jsdom se queja de un 'error' sin listener; dejamos uno inerte para poder
  // despachar eventos sintéticos sin que el test falle.
  const swallow = () => {};

  beforeEach(() => {
    window.addEventListener('error', swallow);
    window.addEventListener('unhandledrejection', swallow);
    resetErrorReporter();
  });

  afterEach(() => {
    window.removeEventListener('error', swallow);
    window.removeEventListener('unhandledrejection', swallow);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('está apagado sin endpoint configurado', () => {
    vi.stubEnv('VITE_ERROR_REPORT_URL', '');
    const beacon = stubSendBeacon();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    expect(errorReportingEnabled()).toBe(false);
    reportError('error', new Error('boom'));
    expect(beacon).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('manda el reporte por sendBeacon', () => {
    vi.stubEnv('VITE_ERROR_REPORT_URL', ENDPOINT);
    const beacon = stubSendBeacon();
    expect(errorReportingEnabled()).toBe(true);

    reportError('boundary', new Error('boom'), { componentStack: 'en <App>' });

    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, body] = beacon.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(JSON.parse(body)).toMatchObject({
      app: 'anitracker', kind: 'boundary', message: 'boom', componentStack: 'en <App>',
    });
    expect(JSON.parse(body).url).toBeTypeOf('string');
  });

  it('cae al fetch con keepalive si sendBeacon no sirve', () => {
    vi.stubEnv('VITE_ERROR_REPORT_URL', ENDPOINT);
    stubSendBeacon(false);
    const fetchSpy = vi.fn(() => Promise.resolve());
    vi.stubGlobal('fetch', fetchSpy);

    reportError('error', new Error('sin beacon'));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: 'POST', keepalive: true });
  });

  it('deduplica el mismo error', () => {
    vi.stubEnv('VITE_ERROR_REPORT_URL', ENDPOINT);
    const beacon = stubSendBeacon();
    const error = new Error('repetido');

    reportError('error', error);
    reportError('error', error);

    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it(`corta a los ${MAX_PER_SESSION} reportes por sesión`, () => {
    vi.stubEnv('VITE_ERROR_REPORT_URL', ENDPOINT);
    const beacon = stubSendBeacon();

    for (let i = 0; i < MAX_PER_SESSION + 3; i++) reportError('error', new Error(`e${i}`));

    expect(beacon).toHaveBeenCalledTimes(MAX_PER_SESSION);
  });

  it('acepta strings y valores raros sin romper', () => {
    vi.stubEnv('VITE_ERROR_REPORT_URL', ENDPOINT);
    const beacon = stubSendBeacon();

    reportError('error', 'texto plano');
    reportError('unhandledrejection', { code: 42 });
    reportError('error', undefined);

    expect(beacon.mock.calls.map(([, body]) => JSON.parse(body).message))
      .toEqual(['texto plano', '{"code":42}', 'undefined']);
  });

  it('engancha los errores globales y los suelta al limpiar', () => {
    vi.stubEnv('VITE_ERROR_REPORT_URL', ENDPOINT);
    const beacon = stubSendBeacon();
    const cleanup = installGlobalErrorHandlers();

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('global'), message: 'global' }));
    expect(beacon).toHaveBeenCalledTimes(1);

    const rejection = new Event('unhandledrejection');
    rejection.reason = new Error('promesa');
    window.dispatchEvent(rejection);
    expect(beacon).toHaveBeenCalledTimes(2);

    cleanup();
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('después'), message: 'después' }));
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it('no engancha nada si no hay endpoint', () => {
    vi.stubEnv('VITE_ERROR_REPORT_URL', '');
    const addSpy = vi.spyOn(window, 'addEventListener');

    const cleanup = installGlobalErrorHandlers();

    expect(addSpy).not.toHaveBeenCalledWith('error', expect.any(Function));
    expect(typeof cleanup).toBe('function');
  });
});
