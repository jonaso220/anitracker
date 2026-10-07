import { useState } from 'react';
import '../styles/syncStatus.css';

const fieldNames = { currentEp: 'Episodio', userRating: 'Puntuación', season: 'Temporada', title: 'Título', finished: 'Completado', dropped: 'Abandonado', notes: 'Notas' };
function describe(value) {
  if (value === undefined) return 'Eliminado / sin valor';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (value && typeof value === 'object') {
    if ('schedule' in value) return `${Object.values(value.schedule || {}).flat().length} en la semana · ${value.watchedList?.length || 0} vistas · ${value.watchLater?.length || 0} pendientes · ${value.customLists?.length || 0} listas`;
    if (Array.isArray(value.items)) return `${value.name || 'Lista'} · ${value.items.length} elementos: ${value.items.map(a => `${a.title || a.id} (ep. ${a.currentEp ?? '—'})`).join(', ')}`;
    if (value.id != null) return `${value.title || value.name || 'Elemento'} · episodio ${value.currentEp ?? '—'} · puntuación ${value.userRating ?? '—'}`;
    return JSON.stringify(value);
  }
  return String(value);
}

export default function SyncStatus({ status = 'pending', conflict, onResolve, onDownload, onRetry }) {
  const [expanded, setExpanded] = useState(false);
  const labels = { synced: 'Sincronizado', pending: 'Cambios pendientes', offline: 'Sin conexión', conflict: 'Cambios pendientes · revisar diferencias' };
  const wholeLibrary = conflict?.conflicts.some(c => c.key === '*');
  return <div className={`sync-status sync-status-${status}`}>
    <div className="sync-status-line">
      <span role="status" aria-live="polite">{labels[status]}</span>
      {status === 'offline' && <span>Los cambios quedan en este dispositivo.</span>}
      {conflict ? <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>Revisar diferencias</button>
        : status === 'pending' && <button onClick={onRetry}>Reintentar</button>}
    </div>
    {conflict && expanded && <section className="sync-conflicts" aria-label="Resolver diferencias entre dispositivos">
      <p>{wholeLibrary
        ? 'No hay una base de sincronización fiable. Elegí qué biblioteca conservar; agregar todo automáticamente podría restaurar elementos borrados.'
        : 'Estos datos cambiaron en dos dispositivos. Elegí qué versión conservar para las diferencias listadas. Los demás cambios se combinan.'}</p>
      <p>Antes de aplicar tu elección guardaremos ambas versiones para recuperación. Podés descargarlas ahora, incluso sin conexión.</p>
      <ul>
        {conflict.conflicts.map((c, i) => <li key={`${c.key}:${c.field || i}`}>
          <strong>{c.key === '*' ? 'Biblioteca completa' : `${c.label}${c.field ? ` · ${fieldNames[c.field] || c.field}` : ''}`}</strong>
          <dl><dt>Este dispositivo</dt><dd>{describe(c.local)}</dd><dt>Nube</dt><dd>{describe(c.cloud)}</dd></dl>
        </li>)}
      </ul>
      {conflict.storageError && <p role="alert">No hay espacio para guardar la recuperación. Descargá ambas versiones y liberá espacio antes de elegir. La sincronización sigue pausada.</p>}
      <div className="sync-conflict-actions">
        <button onClick={onDownload}>Descargar ambas versiones</button>
        <button onClick={() => onResolve('local')}>{wholeLibrary ? 'Conservar biblioteca de este dispositivo' : 'Usar este dispositivo en las diferencias'}</button>
        <button onClick={() => onResolve('cloud')}>{wholeLibrary ? 'Conservar biblioteca de la nube' : 'Usar nube en las diferencias'}</button>
      </div>
    </section>}
  </div>;
}
