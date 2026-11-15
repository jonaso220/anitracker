import { useEffect, useRef, useState } from 'react';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import { parseBackup } from '../../utils';
import { daysOfWeek } from '../../constants';
import { MAX_SNAPSHOTS, listAutoBackups, readAutoBackup } from '../../autoBackup';
import { t } from '../../i18n';

function countSchedule(schedule) {
  return daysOfWeek.reduce((sum, d) => sum + (Array.isArray(schedule?.[d]) ? schedule[d].length : 0), 0);
}

// Inserta un elemento (negrita, código, botón) en el lugar de `{slot}` dentro de
// un texto traducido, así el orden de las palabras lo decide el diccionario.
function withSlot(text, slot, node) {
  const [before, ...rest] = text.split(`{${slot}}`);
  if (!rest.length) return text;
  return <>{before}{node}{rest.join(`{${slot}}`)}</>;
}

// Línea del resumen: el número va en negrita y el plural se elige por `count`.
const summaryItem = (key, fallback, count) => withSlot(t(key, fallback, { count }), 'n', <strong>{count}</strong>);

const formatWhen = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// `owner`: uid de la cuenta activa (null = invitado). Solo se listan sus copias
// automáticas: restaurar la biblioteca de otra cuenta acá la subiría a esta.
export default function BackupModal({ onClose, onExport, onRestore, synced = false, owner = null }) {
  const [pending, setPending] = useState(null); // parsed data awaiting confirmation
  const [error, setError] = useState('');
  const [autoBackups, setAutoBackups] = useState([]);
  const fileRef = useRef(null);
  const dialogRef = useAccessibleDialog(onClose);

  useEffect(() => {
    let cancelled = false;
    listAutoBackups(undefined, { owner }).then((list) => { if (!cancelled) setAutoBackups(list); });
    return () => { cancelled = true; };
  }, [owner]);

  const loadAuto = async (id) => {
    setError('');
    const data = await readAutoBackup(id);
    if (data) setPending({ ...data, skipped: 0 });
    else setError(t('backup.readSnapshotError', 'No se pudo leer esa copia.'));
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      setPending(parseBackup(text));
    } catch (err) {
      setError(err.message || t('backup.readFileError', 'No se pudo leer el archivo.'));
      setPending(null);
    } finally {
      // Reset so selecting the same file again still fires onChange.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confirmRestore = () => {
    if (!pending) return;
    onRestore(pending);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={dialogRef} className="backup-modal fade-in" role="dialog" aria-modal="true" aria-labelledby="backup-modal-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label={t('common.close', 'Cerrar')}>×</button>
        <h2 id="backup-modal-title" className="backup-title">{t('header.backup', 'Copia de seguridad')}</h2>

        {!pending ? (
          <div className="backup-body">
            <section className="backup-section">
              <h3>{t('backup.export', '📤 Exportar')}</h3>
              <p>{withSlot(t('backup.exportHint', 'Descargá todos tus datos (horario, vistas, ver después y listas) en un archivo {file}. Guardalo como respaldo.'), 'file', <code>.json</code>)}</p>
              <button className="backup-btn backup-btn-primary" onClick={onExport}>{t('backup.download', 'Descargar copia')}</button>
            </section>

            <section className="backup-section">
              <h3>{t('backup.restore', '📥 Restaurar')}</h3>
              <p>{withSlot(
                synced
                  ? t('backup.restoreHintSynced', 'Cargá un archivo de copia para recuperar tus datos. {replace} tu biblioteca actual en todos tus dispositivos sincronizados.')
                  : t('backup.restoreHint', 'Cargá un archivo de copia para recuperar tus datos. {replace} tu biblioteca actual.'),
                'replace',
                <strong>{t('backup.replaces', 'Reemplazará')}</strong>,
              )}</p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="backup-file-input"
                id="backup-file"
                onChange={handleFile}
              />
              <label htmlFor="backup-file" className="backup-btn backup-btn-secondary">{t('backup.chooseFile', 'Elegir archivo…')}</label>
              {error && <p className="backup-error" role="alert">⚠ {error}</p>}
            </section>

            {autoBackups.length > 0 && (
              <section className="backup-section">
                <h3>{t('backup.autoTitle', '🕒 Copias automáticas')}</h3>
                <p>{t('backup.autoHint', undefined, { max: MAX_SNAPSHOTS })}</p>
                <ul className="backup-auto-list">
                  {autoBackups.map((backup) => (
                    <li key={backup.id}>
                      <span className="backup-auto-when">{formatWhen(backup.at)}</span>
                      <span className="backup-auto-count">
                        {t('backup.animeCount', undefined, {
                          count: backup.counts.schedule + backup.counts.watched + backup.counts.watchLater,
                        })}
                      </span>
                      <button type="button" className="backup-inline-link" onClick={() => loadAuto(backup.id)}>{t('backup.restoreSnapshot', 'Restaurar')}</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <div className="backup-confirm">
            <p className="backup-confirm-title">{t('backup.confirmTitle', '¿Restaurar esta copia?')}</p>
            <ul className="backup-summary">
              <li>{summaryItem('backup.summarySchedule', '{n} en el horario', countSchedule(pending.schedule))}</li>
              <li>{summaryItem('backup.summaryWatched', '{n} vistas', pending.watchedList.length)}</li>
              <li>{summaryItem('backup.summaryWatchLater', '{n} en ver después', pending.watchLater.length)}</li>
              <li>{summaryItem('backup.summaryLists', '{n} listas personalizadas', pending.customLists.length)}</li>
            </ul>
            {pending.skipped > 0 && (
              <p className="backup-note">{t('backup.skippedFile', undefined, { count: pending.skipped })}</p>
            )}
            <p className="backup-warning">
              {synced
                ? t('backup.replaceWarningSynced', '⚠ Esto reemplazará tu biblioteca actual en todos tus dispositivos sincronizados.')
                : t('backup.replaceWarning', '⚠ Esto reemplazará tu biblioteca actual.')}
              {' '}
              {withSlot(
                t('backup.undoHint', 'Vas a poder deshacerlo durante unos segundos; si querés, antes {link}.'),
                'link',
                <button type="button" className="backup-inline-link" onClick={onExport}>{t('backup.downloadCurrent', 'descargá una copia de lo actual')}</button>,
              )}
            </p>
            <div className="backup-footer">
              <button className="backup-btn backup-btn-secondary" onClick={() => setPending(null)}>{t('backup.back', 'Volver')}</button>
              <button className="backup-btn backup-btn-primary" onClick={confirmRestore}>{t('backup.confirmRestore', 'Restaurar datos')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
