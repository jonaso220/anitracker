import { it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { skipToContent } from '../skipLink';

it('"Saltar al contenido" mueve el foco sin cambiar la pestaña del hash', () => {
  window.history.replaceState(null, '', '/#/vistas');
  render(
    <>
      <a href="#main-content" onClick={skipToContent}>Saltar al contenido</a>
      <main id="main-content">Vistas</main>
    </>,
  );
  fireEvent.click(screen.getByText('Saltar al contenido'));
  expect(window.location.hash).toBe('#/vistas');
  expect(document.activeElement).toBe(screen.getByRole('main'));
  window.history.replaceState(null, '', '/');
});
