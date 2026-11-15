import React from 'react';
import { t } from '../i18n';

const UpdateBanner = ({ visible, onUpdate, onDismiss }) => {
  if (!visible) return null;
  return (
    <div className="update-banner fade-in" role="status" aria-live="polite" data-dialog-keep="">
      <span className="update-banner-icon" aria-hidden="true">✨</span>
      <div className="update-banner-text">
        <strong>{t('update.title', 'Nueva versión disponible')}</strong>
        <span>{t('update.hint', 'Actualizá para ver lo último')}</span>
      </div>
      <button
        type="button"
        className="update-banner-btn"
        onClick={onUpdate}
        aria-label={t('update.actionLabel', 'Actualizar a la última versión')}
      >
        {t('update.action', 'Actualizar')}
      </button>
      {onDismiss && (
        <button type="button" className="update-banner-dismiss" onClick={onDismiss} aria-label={t('update.later', 'Más tarde')}>×</button>
      )}
    </div>
  );
};

export default React.memo(UpdateBanner);
