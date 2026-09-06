import { useState } from 'react';
import { seasonNumber } from '../tracking';

export default function SeasonControls({ anime, onChange }) {
  const [total, setTotal] = useState(anime.episodes ? String(anime.episodes) : '');
  const [error, setError] = useState('');
  const current = seasonNumber(anime);
  const seasons = [...new Set([...Object.keys(anime.seasonProgress || {}).map(Number), current])].sort((a, b) => a - b);
  const next = Math.max(...seasons) + 1;

  if (!anime.currentSeason) return <button className="tracking-text-button" onClick={() => onChange(1)}>Seguir por temporadas</button>;

  const saveTotal = (event) => {
    event.preventDefault();
    const value = total.trim() === '' ? 0 : Number(total);
    if (!Number.isSafeInteger(value) || value < 0 || (value > 0 && value < anime.currentEp)) {
      setError('El total debe ser un número entero y no puede ser menor que los episodios vistos.');
      return;
    }
    setError('');
    onChange(current, value);
  };

  return <div className="season-controls">
    <div className="season-select-row">
      <label>Temporada<select aria-label="Temporada actual" value={current} onChange={(e) => onChange(Number(e.target.value))}>
        {seasons.map((season) => <option key={season} value={season}>Temporada {season}</option>)}
      </select></label>
      <button className="tracking-text-button" disabled={next > 999} onClick={() => onChange(next)}>+ Nueva temporada</button>
    </div>
    <details className="season-total-settings">
      <summary>Episodios de esta temporada{anime.episodes > 0 ? ` · ${anime.episodes}` : ''}</summary>
      <form onSubmit={saveTotal} noValidate>
        <label>Total de episodios<input aria-label="Total de episodios de la temporada" type="number" min="0" step="1" inputMode="numeric" value={total} placeholder="Sin confirmar" onChange={(e) => { setTotal(e.target.value); setError(''); }} /></label>
        <button type="submit" className="tracking-text-button">Guardar total</button>
      </form>
      <p>Dejá el total vacío si todavía no lo conocés. Cada temporada conserva su progreso.</p>
      {error && <p className="tracking-error" role="alert">{error}</p>}
    </details>
  </div>;
}
