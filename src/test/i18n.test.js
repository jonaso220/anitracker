import { afterEach, describe, expect, it } from 'vitest';
import { availableLocales, getLocale, registerLocale, setLocale, t } from '../i18n';

describe('i18n', () => {
  afterEach(() => { setLocale('es'); });

  it('devuelve el string del diccionario', () => {
    expect(t('nav.schedule')).toBe('Semana');
  });

  it('cae en el fallback y después en la clave', () => {
    expect(t('no.existe', 'Respaldo')).toBe('Respaldo');
    expect(t('no.existe')).toBe('no.existe');
  });

  it('el diccionario gana sobre el fallback (compatibilidad con t(key, fallback))', () => {
    expect(t('nav.schedule', 'Otro')).toBe('Semana');
  });

  it('interpola parámetros', () => {
    registerLocale('xx', { greet: 'Hola {name}, tenés {count} pendientes' });
    setLocale('xx');
    expect(t('greet', undefined, { name: 'Jona', count: 3 })).toBe('Hola Jona, tenés 3 pendientes');
  });

  it('deja intacto un placeholder sin valor', () => {
    registerLocale('xx', { partial: 'Hola {name}' });
    setLocale('xx');
    expect(t('partial')).toBe('Hola {name}');
    expect(t('partial', undefined, { other: 'x' })).toBe('Hola {name}');
  });

  it('resuelve plurales por count', () => {
    expect(t('backup.animeCount', undefined, { count: 1 })).toBe('1 anime');
    expect(t('backup.animeCount', undefined, { count: 5 })).toBe('5 animes');
    expect(t('backup.skippedFile', undefined, { count: 1 })).toBe('Se omitirá 1 entrada inválida del archivo.');
    expect(t('backup.skippedFile', undefined, { count: 2 })).toBe('Se omitirán 2 entradas inválidas del archivo.');
  });

  it('sin count usa el plural', () => {
    expect(t('backup.animeCount')).toBe('{count} animes');
  });

  it('registra locales y permite cambiar entre ellos', () => {
    registerLocale('xx', { 'nav.schedule': 'Week' });
    expect(availableLocales()).toContain('xx');

    expect(setLocale('xx')).toBe(true);
    expect(getLocale()).toBe('xx');
    expect(t('nav.schedule')).toBe('Week');

    // Un idioma no registrado no cambia nada.
    expect(setLocale('nope')).toBe(false);
    expect(getLocale()).toBe('xx');
  });
});
