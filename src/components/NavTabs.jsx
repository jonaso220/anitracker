import React, { useRef } from 'react';
import { t } from '../i18n';

const TABS = [
  { id: 'schedule',   icon: '📅', labelKey: 'nav.schedule', fallback: 'Semana' },
  { id: 'watchLater', icon: '🕐', labelKey: 'nav.watchLater', fallback: 'Después' },
  { id: 'watched',    icon: '✓',  labelKey: 'nav.watched', fallback: 'Vistas' },
  { id: 'lists',      icon: '📋', labelKey: 'nav.lists', fallback: 'Listas' },
  { id: 'season',     icon: '🌸', labelKey: 'nav.season', fallback: 'Temporada' },
  { id: 'directory',  icon: '📚', labelKey: 'nav.directory', fallback: 'Directorio' },
];

const NavTabs = ({ activeTab, counts, onChange }) => {
  const refs = useRef([]);
  const onKeyDown = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault(); refs.current[next]?.focus(); onChange(TABS[next].id);
  };
  return <nav className="nav-tabs" role="tablist" aria-label={t('nav.sections', 'Secciones')}>
    {TABS.map((tab) => {
      const count = counts[tab.id];
      const isActive = activeTab === tab.id;
      const label = t(tab.labelKey, tab.fallback);
      return (
        <button
          key={tab.id}
          role="tab"
          aria-label={count ? t('nav.tabWithCount', '{label} ({count})', { label, count }) : label}
          aria-selected={isActive}
          tabIndex={isActive ? 0 : -1}
          ref={(node) => { refs.current[TABS.indexOf(tab)] = node; }}
          onKeyDown={(event) => onKeyDown(event, TABS.indexOf(tab))}
          className={`nav-tab ${isActive ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <span className="tab-label"> {label}</span>
          {count ? <span className="nav-tab-count" aria-hidden="true">{count}</span> : null}
        </button>
      );
    })}
  </nav>;
};

export default React.memo(NavTabs);
