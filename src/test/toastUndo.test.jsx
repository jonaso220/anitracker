import { it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../hooks/useToast';

it('un deshacer puede mostrar su propio aviso (no se lo come el cierre)', () => {
  const { result } = renderHook(() => useToast({ ttl: 10000 }));
  act(() => {
    result.current.showToast('Datos restaurados', () => result.current.showToast('No se pudo deshacer'));
  });
  act(() => { result.current.undoToast(); });
  expect(result.current.toast?.message).toBe('No se pudo deshacer');
});
