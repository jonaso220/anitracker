import React from 'react';

const Header = ({
  darkMode, setDarkMode,
  notifEnabled, notifPermission, toggleNotifications,
  user, syncing, loginWithGoogle, logout, firebaseEnabled,
  onOpenSearch, onOpenImport,
}) => (
  <header className="header" role="banner">
    <div className="header-content">
      <h1 className="logo">AniTracker</h1>
      <div className="header-actions">
        <button className="search-btn" onClick={onOpenSearch} aria-label="Abrir buscador">
          <span aria-hidden="true">🔍</span><span className="btn-label"> Buscar...</span>
        </button>
        <button className="import-btn" onClick={onOpenImport} aria-label="Importar desde AniList">
          <span aria-hidden="true">📥</span><span className="btn-label"> Importar</span>
        </button>
        {notifPermission !== 'unsupported' && (
          <button
            className={`notif-toggle ${notifEnabled ? 'active' : ''}`}
            onClick={toggleNotifications}
            aria-pressed={notifEnabled}
            aria-label={notifEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
            title={notifPermission === 'denied' ? 'Notificaciones bloqueadas en el navegador' : notifEnabled ? 'Desactivar notificaciones' : 'Activar notificaciones'}
          >
            <span aria-hidden="true">{notifEnabled ? '🔔' : '🔕'}{notifPermission === 'denied' && ' ⚠'}</span>
          </button>
        )}
        <button
          className="theme-toggle"
          onClick={() => setDarkMode(!darkMode)}
          aria-pressed={darkMode}
          aria-label={darkMode ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        >
          <span aria-hidden="true">{darkMode ? '☀️' : '🌙'}</span>
          <span className="btn-label">{darkMode ? ' Claro' : ' Oscuro'}</span>
        </button>
        {firebaseEnabled && !user && (
          <button className="auth-btn google" onClick={loginWithGoogle} aria-label="Iniciar sesión con Google">
            <span aria-hidden="true">🔑</span><span className="btn-label"> Google</span>
          </button>
        )}
        {user && (
          <>
            <div className="user-info">
              {user.photoURL && <img src={user.photoURL} alt="" />}
              <span className="btn-label">{user.displayName?.split(' ')[0]}</span>
            </div>
            {syncing && <span className="btn-label" style={{ fontSize: '0.75rem', opacity: 0.5 }} aria-live="polite">☁️ Sincronizando...</span>}
            <button className="auth-btn" onClick={logout} aria-label="Cerrar sesión">Salir</button>
          </>
        )}
      </div>
    </div>
  </header>
);

export default React.memo(Header);
