import { useEffect, useState } from 'react';
import { t } from '../i18n';

export default function StorageErrorBanner() {
  const [failure, setFailure] = useState(null);
  useEffect(() => {
    const onError = (event) => setFailure(event.detail || {});
    const onRestored = (event) => setFailure((current) => current?.key === event.detail?.key ? null : current);
    window.addEventListener('anitracker-storage-error', onError);
    window.addEventListener('anitracker-storage-restored', onRestored);
    return () => {
      window.removeEventListener('anitracker-storage-error', onError);
      window.removeEventListener('anitracker-storage-restored', onRestored);
    };
  }, []);
  if (!failure) return null;
  const isQuota = failure.error?.name === 'QuotaExceededError';
  return (
    <div className="storage-error-banner" role="alert" data-dialog-keep="">
      <span aria-hidden="true">⚠️</span>
      <div><strong>{t('storage.title', 'No se pudieron guardar tus últimos cambios')}</strong><small>{isQuota ? t('storage.quota', 'El almacenamiento del navegador está lleno. Exportá una copia y liberá espacio.') : t('storage.blocked', 'El navegador bloqueó el almacenamiento local.')}</small></div>
      {failure.retry && <button onClick={() => failure.retry()}>{t('common.retry', 'Reintentar')}</button>}
      <button className="storage-error-dismiss" onClick={() => setFailure(null)} aria-label={t('storage.dismiss', 'Cerrar aviso')}>×</button>
    </div>
  );
}
