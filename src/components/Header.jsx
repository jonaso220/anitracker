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
            </defs>
            {/* Top-left sparkle */}
            <path d="M11 14 L12.2 17 L15.2 18.2 L12.2 19.4 L11 22.4 L9.8 19.4 L6.8 18.2 L9.8 17 Z" fill="url(#logoBrandGrad)" />
            {/* Main circle */}
            <circle cx="40" cy="46" r="25" fill="none" stroke="url(#logoBrandGrad)" strokeWidth="3.5" />
            {/* Play triangle */}
            <path d="M33 35 L54 46 L33 57 Z" fill="url(#logoBrandGrad)" />
            {/* Bookmark on top of circle, sticking upward */}
            <path d="M48 8 L64 8 L64 30 L56 25 L48 30 Z" fill="url(#logoBrandGrad)" />
            {/* Mid-right sparkle */}
            <path d="M70 40 L70.9 42.2 L73.1 43.1 L70.9 44 L70 46.2 L69.1 44 L66.9 43.1 L69.1 42.2 Z" fill="url(#logoBrandGrad)" />
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
                    <stop offset="0%" stopColor="#a855f7">
                      <animate attributeName="stop-color" values="#a855f7; #4ecdc4; #c084fc; #a855f7" dur="5s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="50%" stopColor="#4ecdc4">
                      <animate attributeName="stop-color" values="#4ecdc4; #c084fc; #a855f7; #4ecdc4" dur="5s" repeatCount="indefinite" />
                    </stop>
                    <stop offset="100%" stopColor="#a855f7">
                      <animate attributeName="stop-color" values="#a855f7; #4ecdc4; #c084fc; #a855f7" dur="5s" repeatCount="indefinite" />
                    </stop>
                  </linearGradient>
                </defs>
                {/* Vertical stem (drawn first so the crossbar paints over its
                    top edge, hiding the join cleanly). currentColor inherits
                    text color so it adapts to dark/light theme. */}
                <rect x="22" y="0" width="16" height="72" rx="1" fill="currentColor" />
                {/* Crossbar (top horizontal stroke) - animated brand gradient */}
                <rect x="0" y="0" width="60" height="14" rx="1.5" fill="url(#logoTGrad)" />
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
