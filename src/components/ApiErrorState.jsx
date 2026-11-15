import { t } from '../i18n';

export default function ApiErrorState({ error, onRetry }) {
  if (!error) return null;
  const content = error.kind === 'offline'
    ? ['📴', t('apiError.offlineTitle', 'Estás sin conexión'), t('apiError.offlineHint', 'Cuando vuelva internet podés reintentar.')]
    : error.kind === 'rate-limit'
      ? ['⏳', t('apiError.rateLimitTitle', 'AniList está limitando las consultas'), t('apiError.rateLimitHint', 'Esperá un momento y volvé a intentar.')]
      : ['⚠️', t('apiError.genericTitle', 'No pudimos cargar esta sección'), t('apiError.genericHint', 'Parece un fallo temporal del servicio.')];
  return <div className="api-error" role="alert"><span aria-hidden="true">{content[0]}</span><div><strong>{content[1]}</strong><p>{content[2]}</p></div><button onClick={onRetry}>{t('common.retry', 'Reintentar')}</button></div>;
}
