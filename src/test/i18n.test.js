import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOCALE_KEY,
  autoTranslatesSynopsis,
  availableLocales,
  dayLabel,
  dayLabelInline,
  detectLocale,
  genreLabel,
  getLocale,
  getLocalePreference,
  initLocale,
  linkLanguageLabel,
  localeLabel,
  localeReady,
  localeTag,
  registerLocale,
  relationLabel,
  setLocale,
  setLocalePreference,
  t,
  typeLabel,
} from '../i18n';
import { es } from '../i18n/es';
import { en } from '../i18n/en';
import { NO_SYNOPSIS, daysOfWeek } from '../constants';
import { airingEpisodeLabel, displaySynopsis, formatAiringDate, formatAiringWhen, getPlatformInfo, personalizeDiscovery } from '../utils';

// Idiomas del navegador simulados (jsdom se presenta como en-US).
const browserSpeaks = (...languages) => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '');
};

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  setLocale('es');
});

describe('i18n', () => {
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

  it('una clave que no es propia del diccionario no devuelve basura del prototipo', () => {
    expect(t('toString')).toBe('toString');
    expect(t('constructor', 'Respaldo')).toBe('Respaldo');
  });
});

describe('fallback al español', () => {
  it('una clave que falta en el idioma activo sale en español, antes que el fallback', () => {
    registerLocale('xx', { 'nav.schedule': 'Week' });
    setLocale('xx');
    expect(t('nav.watched')).toBe('Vistas');
    expect(t('nav.watched', 'Fallback inline')).toBe('Vistas');
    expect(t('backup.animeCount', undefined, { count: 2 })).toBe('2 animes');
  });

  it('si tampoco está en español usa el fallback y después la clave', () => {
    registerLocale('xx', {});
    setLocale('xx');
    expect(t('no.existe', 'Respaldo')).toBe('Respaldo');
    expect(t('no.existe')).toBe('no.existe');
  });
});

const placeholders = (text) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
const forms = (value) => (typeof value === 'string' ? { text: value } : value);

