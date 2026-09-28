import React from 'react';
import { t } from '../../i18n';

// Semana vacía: en vez de siete filas "Sin animes este día", los caminos para
// llenarla. Si hay pendientes en Después, ese es el primero.
const WeekOnboarding = ({
  watchLaterCount, onSearch, onSeason, onImport, onWatchLater, onBackup,
  canLogin, loginDisabled, onLogin,
}) => {
  const actions = [
    watchLaterCount > 0 && {
      key: 'watchLater', icon: '🕐', label: t('onboarding.watchLater'), onClick: onWatchLater,
      hint: watchLaterCount === 1 ? 'Tenés 1 anime guardado para ver' : `Tenés ${watchLaterCount} animes guardados para ver`,
    },
    { key: 'search', icon: '🔍', label: t('onboarding.search'), hint: t('onboarding.searchHint'), onClick: onSearch },
    { key: 'season', icon: '📺', label: t('onboarding.season'), hint: t('onboarding.seasonHint'), onClick: onSeason },
    { key: 'import', icon: '📥', label: t('onboarding.import'), hint: t('onboarding.importHint'), onClick: onImport },
  ].filter(Boolean);

  return (
    <section className="week-onboarding fade-in" aria-labelledby="onboarding-title">
      <span className="today-eyebrow">{t('onboarding.eyebrow')}</span>
      <h2 id="onboarding-title">{t('onboarding.title')}</h2>
      <p className="onboarding-intro">{t('onboarding.intro')}</p>
      <div className="onboarding-actions">
        {actions.map((a, i) => (
          <button key={a.key} type="button" className={`onboarding-action ${i === 0 ? 'is-primary' : ''}`} onClick={a.onClick}>
            <span className="onboarding-icon" aria-hidden="true">{a.icon}</span>
            <span className="onboarding-copy">
              <strong>{a.label}</strong>{' '}
              <small>{a.hint}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="onboarding-foot">
        {canLogin && (
          <>
            {t('onboarding.otherDevice')}{' '}
            <button type="button" className="onboarding-link" onClick={onLogin} disabled={loginDisabled}>{t('onboarding.login')}</button>
            <span aria-hidden="true"> · </span>
          </>
        )}
        <button type="button" className="onboarding-link" onClick={onBackup}>{t('onboarding.restore')}</button>
      </p>
    </section>
  );
};

export default React.memo(WeekOnboarding);
