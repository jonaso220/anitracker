import React, { useState, useEffect } from 'react';
import StarRating from '../StarRating';
import { sanitizeUrl, pruneTranslationCache } from '../../constants';

const AnimeDetailModal = ({ showAnimeDetail, setShowAnimeDetail, airingData, updateEpisode, updateUserRating, updateAnimeLink, updateAnimeNotes, markAsFinished, dropAnime, deleteAnime, setShowMoveDayPicker, setShowDayPicker, resumeAnime }) => {
    // Compute initial synopsis synchronously (Spanish detection + cache check)
    const getInitialSynopsis = () => {
        const syn = showAnimeDetail?.synopsis;
        if (!syn || syn.length < 10) return { text: null, needsFetch: false };
        const esPattern = /\b(que|los|las|una|del|por|con|para|como|pero|más|también|esta|este|sobre|tiene|hace|puede|entre|desde|hasta|cuando|donde|porque|aunque|mientras|después|antes|durante|hacia|según|mediante|ser|está|son|han|fue|muy|sin|hay|todo|cada|otro|ella|ellos|quien|cual|esto|eso|sus|nos|al|lo)\b/gi;
        const enPattern = /\b(the|and|but|with|for|that|this|from|are|was|were|been|have|has|had|will|would|could|should|their|they|them|which|when|where|who|what|into|about|after|before|between|through|during|being|each|other|than|then|some|only|also|very|just|over|such|more)\b/gi;
        const esMatches = (syn.match(esPattern) || []).length;
        const enMatches = (syn.match(enPattern) || []).length;
        const wordCount = syn.split(/\s+/).length;
        if (esMatches > enMatches && esMatches / wordCount > 0.06) return { text: syn, needsFetch: false };
        try { const cached = localStorage.getItem(`anitracker-tr-${showAnimeDetail.id}`); if (cached) return { text: cached, needsFetch: false }; } catch { /* empty */ }
        return { text: null, needsFetch: true };
    };
    const initialSynopsis = getInitialSynopsis();

    const [localRating, setLocalRating] = useState(showAnimeDetail?.userRating || 0);
    const [localLink, setLocalLink] = useState(showAnimeDetail?.watchLink || '');
    const [localNotes, setLocalNotes] = useState(showAnimeDetail?.notes || '');
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [translatedSynopsis, setTranslatedSynopsis] = useState(initialSynopsis.text);
    const [isTranslating, setIsTranslating] = useState(initialSynopsis.needsFetch);

    // Only fetch translation if needed (not already Spanish or cached)
    useEffect(() => {
        if (!initialSynopsis.needsFetch) return;
        let cancelled = false;
        const syn = showAnimeDetail?.synopsis;
        const cacheKey = `anitracker-tr-${showAnimeDetail?.id}`;
        fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent((syn || '').slice(0, 1500))}&langpair=en|es`)
            .then(r => r.json()).then(data => {
                if (cancelled) return;
                if (data.responseStatus === 200 && data.responseData?.translatedText) {
                    const tr = data.responseData.translatedText;
                    if (tr !== tr.toUpperCase() || tr.length < 50) {
                        setTranslatedSynopsis(tr);
                        try { localStorage.setItem(cacheKey, tr); pruneTranslationCache(); } catch { /* empty */ }
                    } else setTranslatedSynopsis(syn);
                } else setTranslatedSynopsis(syn);
            }).catch(() => { if (!cancelled) setTranslatedSynopsis(syn); })
            .finally(() => { if (!cancelled) setIsTranslating(false); });
        return () => { cancelled = true; };
    }, [showAnimeDetail?.id, showAnimeDetail?.synopsis, initialSynopsis.needsFetch]);

    if (!showAnimeDetail) return null;
    const a = showAnimeDetail;
    const isSchedule = !a._isWatchLater && !a._isWatched && !a._isSeason;
    const closeAndDo = (fn) => { setShowAnimeDetail(null); fn(); };
    const airing = airingData[a.id];

    return (
        <div className="modal-overlay" onClick={() => setShowAnimeDetail(null)}>
            <div className="detail-modal fade-in" onClick={e => e.stopPropagation()}>
                <button className="close-btn" onClick={() => setShowAnimeDetail(null)}>×</button>
                <div className="detail-header">
                    <img src={a.image} alt={a.title} />
                    <div className="detail-info">
                        <h2>{a.title}</h2>
                        {a.titleJp && <p className="title-jp">{a.titleJp}</p>}
                        <div className="detail-meta">
                            {a.type && <span className="meta-tag type">{a.type}</span>}
                            {a.year && <span className="meta-tag year">{a.year}</span>}
                            {a.episodes && <span className="meta-tag eps">{a.episodes} episodios</span>}
                        </div>
                        <div className="detail-genres">{(a.genres || []).map((g, i) => <span key={i} className="genre-tag">{g}</span>)}</div>
                        {a.rating > 0 && <div className="detail-score"><span className="score-label">Valoración:</span><span className="score-value">⭐ {Number(a.rating).toFixed(1)}</span></div>}
                    </div>
                </div>

                <div className="detail-synopsis">
                    <h4>📖 Sinopsis</h4>
                    {isTranslating ? <p className="synopsis-loading">Traduciendo<span className="dot-anim">...</span></p>
                    : <p>{translatedSynopsis || a.synopsis || 'Sin sinopsis.'}</p>}
                </div>

                {airing && (
                    <div className={`detail-section detail-airing ${airing.hasAired ? 'aired' : airing.isToday ? 'today' : ''}`}>
                        <h4>{airing.hasAired ? '🆕 ¡Episodio disponible!' : airing.isToday ? '🔴 Sale hoy' : airing.isTomorrow ? '📢 Sale mañana' : '📡 Próximamente'}</h4>
                        <div className="detail-airing-info">
                            <span className="detail-airing-ep">Episodio {airing.episode}</span>
                            <span className="detail-airing-date">{new Date(airing.airingAt * 1000).toLocaleString()}</span>
                        </div>
                    </div>
                )}

                {isSchedule && (
                    <div className="detail-section">
                        <h4>📺 Episodio actual</h4>
                        <div className="episode-controls">
                            <button className="ep-control-btn" onClick={() => { updateEpisode(a.id, -1); setShowAnimeDetail(p => ({ ...p, currentEp: Math.max(0, (p.currentEp || 0) - 1) })); }}>−</button>
                            <span className="ep-number">{a.currentEp || 0}</span>
                            <button className="ep-control-btn" onClick={() => { updateEpisode(a.id, 1); setShowAnimeDetail(p => ({ ...p, currentEp: (p.currentEp || 0) + 1 })); }}>+</button>
                        </div>
                    </div>
                )}

                <div className="detail-section">
                    <h4>★ Tu valoración</h4>
                    <div className="detail-rating-row">
                        <StarRating rating={localRating} size={24} interactive onChange={(r) => { setLocalRating(r); updateUserRating(a.id, r); }} />
                    </div>
                </div>

                <div className="detail-section">
                    <h4>🔗 Link</h4>
                    {a.watchLink && !showLinkInput ? (
                        <div className="detail-link-row">
                            <a href={sanitizeUrl(a.watchLink)} target="_blank" rel="noopener noreferrer" className="platform-btn watch">▶ Ver ahora</a>
                            <button className="detail-action-sm" onClick={() => setShowLinkInput(true)}>✏️ Editar</button>
                        </div>
                    ) : (
                        <div className="detail-link-edit">
                            <input type="url" placeholder="URL..." value={localLink} onChange={e => setLocalLink(e.target.value)} />
                            <button className="save-link-btn" onClick={() => { updateAnimeLink(a.id, localLink); setShowLinkInput(false); }}>Guardar</button>
                        </div>
                    )}
                </div>

                <div className="detail-section">
                    <h4>📝 Notas</h4>
                    <textarea
                        className="notes-input"
                        placeholder="Escribí notas sobre este anime..."
                        value={localNotes}
                        onChange={e => setLocalNotes(e.target.value)}
                        onBlur={() => updateAnimeNotes(a.id, localNotes)}
                        rows={3}
                    />
                </div>

                <div className="detail-actions">
                    {isSchedule && <>
                        <button className="detail-action-btn finish" onClick={() => closeAndDo(() => markAsFinished(a, a._day))}>✓ Finalizar</button>
                        <button className="detail-action-btn drop" onClick={() => closeAndDo(() => dropAnime(a, a._day))}>✗ Dropear</button>
                        <button className="detail-action-btn move" onClick={() => closeAndDo(() => setShowMoveDayPicker({ anime: a, fromDay: a._day }))}>↔ Mover día</button>
                    </>}
                    {(a._isWatchLater || a._isSeason) && <button className="detail-action-btn schedule" onClick={() => closeAndDo(() => setShowDayPicker(a))}>📅 Añadir a semana</button>}
                    {a._isWatched && !a.finished && <button className="detail-action-btn resume" onClick={() => closeAndDo(() => resumeAnime(a))}>▶ Retomar</button>}
                    {(isSchedule || a._isWatchLater || a._isWatched) && (
                        <button className="detail-action-btn delete" onClick={() => closeAndDo(() => deleteAnime(a))}>🗑 Eliminar</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnimeDetailModal;
