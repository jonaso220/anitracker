import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isChunkLoadError, reloadForNewDeploy } from '../chunkReload';

describe('chunkReload', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('reconoce los errores de chunks de Chrome, Safari y Firefox', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/Stats-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('recarga una vez y no entra en loop', () => {
    const reload = vi.fn();
    expect(reloadForNewDeploy(reload)).toBe(true);
    expect(reloadForNewDeploy(reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
