import React from 'react';

const TABS = [
  { id: 'schedule',   icon: '📅', labelKey: 'Semana' },
  { id: 'watchLater', icon: '🕐', labelKey: 'Después' },
  { id: 'watched',    icon: '✓',  labelKey: 'Vistas' },
  { id: 'lists',      icon: '📋', labelKey: 'Listas' },
  { id: 'season',     icon: '🌸', labelKey: 'Temporada' },
  { id: 'top',        icon: '🏆', labelKey: 'Top' },
  { id: 'stats',      icon: '📊', labelKey: 'Stats' },
];

const NavTabs = ({ activeTab, counts, onChange }) => (
  <nav className="nav-tabs" role="tablist" aria-label="Secciones">
    {TABS.map((t) => {
      const count = counts[t.id];
      const isActive = activeTab === t.id;
      return (
        <button
          key={t.id}
          role="tab"
          aria-selected={isActive}
          className={`nav-tab ${isActive ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span aria-hidden="true">{t.icon}</span>
          <span className="tab-label"> {t.labelKey}</span>
          {count ? <span className="nav-tab-count" aria-label={`${count} elementos`}>{count}</span> : null}
        </button>
      );
    })}
  </nav>
);

export default React.memo(NavTabs);
