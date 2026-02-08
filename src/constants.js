export const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const dayEmojis = ['📅', '🎯', '⚡', '🔥', '🎉', '🌟', '💫'];

export const sanitizeUrl = (url) => {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? url : '';
  } catch { return ''; }
};

const TR_PREFIX = 'anitracker-tr-';
const TR_MAX = 50;

export const pruneTranslationCache = () => {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(TR_PREFIX)) keys.push(k);
    }
    if (keys.length > TR_MAX) {
      // Remove oldest entries (order of localStorage.key is not guaranteed,
      // so we just remove random excess ones - simple and effective)
      const toRemove = keys.slice(0, keys.length - TR_MAX);
      toRemove.forEach(k => localStorage.removeItem(k));
    }
  } catch { /* empty */ }
};
