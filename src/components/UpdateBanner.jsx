import React from 'react';

const UpdateBanner = ({ visible, onUpdate }) => {
  if (!visible) return null;
  return (
    <div className="update-banner fade-in" role="status" aria-live="polite">
      <span className="update-banner-icon" aria-hidden="true">✨</span>
      <div className="update-banner-text">
        <strong>Nueva versión disponible</strong>
        <span>Actualizá para ver lo último</span>
      </div>
      <button
        type="button"
        className="update-banner-btn"
        onClick={onUpdate}
        aria-label="Actualizar a la última versión"
      >
        Actualizar
      </button>
    </div>
  );
};

export default React.memo(UpdateBanner);
