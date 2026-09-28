import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate';

function mockServiceWorker(controller) {
  const sw = new EventTarget();
  sw.controller = controller;
  sw.register = vi.fn(() => new Promise(() => {}));
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return sw;
}

describe('useServiceWorkerUpdate', () => {
  afterEach(() => { cleanup(); delete navigator.serviceWorker; });

  it('primera visita: el SW que toma el control no recarga la página', () => {
    const sw = mockServiceWorker(null);
    const reload = vi.fn();
    renderHook(() => useServiceWorkerUpdate({ reload }));
    act(() => { sw.controller = {}; sw.dispatchEvent(new Event('controllerchange')); });
    expect(reload).not.toHaveBeenCalled();
    // Una actualización posterior sí recarga.
    act(() => { sw.dispatchEvent(new Event('controllerchange')); });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('con un SW ya controlando, el cambio (actualización aplicada) recarga una sola vez', () => {
    const sw = mockServiceWorker({});
    const reload = vi.fn();
    renderHook(() => useServiceWorkerUpdate({ reload }));
    act(() => { sw.dispatchEvent(new Event('controllerchange')); sw.dispatchEvent(new Event('controllerchange')); });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
