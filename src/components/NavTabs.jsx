import React, { useRef } from 'react';

const TABS = [
  { id: 'schedule',   icon: '📅', labelKey: 'Semana' },
  { id: 'watchLater', icon: '🕐', labelKey: 'Después' },
  { id: 'watched',    icon: '✓',  labelKey: 'Vistas' },
  { id: 'lists',      icon: '📋', labelKey: 'Listas' },
  { id: 'season',     icon: '🌸', labelKey: 'Temporada' },
  { id: 'directory',  icon: '📚', labelKey: 'Directorio' },
  { id: 'stats',      icon: '📊', labelKey: 'Stats' },
];

const NavTabs = ({ activeTab, counts, onChange }) => {
  const refs = useRef([]);
  const onKeyDown = (event, index) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault(); refs.current[next]?.focus(); onChange(TABS[next].id);
  };
  return <nav className="nav-tabs" role="tablist" aria-label="Secciones">
    {TABS.map((t) => {
      const count = counts[t.id];
      const isActive = activeTab === t.id;
      return (
        <button
          key={t.id}
          role="tab"
          aria-selected={isActive}
          tabIndex={isActive ? 0 : -1}
          ref={(node) => { refs.current[TABS.indexOf(t)] = node; }}
          onKeyDown={(event) => onKeyDown(event, TABS.indexOf(t))}
          className={`nav-tab ${isActive ? 'active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <span aria-hidden="true">{t.icon}</span>
          <span className="tab-label"> {t.labelKey}</span>
          {count ? <span className="nav-tab-count" aria-label={`${count} elementos`}>{count}</span> : null}
        </button>
      );
    })}
  </nav>;
};

export default React.memo(NavTabs);
