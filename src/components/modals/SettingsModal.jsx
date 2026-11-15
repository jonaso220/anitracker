import React, { useState } from 'react';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import { alertsPermission, alertsSupported, requestAlertsPermission } from '../../episodeAlerts';
import { availableLocales, getLocalePreference, localeLabel, setLocalePreference, t } from '../../i18n';

const anilistStatusText = (anilist) => {
  if (anilist.status === 'expired') return t('settings.anilistExpired', 'La conexión venció. Volvé a conectar tu cuenta.');
  if (anilist.status === 'error') return ''; // el detalle va aparte, en `lastError`
  if (anilist.status === 'syncing' || anilist.pendingCount > 0) {
    return t('settings.anilistRemaining', 'Enviando…', { count: anilist.pendingCount || 1 });
  }
  return t('settings.anilistUpToDate', 'AniList está al día.');
};

/**
 * Ajustes de la app: avisos de episodio nuevo, conexión con AniList (si hay
 * `VITE_ANILIST_CLIENT_ID`) e idioma.
 */
const reloadPage = () => window.location.reload();

// AniList deja pasar un pedido cada ~2 s: de ahí sale el tiempo estimado.
const SECONDS_PER_ENTRY = 2.1;
const minutesFor = (count) => Math.max(1, Math.ceil((count * SECONDS_PER_ENTRY) / 60));

const SettingsModal = ({ onClose, alertsEnabled, onSetAlerts, anilist, reload = reloadPage }) => {
  const dialogRef = useAccessibleDialog(onClose);
  const [permission, setPermission] = useState(alertsPermission);
  const [locale, setLocale] = useState(getLocalePreference);
  const [confirmSendAll, setConfirmSendAll] = useState(false);
  const supported = alertsSupported();

  const toggleAlerts = async (event) => {
    const next = event.target.checked;
    if (!next) { onSetAlerts(false); return; }
    const result = await requestAlertsPermission();
    setPermission(result);
    onSetAlerts(result === 'granted');
  };

  const changeLocale = (event) => {
    const next = event.target.value;
    setLocale(next);
    // `t()` no es reactivo y las vistas están memoizadas: se recarga.
    if (setLocalePreference(next)) reload();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={dialogRef} className="backup-modal settings-modal fade-in" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label={t('common.close', 'Cerrar')}>×</button>
        <h2 id="settings-modal-title" className="backup-title">{t('settings.title', 'Ajustes')}</h2>

        <div className="backup-body">
          <section className="backup-section" aria-labelledby="settings-alerts-title">
            <h3 id="settings-alerts-title">{t('settings.alertsTitle', '🔔 Avisos de episodio nuevo')}</h3>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={alertsEnabled && permission === 'granted'}
                onChange={toggleAlerts}
                disabled={!supported || permission === 'denied'}
              />
              <span>{t('settings.alertsToggle', 'Avisarme cuando sale un episodio de mi semana')}</span>
            </label>
            {!supported && <p className="settings-note warn" role="status">{t('settings.alertsUnsupported', 'Este navegador no permite notificaciones. En iPhone, instalá la app en la pantalla de inicio.')}</p>}
            {supported && permission === 'denied' && <p className="settings-note warn" role="status">{t('settings.alertsDenied', 'Bloqueaste las notificaciones de este sitio. Habilitalas en los ajustes del navegador y volvé a intentar.')}</p>}
            {supported && permission !== 'denied' && <p className="settings-note">{t('settings.alertsHint', 'Los avisos llegan con la app abierta o en segundo plano. Con la app instalada en Android también pueden llegar con la app cerrada, con algo de demora.')}</p>}
          </section>

          {anilist?.available && (
            <section className="backup-section" aria-labelledby="settings-anilist-title">
              <h3 id="settings-anilist-title">{t('settings.anilistTitle', '🔄 Progreso en AniList')}</h3>
              {anilist.connected ? (
                <>
                  <p className="settings-note">
                    {anilist.viewerName
                      ? t('settings.anilistConnectedAs', 'Conectado como {name}.', { name: anilist.viewerName })
                      : t('settings.anilistConnected', 'Cuenta conectada.')}
                    {' '}<span role="status">{anilistStatusText(anilist)}</span>
                  </p>
                  {anilist.status === 'error' && anilist.lastError && <p className="settings-note warn" role="alert">{anilist.lastError}</p>}
                  {confirmSendAll ? (
                    // Pisa datos en AniList: se pide confirmación con lo que va a pasar.
                    <div className="settings-confirm" role="group" aria-labelledby="settings-sendall-title">
                      <p id="settings-sendall-title" className="settings-confirm-title">{t('settings.anilistSendAllTitle', '¿Enviar toda tu biblioteca a AniList?')}</p>
                      <p className="settings-note">{t('settings.anilistSendAllHint', undefined, { count: anilist.sendableCount, minutes: minutesFor(anilist.sendableCount) })}</p>
                      <div className="settings-actions">
                        <button className="backup-btn backup-btn-primary" onClick={() => { anilist.sendAll(); setConfirmSendAll(false); }}>{t('settings.anilistSendAllConfirm', 'Sí, enviar todo')}</button>
                        <button className="backup-btn" onClick={() => setConfirmSendAll(false)}>{t('common.cancel', 'Cancelar')}</button>
                      </div>
                    </div>
                  ) : (
                    <div className="settings-actions">
                      {anilist.status === 'expired' && <button className="backup-btn backup-btn-primary" onClick={anilist.connect}>{t('settings.anilistReconnect', 'Volver a conectar')}</button>}
                      <button
                        className="backup-btn"
                        onClick={() => setConfirmSendAll(true)}
                        disabled={anilist.status === 'expired' || anilist.status === 'syncing' || !(anilist.sendableCount > 0)}
                      >
                        {t('settings.anilistSendAll', 'Enviar toda mi biblioteca')}
                      </button>
                      <button className="backup-btn" onClick={anilist.disconnect}>{t('settings.anilistDisconnect', 'Desconectar AniList')}</button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="settings-note">{t('settings.anilistHint', 'Conectá tu cuenta para que los episodios vistos, el estado y tu nota se actualicen en AniList. Solo se envían los cambios que hagas desde ahora, nunca se borra nada allá y lo que viene de TVMaze, TMDB, iTunes o Viki se saltea.')}</p>
                  <button className="backup-btn backup-btn-primary" onClick={anilist.connect}>{t('settings.anilistConnect', 'Conectar con AniList')}</button>
                </>
              )}
            </section>
          )}

          <section className="backup-section" aria-labelledby="settings-language-title">
            <h3 id="settings-language-title">{t('settings.languageTitle', '🌐 Idioma')}</h3>
            <label className="settings-select">
              <span className="sr-only">{t('settings.languageLabel', 'Idioma de la app')}</span>
              <select value={locale} onChange={changeLocale}>
                <option value="auto">{t('settings.languageAuto', 'Automático (idioma del dispositivo)')}</option>
                {availableLocales().map((id) => <option key={id} value={id}>{localeLabel(id)}</option>)}
              </select>
            </label>
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
