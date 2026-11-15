import { useState } from 'react';
import { t } from '../i18n';
import '../styles/syncStatus.css';

const FIELD_FALLBACKS = { currentEp: 'Episodio', userRating: 'Puntuación', season: 'Temporada', title: 'Título', finished: 'Completado', dropped: 'Abandonado', notes: 'Notas' };
const fieldName = (field) => (field in FIELD_FALLBACKS ? t(`sync.field.${field}`, FIELD_FALLBACKS[field]) : field);

const STATUS_LABELS = {
  synced: ['sync.status.synced', 'Sincronizado'],
  pending: ['sync.status.pending', 'Cambios pendientes'],
  offline: ['sync.status.offline', 'Sin conexión'],
  conflict: ['sync.status.conflict', 'Cambios pendientes · revisar diferencias'],
  'update-required': ['sync.status.updateRequired', 'Sincronización pausada'],
};
const statusLabel = (status) => (STATUS_LABELS[status] ? t(...STATUS_LABELS[status]) : undefined);

function describe(value) {
  if (value === undefined) return t('sync.valueRemoved', 'Eliminado / sin valor');
  if (typeof value === 'boolean') return value ? t('common.yes', 'Sí') : t('common.no', 'No');
  if (value && typeof value === 'object') {
    if ('schedule' in value) {
      return t('sync.librarySummary', '{schedule} en la semana · {watched} vistas · {watchLater} pendientes · {lists} listas', {
        schedule: Object.values(value.schedule || {}).flat().length,
        watched: value.watchedList?.length || 0,
        watchLater: value.watchLater?.length || 0,
        lists: value.customLists?.length || 0,
      });
    }
    if (Array.isArray(value.items)) {
      return t('sync.listSummary', '{name} · {count} elementos: {entries}', {
        name: value.name || t('sync.listFallback', 'Lista'),
        count: value.items.length,
        entries: value.items.map(a => t('sync.listEntry', '{title} (ep. {episode})', { title: a.title || a.id, episode: a.currentEp ?? '—' })).join(', '),
      });
    }
    if (value.id != null) {
      return t('sync.itemSummary', '{title} · episodio {episode} · puntuación {rating}', {
        title: value.title || value.name || t('sync.itemFallback', 'Elemento'),
        episode: value.currentEp ?? '—',
        rating: value.userRating ?? '—',
      });
    }
    return JSON.stringify(value);
  }
  return String(value);
}

const conflictTitle = (c) => {
  if (c.key === '*') return t('sync.wholeLibrary', 'Biblioteca completa');
  return c.field ? t('sync.conflictField', '{label} · {field}', { label: c.label, field: fieldName(c.field) }) : c.label;
};

export default function SyncStatus({ status = 'pending', conflict, onResolve, onDownload, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const wholeLibrary = conflict?.conflicts.some(c => c.key === '*');
  return <div className={`sync-status sync-status-${status}`}>
    <div className="sync-status-line">
      <span role="status" aria-live="polite">{statusLabel(status)}</span>
      {status === 'offline' && <span>{t('sync.offlineHint', 'Los cambios quedan en este dispositivo.')}</span>}
      {status === 'update-required' && <span>{t('sync.updateRequiredHint', 'Hay una versión más nueva de AniTracker en otro dispositivo. Actualizá la app para seguir sincronizando. Tus cambios quedan en este dispositivo.')}</span>}
      {conflict ? <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{t('sync.review', 'Revisar diferencias')}</button>
        : status === 'pending' && <button onClick={onRetry}>{t('common.retry', 'Reintentar')}</button>}
    </div>
    {conflict && expanded && <section className="sync-conflicts" aria-label={t('sync.resolveLabel', 'Resolver diferencias entre dispositivos')}>
      <p>{wholeLibrary
        ? t('sync.wholeLibraryHint', 'No hay una base de sincronización fiable. Elegí qué biblioteca conservar; agregar todo automáticamente podría restaurar elementos borrados.')
        : t('sync.fieldsHint', 'Estos datos cambiaron en dos dispositivos. Elegí qué versión conservar para las diferencias listadas. Los demás cambios se combinan.')}</p>
      <p>{t('sync.recoveryHint', 'Antes de aplicar tu elección guardaremos ambas versiones para recuperación. Podés descargarlas ahora, incluso sin conexión.')}</p>
      <ul>
        {conflict.conflicts.map((c, i) => <li key={`${c.key}:${c.field || i}`}>
          <strong>{conflictTitle(c)}</strong>
          <dl><dt>{t('sync.thisDevice', 'Este dispositivo')}</dt><dd>{describe(c.local)}</dd><dt>{t('sync.cloud', 'Nube')}</dt><dd>{describe(c.cloud)}</dd></dl>
        </li>)}
      </ul>
      {conflict.storageError && <p role="alert">{t('sync.storageError', 'No hay espacio para guardar la recuperación. Descargá ambas versiones y liberá espacio antes de elegir. La sincronización sigue pausada.')}</p>}
      <div className="sync-conflict-actions">
        <button onClick={onDownload}>{t('sync.downloadBoth', 'Descargar ambas versiones')}</button>
        <button onClick={() => onResolve('local')}>{wholeLibrary ? t('sync.keepLocalLibrary', 'Conservar biblioteca de este dispositivo') : t('sync.useLocal', 'Usar este dispositivo en las diferencias')}</button>
        <button onClick={() => onResolve('cloud')}>{wholeLibrary ? t('sync.keepCloudLibrary', 'Conservar biblioteca de la nube') : t('sync.useCloud', 'Usar nube en las diferencias')}</button>
      </div>
    </section>}
  </div>;
}
