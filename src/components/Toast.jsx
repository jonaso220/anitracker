import React from 'react';

const Toast = ({ toast, onUndo, onAction, onDismiss }) => {
  if (!toast) return null;
  return (
    <div className="toast fade-in" role="status" aria-live="polite">
      <span className="toast-message">{toast.message}</span>
      <div className="toast-actions">
        {toast.action && <button className="toast-undo toast-action" onClick={onAction}>{toast.action.label}</button>}
        {toast.undoFn && <button className="toast-undo" onClick={onUndo}>Deshacer</button>}
        <button className="toast-close" onClick={onDismiss} aria-label="Cerrar notificación">✕</button>
      </div>
    </div>
  );
};

export default React.memo(Toast);
