import { useEffect, useState } from 'react';

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
    <div className="storage-error-banner" role="alert">
      <span aria-hidden="true">⚠️</span>
      <div><strong>No se pudieron guardar tus últimos cambios</strong><small>{isQuota ? 'El almacenamiento del navegador está lleno. Exportá una copia y liberá espacio.' : 'El navegador bloqueó el almacenamiento local.'}</small></div>
      {failure.retry && <button onClick={() => failure.retry()}>Reintentar</button>}
    </div>
  );
}