describe('diccionario en inglés', () => {
  it('tiene exactamente las mismas claves que el español', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
  });

  it('cada valor tiene la misma forma (texto o plural) y los mismos placeholders', () => {
    const problems = [];
    for (const key of Object.keys(es)) {
      const source = forms(es[key]);
      const target = forms(en[key] ?? '');
      if (Object.keys(source).sort().join() !== Object.keys(target).sort().join()) {
        problems.push(`${key}: forma distinta (${Object.keys(source)} / ${Object.keys(target)})`);
        continue;
      }
      // En un plural, `one` puede escribir "1" en vez de `{count}`: se compara
      // el conjunto de placeholders de todas las formas juntas.
      const wanted = placeholders(Object.values(source).join(' '));
      const got = placeholders(Object.values(target).join(' '));
      if (wanted.join() !== got.join()) problems.push(`${key}: placeholders {${wanted}} / {${got}}`);
      for (const [form, text] of Object.entries(target)) {
        if (!text.trim()) problems.push(`${key}.${form}: vacío`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('no deja textos sin traducir por error', () => {
    // Iguales a propósito: nombres propios, siglas y términos que no cambian.
    const sameOnPurpose = /^(common\.no|nav\.(top|stats|tabWithCount)|detail\.(bingeAdd|bingeMinutes|providerStreaming)|meta\.episodesShort|watched\.sortTitle|sync\.(conflictField|conflictLocation|listEntry)|airing\.episode|directory\.opt\.(genre\.(Drama|Ecchi|Mahou Shoujo|Mecha|Romance)|demography\.(Shounen|Shoujo|Seinen|Josei)|format\.(TV|OVA|ONA))|relation\.Spin-off|region\.(AR|CL|CO|UY))$/;
    const untranslated = Object.keys(es).filter((key) => JSON.stringify(es[key]) === JSON.stringify(en[key]) && !sameOnPurpose.test(key));
    expect(untranslated).toEqual([]);
  });

  it('traduce, interpola y pluraliza', async () => {
    expect(await initLocale('en')).toBe('en');
    expect(t('nav.schedule')).toBe('Week');
    expect(t('nav.schedule', 'Semana')).toBe('Week');
    expect(t('detail.watchOn', undefined, { platform: 'Netflix' })).toBe('Watch on Netflix');
    expect(t('card.episodeCount', undefined, { count: 1 })).toBe('1 episode');
    expect(t('card.episodeCount', undefined, { count: 12 })).toBe('12 episodes');
  });
});

describe('detección y preferencia de idioma', () => {
  beforeEach(() => { localStorage.clear(); });

  it('usa el idioma del navegador: en* → en, cualquier otro → es', () => {
    browserSpeaks('en-GB', 'en');
    expect(detectLocale()).toBe('en');
    browserSpeaks('es-AR', 'es');
    expect(detectLocale()).toBe('es');
    browserSpeaks('pt-BR');
    expect(detectLocale()).toBe('es');
    browserSpeaks();
    expect(detectLocale()).toBe('es');
  });

  it('respeta el orden de preferencia del navegador', () => {
    browserSpeaks('fr-FR', 'en-US', 'es');
    expect(detectLocale()).toBe('en');
    browserSpeaks('es-UY', 'en-US');
    expect(detectLocale()).toBe('es');
  });

  it('la preferencia guardada gana sobre el navegador', () => {
    browserSpeaks('en-US');
    expect(setLocalePreference('es')).toBe(true);
    expect(localStorage.getItem(LOCALE_KEY)).toBe('es');
    expect(getLocalePreference()).toBe('es');
    expect(detectLocale()).toBe('es');

    browserSpeaks('es-AR');
    expect(setLocalePreference('en')).toBe(true);
    expect(detectLocale()).toBe('en');
  });

  it("'auto' borra la preferencia y vuelve al navegador", () => {
    browserSpeaks('en-US');
    setLocalePreference('es');
    expect(setLocalePreference('auto')).toBe(true);
    expect(localStorage.getItem(LOCALE_KEY)).toBeNull();
    expect(getLocalePreference()).toBe('auto');
    expect(detectLocale()).toBe('en');
  });

  it('rechaza un idioma que no existe y descarta uno guardado inválido', () => {
    browserSpeaks('es-AR');
    expect(setLocalePreference('klingon')).toBe(false);
    expect(localStorage.getItem(LOCALE_KEY)).toBeNull();

    localStorage.setItem(LOCALE_KEY, 'klingon');
    expect(getLocalePreference()).toBe('auto');
    expect(detectLocale()).toBe('es');
  });

  it('no se rompe si localStorage tira', () => {
    browserSpeaks('en-US');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(detectLocale()).toBe('en');
    expect(getLocalePreference()).toBe('auto');
    expect(setLocalePreference('es')).toBe(false);
  });

  it('guardar la preferencia no cambia el idioma activo (se aplica al recargar)', () => {
    setLocalePreference('en');
    expect(getLocale()).toBe('es');
  });

  it('ofrece los dos idiomas con su nombre', () => {
    expect(availableLocales()).toEqual(expect.arrayContaining(['es', 'en']));
    expect(localeLabel('es')).toBe('Español');
    expect(localeLabel('en')).toBe('English');
    expect(localeLabel('xx')).toBe('xx');
  });
});

describe('initLocale', () => {
  beforeEach(() => { localStorage.clear(); });

  it('activa el idioma detectado y actualiza el lang del documento', async () => {
    browserSpeaks('en-US');
    expect(await initLocale()).toBe('en');
    expect(getLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(t('common.close')).toBe('Close');

    setLocalePreference('es');
    expect(await initLocale()).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(t('common.close')).toBe('Cerrar');
  });

  it('localeReady resuelve con un idioma válido', async () => {
    expect(availableLocales()).toContain(await localeReady);
  });

  it('un cambio de idioma posterior le gana a una carga en vuelo', async () => {
    browserSpeaks('en-US');
    const pending = initLocale();
    setLocale('es');
    await pending;
    expect(getLocale()).toBe('es');
  });

  it('un idioma desconocido cae en el detectado', async () => {
    browserSpeaks('es-AR');
    expect(await initLocale('klingon')).toBe('es');
  });

  it('las fechas usan la etiqueta del idioma activo', async () => {
    expect(localeTag()).toBe('es-ES');
    browserSpeaks('es-AR', 'en-GB');
    await initLocale('en');
    expect(localeTag()).toBe('en-GB');
    browserSpeaks('es-AR');
    expect(localeTag()).toBe('en-US');
  });
});

describe('etiquetas de valores guardados', () => {
  it('en español se muestran tal como están guardados', () => {
    expect(daysOfWeek.map(dayLabel)).toEqual(daysOfWeek);
    expect(dayLabelInline('Sábado')).toBe('sábado');
    expect(typeLabel('Película')).toBe('Película');
    expect(genreLabel('Ciencia ficción')).toBe('Ciencia ficción');
    expect(genreLabel('Action')).toBe('Action');
    expect(relationLabel('Secuela')).toBe('Secuela');
    expect(linkLanguageLabel('subtítulos en español')).toBe('subtítulos en español');
    expect(autoTranslatesSynopsis()).toBe(true);
  });

  it('en inglés se traduce lo que se muestra, no el dato', async () => {
    await initLocale('en');
    expect(daysOfWeek.map(dayLabel)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    expect(dayLabelInline('Sábado')).toBe('Saturday');
    expect(typeLabel('Película')).toBe('Movie');
    expect(typeLabel('Serie')).toBe('Series');
    expect(typeLabel('OVA')).toBe('OVA');
    expect(genreLabel('Ciencia ficción')).toBe('Sci-Fi');
    expect(genreLabel('Slice of Life')).toBe('Slice of Life');
    expect(relationLabel('Secuela')).toBe('Sequel');
    expect(linkLanguageLabel('subtítulos en español')).toBe('Spanish subtitles');
    expect(linkLanguageLabel('Japanese')).toBe('Japanese');
    expect(autoTranslatesSynopsis()).toBe(false);
    // Las claves del horario no cambian con el idioma.
    expect(daysOfWeek[0]).toBe('Lunes');
  });

  it('un valor vacío no muestra nada', () => {
    expect(dayLabel('')).toBe('');
    expect(genreLabel(null)).toBe('');
    expect(typeLabel(undefined)).toBe('');
  });

  it('los helpers de utils siguen el idioma', async () => {
    // Un miércoles 12 de agosto de 2026, 14:30 hora local.
    const airingAt = Math.round(new Date(2026, 7, 12, 14, 30).getTime() / 1000);
    const airing = { episode: 2, season: 3, airingAt, timeUntilAiring: 5 * 86400 };

    expect(airingEpisodeLabel(airing)).toBe('T3 · Ep. 2');
    expect(formatAiringWhen(airing)).toBe('Miércoles');
    expect(formatAiringDate(airingAt)).toMatch(/^Miércoles, 12 de agosto, 14:30$/);
    expect(getPlatformInfo('https://example.com/x')).toMatchObject({ name: 'Ver', generic: true });
    expect(displaySynopsis(NO_SYNOPSIS)).toBe('Sin sinopsis disponible.');

    await initLocale('en');
    expect(airingEpisodeLabel(airing)).toBe('S3 · Ep. 2');
    expect(airingEpisodeLabel({ ...airing, season: null })).toBe('Ep. 2');
    expect(formatAiringWhen(airing)).toBe('Wednesday');
    // \s: según la versión de ICU, antes de PM va un espacio normal o uno angosto.
    expect(formatAiringDate(airingAt)).toMatch(/^Wednesday, August 12, 02:30\sPM$/);
    expect(getPlatformInfo('https://example.com/x')).toMatchObject({ name: 'Watch', generic: true });
    expect(getPlatformInfo('https://www.netflix.com/title/1')).toMatchObject({ name: 'Netflix' });
    expect(displaySynopsis(NO_SYNOPSIS)).toBe('No synopsis available.');
    expect(displaySynopsis('A real synopsis.')).toBe('A real synopsis.');
  });

  it('el motivo de una recomendación se arma en el idioma activo', async () => {
    const library = [{ id: 1, genres: ['Acción', 'Drama'], userRating: 9, finished: true }];
    const items = [{ id: 2, genres: ['Acción', 'Drama'] }, { id: 3, genres: ['Misterio'] }];
    const reasons = () => Object.fromEntries(personalizeDiscovery(items, library).map((a) => [a.id, a._recommendationReason]));

    expect(reasons()).toEqual({ 2: 'Porque te gusta Acción y Drama', 3: 'Popular entre la comunidad' });
    await initLocale('en');
    expect(reasons()).toEqual({ 2: 'Because you like Action and Drama', 3: 'Popular with the community' });
  });
});
