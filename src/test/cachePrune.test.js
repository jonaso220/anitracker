import { describe, it, expect, beforeEach } from 'vitest';
import { pruneLocalCache, jsonStamp } from '../services/cachePrune';

describe('pruneLocalCache', () => {
  beforeEach(() => { localStorage.clear(); });

  const put = (key, ts) => localStorage.setItem(key, JSON.stringify({ ts, data: key }));
  const cacheKeys = (prefix) => Object.keys(localStorage).filter((k) => k.startsWith(prefix)).sort();

  it('borra las más viejas por fecha guardada, no por orden de localStorage', () => {
    // Insertadas de la más nueva a la más vieja: el orden de key() no sirve.
    put('c:new', 300);
    put('c:mid', 200);
    put('c:old', 100);
    put('otro', 1);
    expect(pruneLocalCache({ prefix: 'c:', max: 2 })).toBe(1);
    expect(cacheKeys('c:')).toEqual(['c:mid', 'c:new']);
    expect(localStorage.getItem('otro')).not.toBeNull();
  });

  it('nunca borra la que se acaba de escribir, aunque tenga la fecha más vieja', () => {
    put('c:a', 200);
    put('c:b', 300);
    put('c:just', 0);
    pruneLocalCache({ prefix: 'c:', max: 2, keep: 'c:just' });
    expect(cacheKeys('c:')).toEqual(['c:b', 'c:just']);
  });

  it('las entradas sin fecha cuentan como las más viejas', () => {
    put('c:a', 200);
    localStorage.setItem('c:legacy', 'texto plano');
    put('c:b', 300);
    pruneLocalCache({ prefix: 'c:', max: 2 });
    expect(cacheKeys('c:')).toEqual(['c:a', 'c:b']);
  });

  it('con índice (valores de texto plano) recuerda cuándo se escribió cada una', () => {
    const opts = { prefix: 'tr-', max: 2, indexKey: 'tr-index' };
    localStorage.setItem('tr-1', 'uno');
    pruneLocalCache({ ...opts, keep: 'tr-1', now: 100 });
    localStorage.setItem('tr-2', 'dos');
    pruneLocalCache({ ...opts, keep: 'tr-2', now: 200 });
    localStorage.setItem('tr-3', 'tres');
    pruneLocalCache({ ...opts, keep: 'tr-3', now: 300 });
    expect(cacheKeys('tr-').filter((k) => k !== 'tr-index')).toEqual(['tr-2', 'tr-3']);
    expect(JSON.parse(localStorage.getItem('tr-index'))).toEqual({ 'tr-2': 200, 'tr-3': 300 });
  });

  it('jsonStamp lee ts o at y tolera basura', () => {
    expect(jsonStamp('{"ts":5}')).toBe(5);
    expect(jsonStamp('{"at":7}')).toBe(7);
    expect(jsonStamp('no json')).toBeNull();
    expect(jsonStamp(null)).toBeNull();
  });
});
