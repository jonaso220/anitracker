import { useMemo } from 'react';
import { t } from '../i18n';

export default function DiscoveryControls({ items, preferences, setPreferences, ignoredCount = 0, onRestoreIgnored, showGenre = true }) {
  const genres = useMemo(() => [...new Set(items.flatMap((anime) => anime.genres || []))].sort(), [items]);
  const platforms = useMemo(() => [...new Set(items.flatMap((anime) => (anime.streamingLinks || []).map((link) => link.site)))].sort(), [items]);
  const patch = (next) => setPreferences((prev) => ({ ...prev, ...next }));
  return (
    <div className="discovery-controls" aria-label={t('discovery.filtersLabel', 'Filtros de descubrimiento')}>
      <button className={`filter-btn ${preferences.personalized ? 'active' : ''}`} aria-pressed={preferences.personalized} onClick={() => patch({ personalized: !preferences.personalized })}>{t('discovery.forYou', '✨ Para vos')}</button>
      <button className={`filter-btn ${preferences.hideAdded ? 'active' : ''}`} aria-pressed={preferences.hideAdded} onClick={() => patch({ hideAdded: !preferences.hideAdded })}>{t('discovery.hideAdded', 'Ocultar añadidos')}</button>
      {showGenre && <label>{t('directory.genre', 'Género')} <select value={preferences.genre} onChange={(e) => patch({ genre: e.target.value })}><option value="all">{t('directory.allMasc', 'Todos')}</option>{genres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}</select></label>}
      <label>{t('discovery.platform', 'Plataforma')} <select value={preferences.platform} onChange={(e) => patch({ platform: e.target.value })}><option value="all">{t('directory.allFem', 'Todas')}</option>{platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}</select></label>
      {ignoredCount > 0 && <button className="filter-btn muted" onClick={onRestoreIgnored}>{t('discovery.restoreIgnored', 'Restaurar ocultos ({count})', { count: ignoredCount })}</button>}
    </div>
  );
}
