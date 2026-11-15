import React from 'react';
import { t } from '../i18n';

const Toast = ({ toast, onUndo, onAction, onDismiss }) => {
  if (!toast) return null;
  return (
    <div className="toast fade-in" role="status" aria-live="polite" data-dialog-keep="">
      <span className="toast-message">{toast.message}</span>
      <div className="toast-actions">
        {toast.action && <button className="toast-undo toast-action" onClick={onAction}>{toast.action.label}</button>}
        {toast.undoFn && <button className="toast-undo" onClick={onUndo}>{t('toast.undo')}</button>}
        <button className="toast-close" onClick={onDismiss} aria-label={t('toast.close')}>✕</button>
      </div>
    </div>
  );
};

export default React.memo(Toast);
