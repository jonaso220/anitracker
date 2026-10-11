import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { DEFAULT_TAB, TAB_IDS, hashForTab, tabFromHash } from '../router';
import { useHashRoute } from '../hooks/useHashRoute';

describe('router (hash ↔ pestaña)', () => {
  it('ida y vuelta para todas las pestañas', () => {
    for (const tab of TAB_IDS) expect(tabFromHash(hashForTab(tab))).toBe(tab);
  });

  it('cada pestaña tiene un hash propio', () => {
    expect(new Set(TAB_IDS.map(hashForTab)).size).toBe(TAB_IDS.length);
  });

  it('acepta variantes del mismo slug (sin barra, mayúsculas, con query)', () => {
    for (const raw of ['#/vistas', '#vistas', '#/VISTAS', '#/vistas/', '#/vistas?x=1', '  #/vistas  ']) {
      expect(tabFromHash(raw)).toBe('watched');
    }
  });

  it('cae en la pestaña por defecto con un hash vacío o desconocido', () => {
    for (const raw of ['', '#', '#/', null, undefined, '#/basura', '#/vistas-inventadas']) {
      expect(tabFromHash(raw)).toBe(DEFAULT_TAB);
    }
  });

  it('una pestaña desconocida se mapea al hash por defecto', () => {
    expect(hashForTab('basura')).toBe(hashForTab(DEFAULT_TAB));
    expect(hashForTab(null)).toBe(hashForTab(DEFAULT_TAB));
  });
});

describe('useHashRoute', () => {
  beforeEach(() => { window.history.replaceState(null, '', '/'); });

  it('arranca en la pestaña que dice el hash (refresco y enlace directo)', () => {
    window.history.replaceState(null, '', '#/vistas');
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toBe('watched');
  });

  it('navigate actualiza la pestaña y el hash', () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current[1]('directory'));
    expect(result.current[0]).toBe('directory');
    expect(window.location.hash).toBe('#/directorio');
  });

  it('el botón atrás (hashchange) cambia la pestaña', () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => {
      window.history.replaceState(null, '', '#/listas');
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(result.current[0]).toBe('lists');
  });

  it('canonicaliza un hash vacío o raro en el primer render', () => {
    window.history.replaceState(null, '', '#basura');
    const { result } = renderHook(() => useHashRoute());
    expect(result.current[0]).toBe(DEFAULT_TAB);
    expect(window.location.hash).toBe(hashForTab(DEFAULT_TAB));
  });
});
