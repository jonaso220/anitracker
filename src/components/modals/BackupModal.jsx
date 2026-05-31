import { useRef, useState } from 'react';
import { parseBackup } from '../../utils';
import { daysOfWeek } from '../../constants';

function countSchedule(schedule) {
  return daysOfWeek.reduce((sum, d) => sum + (Array.isArray(schedule?.[d]) ? schedule[d].length : 0), 0);
}

export default function BackupModal({ onClose, onExport, onRestore }) {
  const [pending, setPending] = useState(null); // parsed data awaiting confirmation
  const [error, setError] = useState('');
  const fileRef = useRef(null);

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
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="backup-modal-title"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="backup-modal fade-in" onClick={(e) => e.stopPropagation()}>
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
              <p>Carga un archivo de copia para recuperar tus datos. <strong>Reemplazará</strong> los datos actuales de este dispositivo.</p>
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
            <p className="backup-warning">⚠ Esto reemplazará los datos actuales de este dispositivo.</p>
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
