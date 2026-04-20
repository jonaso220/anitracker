import { es } from './es';

/**
 * Minimal i18n helper. For now there's only `es`, but keeping a `t(key)`
 * indirection makes it trivial to add more locales later without touching the
 * call sites.
 */
const dictionary = es;

export function t(key, fallback) {
  return dictionary[key] ?? fallback ?? key;
}

export { es };
