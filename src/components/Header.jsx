import React, { useState, useEffect, useRef } from 'react';
import SyncStatus from './SyncStatus';
import { t } from '../i18n';

/**
 * Estado de la nube en una línea para el menú. `syncStatus` sale de
 * useCloudSync ('synced' | 'pending' | 'offline' | 'conflict'); sin él (tests,
 * Firebase apagado) se cae a `syncing`.
 */
const cloudLine = ({ syncStatus, syncing }) => {
  if (syncStatus === 'offline') return { text: t('header.syncOffline', '📴 Sin conexión · los cambios quedan en este dispositivo'), warn: true };
  if (syncStatus === 'conflict') return { text: t('header.syncConflict', '⚠️ Cambios pendientes · revisá las diferencias'), warn: true };
  if (syncing) return { text: t('header.syncing', '☁️ Sincronizando…'), warn: false };
  if (syncStatus === 'pending') return { text: t('header.syncPending', '☁️ Cambios pendientes'), warn: false };
  return { text: t('header.synced', '☁️ Sincronizado'), warn: false };
};

const Header = ({
  darkMode, setDarkMode,
  user, syncing, syncError, syncTooLarge = false, loginWithGoogle, logout, firebaseEnabled,
  authError, authReady = true, authBusy = false, onRetrySync,
  onOpenSearch, onOpenImport, onOpenBackup,
  syncStatus, syncConflict, onResolveConflict, onDownloadRecovery,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  // Menú tipo "disclosure": un botón que muestra/oculta una lista de botones
  // comunes (Tab los recorre). Escape lo cierra y devuelve el foco al botón,
  // así el teclado no queda perdido en un elemento que desapareció.
  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setMenuOpen(false);
      if (menuRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // ⌘K / Ctrl+K opens the search modal
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenSearch?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenSearch]);

  const line = cloudLine({ syncStatus, syncing });

  return (
    <header className="header" role="banner">
      <div className="header-content">
        <h1 className="logo" aria-label="AniTracker">
          <svg className="logo-mark" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="logoBrandGrad" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#a855f7">
                  <animate attributeName="stop-color" values="#a855f7; #4ecdc4; #c084fc; #a855f7" dur="5s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="#4ecdc4">
                  <animate attributeName="stop-color" values="#4ecdc4; #c084fc; #a855f7; #4ecdc4" dur="5s" repeatCount="indefinite" />
                </stop>
              </linearGradient>
              {/* Recorta el check de la tele: deja ver el fondo, en tema claro u oscuro. */}
              <mask id="logoTvCheck" maskUnits="userSpaceOnUse" x="0" y="0" width="80" height="80">
                <rect width="80" height="80" fill="#fff" />
                <path d="M24.5 51 L33 60 L48.5 42.5" fill="none" stroke="#000" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
              </mask>
            </defs>
            {/* Misma marca que el ícono de la app (public/icon.svg): tele con
                antenas, check de «visto» y destello. */}
            <path d="M36 30 L24 11 M36 30 L48 11" fill="none" stroke="url(#logoBrandGrad)" strokeWidth="6" strokeLinecap="round" />
            <rect x="6" y="28" width="60" height="46" rx="13" fill="url(#logoBrandGrad)" mask="url(#logoTvCheck)" />
            <path className="logo-sparkle" d="M66 5 c0.9 5.8 2.2 7.1 8 8 c-5.8 0.9 -7.1 2.2 -8 8 c-0.9 -5.8 -2.2 -7.1 -8 -8 c5.8 -0.9 7.1 -2.2 8 -8 Z" fill="url(#logoBrandGrad)" />
          </svg>
          <span className="logo-text">
            <span className="logo-text-ani">
              An<span className="logo-text-i">
                <span className="logo-text-i-star" aria-hidden="true" />
                i
              </span>
            </span>
            <span className="logo-text-tracker">
              <svg
                className="logo-text-t"
                viewBox="0 0 60 72"
                preserveAspectRatio="xMidYMid meet"
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <linearGradient id="logoTGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="60" y2="0">
                    {/* Start each cycle 1.2s after the icon's mark gradient
                        (icon ⇒ i-star at +0.6s ⇒ T-cap at +1.2s) so the
                        colors visually flow across the logo. */}
                    <stop offset="0%" stopColor="#a855f7">
                      <animate attributeName="stop-color" values="#a855f7; #4ecdc4; #c084fc; #a855f7" dur="5s" begin="-3.8s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="50%" stopColor="#4ecdc4">
                      <animate attributeName="stop-color" values="#4ecdc4; #c084fc; #a855f7; #4ecdc4" dur="5s" begin="-3.8s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#a855f7">
                      <animate attributeName="stop-color" values="#a855f7; #4ecdc4; #c084fc; #a855f7" dur="5s" begin="-3.8s" repeatCount="indefinite" />
                    </stop>
                  </linearGradient>
                </defs>
                {/* Vertical stem (drawn first so the crossbar paints over its
                    top edge, hiding the join cleanly). currentColor inherits
                    text color so it adapts to dark/light theme. */}
                <rect x="22" y="0" width="16" height="72" rx="1" fill="currentColor" />
                {/* Crossbar (top horizontal stroke) — height 16/72 ≈ 22% to
                    match Saira 800's actual stroke weight. */}
                <rect x="0" y="0" width="60" height="16" rx="1.5" fill="url(#logoTGrad)" />
              </svg>
              racker
            </span>
          </span>
        </h1>
        <div className="header-actions">
          <button
            type="button"
            className="search-input-wrap"
            onClick={onOpenSearch}
            aria-label={t('header.openSearch', 'Abrir buscador de anime')}
          >
            <span className="search-input-icon" aria-hidden="true">🔍</span>
            <span className="search-input-placeholder">{t('header.searchPlaceholder', 'Buscar anime...')}</span>
            <kbd className="search-input-hint" aria-hidden="true">⌘K</kbd>
          </button>
          {firebaseEnabled && !user && (
            <button className="auth-btn google" onClick={loginWithGoogle} disabled={!authReady || authBusy} aria-busy={authBusy} aria-label={t('header.loginGoogle', 'Iniciar sesión con Google')}>
              <span aria-hidden="true">🔑</span><span className="btn-label">{' '}{authBusy ? t('header.connecting', 'Conectando…') : !authReady ? t('header.loading', 'Cargando…') : 'Google'}</span>
            </button>
          )}

          <div className="user-menu" ref={menuRef}>
            <button
              ref={triggerRef}
              type="button"
              className="user-menu-trigger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-controls="user-menu-dropdown"
              aria-label={t('header.userMenu', 'Menú de usuario')}
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" />
              ) : (
                <span className="user-menu-avatar" aria-hidden="true">
                  {user?.displayName?.charAt(0) || '👤'}
                </span>
              )}
              {user && (syncError || line.warn) ? (
                <span className="user-menu-warn" title={syncError ? t('header.syncFailedShort', 'No se pudo sincronizar con la nube') : line.text} aria-hidden="true">⚠️</span>
              ) : (
                syncing && <span className="user-menu-sync" aria-hidden="true">☁️</span>
              )}
            </button>
            {menuOpen && (
              <div className="user-menu-dropdown" id="user-menu-dropdown">
                {user && (
                  <div className="user-menu-header">
                    {user.photoURL && <img src={user.photoURL} alt="" />}
                    <div className="user-menu-name">
                      <strong>{user.displayName || t('header.userFallback', 'Usuario')}</strong>
                      {syncError ? (
                        <span className="user-menu-syncing user-menu-sync-error">
                          {syncTooLarge
                            ? t('header.syncTooLarge', '⚠️ Tu biblioteca superó el límite de la nube (1 MB comprimida). Tus cambios siguen guardados en este dispositivo; exportá una copia de seguridad.')
                            : t('header.syncFailed', '⚠️ No se pudo sincronizar. Tus cambios siguen guardados en este dispositivo.')}
                        </span>
                      ) : (
                        <span className={`user-menu-syncing ${line.warn ? 'user-menu-sync-error' : ''}`}>{line.text}</span>
                      )}
                    </div>
                  </div>
                )}
                {user && syncError && <button type="button" className="user-menu-item" onClick={onRetrySync}>{t('header.retrySync', 'Reintentar sincronización')}</button>}
                {user && onDownloadRecovery && <button type="button" className="user-menu-item" onClick={onDownloadRecovery}>{t('header.downloadRecovery', 'Descargar recuperación de sincronización')}</button>}
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => { setMenuOpen(false); onOpenImport?.(); }}
                >
                  <span aria-hidden="true">📥</span>
                  <span>{t('header.importAniList', 'Importar desde AniList')}</span>
                </button>
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => { setMenuOpen(false); onOpenBackup?.(); }}
                >
                  <span aria-hidden="true">💾</span>
                  <span>{t('header.backup', 'Copia de seguridad')}</span>
                </button>
                <div className="user-menu-divider" aria-hidden="true" />
                <button
                  type="button"
                  className="user-menu-item"
                  onClick={() => { setDarkMode(!darkMode); }}
                >
                  <span aria-hidden="true">{darkMode ? '☀️' : '🌙'}</span>
                  <span>{darkMode ? t('header.themeToLight', 'Tema claro') : t('header.themeToDark', 'Tema oscuro')}</span>
                </button>
                {user && (
                  <>
                    <div className="user-menu-divider" aria-hidden="true" />
                    <button type="button" className="user-menu-item danger" onClick={() => { setMenuOpen(false); logout(); }}>
                      <span aria-hidden="true">🚪</span>
                      <span>{t('header.logoutFull', 'Cerrar sesión')}</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {authError && <div className="auth-error" role="alert">{authError}</div>}
      {user && <SyncStatus status={syncStatus || (syncError || syncing ? 'pending' : 'synced')} conflict={syncConflict} onResolve={onResolveConflict} onDownload={onDownloadRecovery} onRetry={onRetrySync} />}
    </header>
  );
};

export default React.memo(Header);
