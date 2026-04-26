import React, { useState, useEffect, useRef } from 'react';

const Header = ({
  darkMode, setDarkMode,
  notifEnabled, notifPermission, toggleNotifications,
  user, syncing, loginWithGoogle, logout, firebaseEnabled,
  onOpenSearch, onOpenImport,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
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

  const notifSupported = notifPermission !== 'unsupported';

  return (
    <header className="header" role="banner">
      <div className="header-content">
        <h1 className="logo" aria-label="AniTracker">
          <svg className="logo-mark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="logoBrandGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#a855f7">
                  <animate attributeName="stop-color" values="#a855f7; #4ecdc4; #ff6b6b; #a855f7" dur="6s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="#4ecdc4">
                  <animate attributeName="stop-color" values="#4ecdc4; #ff6b6b; #a855f7; #4ecdc4" dur="6s" repeatCount="indefinite" />
                </stop>
              </linearGradient>
            </defs>
            {/* Outer ring */}
            <circle cx="32" cy="34" r="22" fill="none" stroke="url(#logoBrandGrad)" strokeWidth="3" />
            {/* Play triangle */}
            <path d="M27 26 L43 34 L27 42 Z" fill="url(#logoBrandGrad)" />
            {/* Bookmark on top */}
            <path d="M40 6 L52 6 L52 22 L46 18 L40 22 Z" fill="url(#logoBrandGrad)" />
            {/* Sparkle stars */}
            <path d="M14 12 L15.2 14.8 L18 16 L15.2 17.2 L14 20 L12.8 17.2 L10 16 L12.8 14.8 Z" fill="url(#logoBrandGrad)" />
            <path d="M50 32 L51 34.4 L53.4 35.4 L51 36.4 L50 38.8 L49 36.4 L46.6 35.4 L49 34.4 Z" fill="url(#logoBrandGrad)" />
          </svg>
          <span className="logo-text">
            <span className="logo-text-ani">Ani</span>
            <span className="logo-text-tracker">
              <span className="logo-text-accent" aria-hidden="true" />
              Tracker
            </span>
          </span>
        </h1>
        <div className="header-actions">
          <button
            type="button"
            className="search-input-wrap"
            onClick={onOpenSearch}
            aria-label="Abrir buscador de anime"
          >
            <span className="search-input-icon" aria-hidden="true">🔍</span>
            <span className="search-input-placeholder">Buscar anime...</span>
            <kbd className="search-input-hint" aria-hidden="true">⌘K</kbd>
          </button>
          <button className="import-btn" onClick={onOpenImport} aria-label="Importar desde AniList">
            <span aria-hidden="true">📥</span><span className="btn-label"> Importar</span>
          </button>

          {firebaseEnabled && !user && (
            <button className="auth-btn google" onClick={loginWithGoogle} aria-label="Iniciar sesión con Google">
              <span aria-hidden="true">🔑</span><span className="btn-label"> Google</span>
            </button>
          )}

          <div className="user-menu" ref={menuRef}>
            <button
              className="user-menu-trigger"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Menú de usuario"
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" />
              ) : (
                <span className="user-menu-avatar" aria-hidden="true">
                  {user?.displayName?.charAt(0) || '👤'}
                </span>
              )}
              {syncing && <span className="user-menu-sync" aria-hidden="true">☁️</span>}
              {notifEnabled && notifPermission === 'denied' && <span className="user-menu-warn" aria-hidden="true">⚠</span>}
            </button>
            {menuOpen && (
              <div className="user-menu-dropdown" role="menu">
                {user && (
                  <div className="user-menu-header">
                    {user.photoURL && <img src={user.photoURL} alt="" />}
                    <div className="user-menu-name">
                      <strong>{user.displayName || 'Usuario'}</strong>
                      {syncing && <span className="user-menu-syncing">☁️ Sincronizando...</span>}
                    </div>
                  </div>
                )}
                <button
                  className="user-menu-item"
                  role="menuitem"
                  onClick={() => { setDarkMode(!darkMode); }}
                >
                  <span aria-hidden="true">{darkMode ? '☀️' : '🌙'}</span>
                  <span>{darkMode ? 'Tema claro' : 'Tema oscuro'}</span>
                </button>
                {notifSupported && (
                  <button
                    className={`user-menu-item ${notifEnabled ? 'active' : ''}`}
                    role="menuitem"
                    onClick={() => { toggleNotifications(); }}
                    title={notifPermission === 'denied' ? 'Notificaciones bloqueadas en el navegador' : ''}
                  >
                    <span aria-hidden="true">{notifEnabled ? '🔔' : '🔕'}</span>
                    <span>
                      {notifEnabled ? 'Notificaciones activas' : 'Activar notificaciones'}
                      {notifPermission === 'denied' && ' ⚠'}
                    </span>
                  </button>
                )}
                {user && (
                  <>
                    <div className="user-menu-divider" />
                    <button className="user-menu-item danger" role="menuitem" onClick={() => { setMenuOpen(false); logout(); }}>
                      <span aria-hidden="true">🚪</span>
                      <span>Cerrar sesión</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default React.memo(Header);
