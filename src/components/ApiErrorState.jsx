export default function ApiErrorState({ error, onRetry }) {
  if (!error) return null;
  const content = error.kind === 'offline'
    ? ['📴', 'Estás sin conexión', 'Cuando vuelva internet podés reintentar.']
    : error.kind === 'rate-limit'
      ? ['⏳', 'AniList está limitando las consultas', 'Esperá un momento y volvé a intentar.']
      : ['⚠️', 'No pudimos cargar esta sección', 'Parece un fallo temporal del servicio.'];
  return <div className="api-error" role="alert"><span aria-hidden="true">{content[0]}</span><div><strong>{content[1]}</strong><p>{content[2]}</p></div><button onClick={onRetry}>Reintentar</button></div>;
}
