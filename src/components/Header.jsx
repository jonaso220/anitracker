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
        <h1 className="logo">AniTracker</h1>
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
