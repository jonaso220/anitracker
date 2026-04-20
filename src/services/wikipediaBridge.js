/**
 * Wikipedia bridge search — when the primary APIs (MAL/Kitsu/AniList/TVMaze/iTunes)
 * don't return anything close to the user's query (typically because they searched
 * in Spanish for a title that only has an English or Japanese canonical name), we
 * use Wikipedia's interwiki links as a translation layer, then re-query TVMaze/MAL
 * with the translated title.
 */

import { searchJikan } from './jikanService';
import { searchTvmaze } from './tvmazeService';
import { searchItunes } from './itunesService';

async function wikiSearch(lang, terms, { signal } = {}) {
  const results = await Promise.allSettled(
    terms.map((t) =>
      fetch(
        `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(t)}&srlimit=3&format=json&origin=*`,
        { signal }
      ).then((r) => r.json())
    )
  );
  const seen = new Set();
  const out = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value?.query?.search || []) {
      if (!seen.has(item.title)) { seen.add(item.title); out.push(item); }
    }
  }
  return out;
}

async function getLanglinks(lang, title, { signal } = {}) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=langlinks&lllimit=10&lllang=ja|en&format=json&origin=*`;
  const json = await fetch(url, { signal }).then((r) => r.json());
  const pages = json?.query?.pages || {};
  const page = Object.values(pages)[0];
  const links = page?.langlinks || [];
  return {
    en: links.find((l) => l.lang === 'en')?.['*'] || '',
    ja: links.find((l) => l.lang === 'ja')?.['*'] || '',
  };
}

/**
 * Round 2: Use Spanish Wikipedia to find the English/Japanese name, then
 * re-query Jikan and TVMaze.
 */
export async function searchViaSpanishWikipedia(query, { signal } = {}) {
  const wikiResults = await wikiSearch('es', [`${query} serie`, `${query} película`, `${query} anime`], { signal });
  const hits = [];
  for (const result of wikiResults) {
    try {
      const { en, ja } = await getLanglinks('es', result.title, { signal });
      const searchTitle = en || ja || result.title;
      if (!searchTitle || searchTitle.length <= 2) continue;

      const queries = [
        searchJikan(searchTitle, { signal, limit: 3 }).catch(() => []),
        searchTvmaze(searchTitle, { signal, limit: 5 }).catch(() => []),
      ];
      if (result.title !== searchTitle) {
        queries.push(searchTvmaze(result.title, { signal, limit: 5 }).catch(() => []));
      }
      const [jikan, tv, tvAlt] = await Promise.all(queries);
      const bridgeHits = [...jikan, ...tv, ...(tvAlt || [])].map((a) => ({
        ...a,
        altTitles: [...(a.altTitles || []), result.title].filter((t, i, arr) => arr.indexOf(t) === i),
      }));
      if (bridgeHits.length > 0) { hits.push(...bridgeHits); break; }
    } catch { /* continue */ }
  }
  return hits;
}

/**
 * Round 3: Fallback to English Wikipedia and try TVMaze + iTunes.
 */
export async function searchViaEnglishWikipedia(query, { signal } = {}) {
  const wikiResults = await wikiSearch('en', [`${query} TV series`, `${query} film`], { signal });
  const hits = [];
  for (const result of wikiResults) {
    try {
      const [tv, itunes] = await Promise.all([
        searchTvmaze(result.title, { signal, limit: 3 }).catch(() => []),
        searchItunes(result.title, { signal, limit: 3 }).catch(() => []),
      ]);
      const bridgeHits = [...tv, ...itunes].map((a) => ({
        ...a,
        altTitles: [...(a.altTitles || []), query].filter((t, i, arr) => arr.indexOf(t) === i),
      }));
      if (bridgeHits.length > 0) { hits.push(...bridgeHits); break; }
    } catch { /* continue */ }
  }
  return hits;
}
