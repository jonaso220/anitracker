// Build watch-link suggestions from an anime: official streaming URLs
// (when AniList provides them) + best-guess slug URLs for jkanime/animeflv.
//
// Sites that don't expose a public API can't be verified — the URLs are
// guesses based on the title slug. If the guess is wrong the user can
// edit the link manually.

const SUPPORTED_SITES = ['Crunchyroll', 'Netflix', 'HIDIVE', 'Funimation', 'Hulu'];

const stripDiacritics = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const toAnimeSlug = (title) => {
  if (!title) return '';
  const slug = stripDiacritics(title)
    .toLowerCase()
    .replace(/[\u2019\u2018'`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  // If the title is non-Latin (Japanese, Korean, Chinese, etc.) the slug
  // collapses to the empty string. Rather than producing a broken URL like
  // "jkanime.net//", refuse to suggest the platform.
  return slug.length >= 2 ? slug : '';
};

const ICONS = {
  Crunchyroll: '🟧',
  Netflix: '🔴',
  HIDIVE: '🟦',
  Funimation: '🟪',
  Hulu: '🟩',
  JKAnime: '🇪🇸',
  AnimeFLV: '🎬',
};

/**
 * @param {{ title?: string, titleEn?: string, titleOriginal?: string, streamingLinks?: Array<{site:string,url:string}> }} anime
 * @returns {Array<{ site: string, url: string, icon: string, official: boolean }>}
 */
export function buildStreamingOptions(anime) {
  if (!anime) return [];
  const out = [];
  const seen = new Set();

  // 1) Official streaming links from AniList (Crunchyroll, Netflix, etc.)
  for (const link of anime.streamingLinks || []) {
    if (!link?.url || !link?.site) continue;
    if (!SUPPORTED_SITES.includes(link.site)) continue;
    if (seen.has(link.site)) continue;
    seen.add(link.site);
    out.push({
      site: link.site,
      url: link.url,
      icon: ICONS[link.site] || '▶',
      official: true,
    });
  }

  // 2) Slug-based guesses for Spanish fan-sub sites.
  // The bare domain (no www subdomain) redirects to whichever mirror is live,
  // so it doesn't break when AnimeFLV rotates www4 → www5 etc.
  const slug = toAnimeSlug(anime.titleEn || anime.title || anime.titleOriginal || '');
  if (slug) {
    out.push({
      site: 'JKAnime',
      url: `https://jkanime.net/${slug}/`,
      icon: ICONS.JKAnime,
      official: false,
    });
    out.push({
      site: 'AnimeFLV',
      url: `https://animeflv.net/anime/${slug}`,
      icon: ICONS.AnimeFLV,
      official: false,
    });
  }

  return out;
}
