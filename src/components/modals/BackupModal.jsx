import { useEffect, useRef, useState } from 'react';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import { parseBackup } from '../../utils';
import { daysOfWeek } from '../../constants';
import { MAX_SNAPSHOTS, listAutoBackups, readAutoBackup } from '../../autoBackup';
import { t } from '../../i18n';

function countSchedule(schedule) {
  return daysOfWeek.reduce((sum, d) => sum + (Array.isArray(schedule?.[d]) ? schedule[d].length : 0), 0);
}

const formatWhen = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function BackupModal({ onClose, onExport, onRestore, synced = false }) {
  const [pending, setPending] = useState(null); // parsed data awaiting confirmation
  const [error, setError] = useState('');
  const [autoBackups, setAutoBackups] = useState([]);
  const fileRef = useRef(null);
  const dialogRef = useAccessibleDialog(onClose);

  useEffect(() => {
    let cancelled = false;
    listAutoBackups().then((list) => { if (!cancelled) setAutoBackups(list); });
    return () => { cancelled = true; };
  }, []);

  const loadAuto = async (id) => {
    setError('');
    const data = await readAutoBackup(id);
    if (data) setPending({ ...data, skipped: 0 });
    else setError('No se pudo leer esa copia.');
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      setPending(parseBackup(text));
    } catch (err) {
      setError(err.message || 'No se pudo leer el archivo.');
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
        <button className="close-btn" onClick={onClose} aria-label="Cerrar">×</button>
        <h2 id="backup-modal-title" className="backup-title">Copia de seguridad</h2>

        {!pending ? (
          <div className="backup-body">
            <section className="backup-section">
              <h3>📤 Exportar</h3>
              <p>Descarga todos tus datos (horario, vistas, ver después y listas) en un archivo <code>.json</code>. Guárdalo como respaldo.</p>
              <button className="backup-btn backup-btn-primary" onClick={onExport}>Descargar copia</button>
            </section>

            <section className="backup-section">
              <h3>📥 Restaurar</h3>
              <p>Carga un archivo de copia para recuperar tus datos. <strong>Reemplazará</strong> tu biblioteca actual{synced ? ' en todos tus dispositivos sincronizados' : ''}.</p>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="backup-file-input"
                id="backup-file"
                onChange={handleFile}
              />
              <label htmlFor="backup-file" className="backup-btn backup-btn-secondary">Elegir archivo…</label>
              {error && <p className="backup-error" role="alert">⚠ {error}</p>}
            </section>

            {autoBackups.length > 0 && (
              <section className="backup-section">
                <h3>🕒 Copias automáticas</h3>
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
                      <button type="button" className="backup-inline-link" onClick={() => loadAuto(backup.id)}>Restaurar</button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <div className="backup-confirm">
            <p className="backup-confirm-title">¿Restaurar esta copia?</p>
            <ul className="backup-summary">
              <li><strong>{countSchedule(pending.schedule)}</strong> en el horario</li>
              <li><strong>{pending.watchedList.length}</strong> vistas</li>
              <li><strong>{pending.watchLater.length}</strong> en ver después</li>
              <li><strong>{pending.customLists.length}</strong> listas personalizadas</li>
            </ul>
            {pending.skipped > 0 && (
              <p className="backup-note">{t('backup.skippedFile', undefined, { count: pending.skipped })}</p>
            )}
            <p className="backup-warning">
              ⚠ Esto reemplazará tu biblioteca actual{synced ? ' en todos tus dispositivos sincronizados' : ''}.
              Vas a poder deshacerlo durante unos segundos; si querés, antes <button type="button" className="backup-inline-link" onClick={onExport}>descargá una copia de lo actual</button>.
            </p>
            <div className="backup-footer">
              <button className="backup-btn backup-btn-secondary" onClick={() => setPending(null)}>Volver</button>
              <button className="backup-btn backup-btn-primary" onClick={confirmRestore}>Restaurar datos</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
