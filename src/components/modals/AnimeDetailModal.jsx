import React, { useState, useEffect, useCallback } from 'react';
import StarRating from '../StarRating';
import { sanitizeUrl, pruneTranslationCache } from '../../constants';
import { translateEnToEs } from '../../services/translationService';

const AnimeDetailModal = ({ showAnimeDetail, setShowAnimeDetail, airingData, updateEpisode, updateUserRating, updateAnimeLink, updateAnimeNotes, markAsFinished, dropAnime, deleteAnime, addToWatchLater, markAsWatched, setShowMoveDayPicker, setShowDayPicker, resumeAnime, customLists = [], addToCustomList, removeFromCustomList }) => {
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

    const [localEp, setLocalEp] = useState(showAnimeDetail?.currentEp || 0);
    const [localRating, setLocalRating] = useState(showAnimeDetail?.userRating || 0);
    const [localLink, setLocalLink] = useState(showAnimeDetail?.watchLink || '');
    const [localNotes, setLocalNotes] = useState(showAnimeDetail?.notes || '');
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [translatedSynopsis, setTranslatedSynopsis] = useState(initialSynopsis.text);
    const [isTranslating, setIsTranslating] = useState(initialSynopsis.needsFetch);
    const [translationFailed, setTranslationFailed] = useState(false);
    const [retryNonce, setRetryNonce] = useState(0);
    const [bingeMode, setBingeMode] = useState(false);
    const [bingeCount, setBingeCount] = useState(0);
    const [bingeStart, setBingeStart] = useState(Date.now());
    const [showListPicker, setShowListPicker] = useState(false);

    // Re-sync local state when the user opens a different anime without
    // closing the modal first (otherwise inputs show stale values).
    useEffect(() => {
        if (!showAnimeDetail) return;
        setLocalEp(showAnimeDetail.currentEp || 0);
        setLocalRating(showAnimeDetail.userRating || 0);
        setLocalLink(showAnimeDetail.watchLink || '');
        setLocalNotes(showAnimeDetail.notes || '');
        setShowLinkInput(false);
        setBingeMode(false);
        setBingeCount(0);
        setBingeStart(Date.now());
        setShowListPicker(false);
    }, [showAnimeDetail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Only fetch translation if needed (not already Spanish or cached)
    useEffect(() => {
        if (!initialSynopsis.needsFetch && retryNonce === 0) return;
        const syn = showAnimeDetail?.synopsis;
        if (!syn) return;
        const ctrl = new AbortController();
        const cacheKey = `anitracker-tr-${showAnimeDetail?.id}`;
        setIsTranslating(true);
        setTranslationFailed(false);
        translateEnToEs(syn, ctrl.signal).then((tr) => {
            if (ctrl.signal.aborted) return;
            if (tr) {
                setTranslatedSynopsis(tr);
                try { localStorage.setItem(cacheKey, tr); pruneTranslationCache(); } catch { /* empty */ }
            } else {
                setTranslatedSynopsis(syn);
                setTranslationFailed(true);
            }
        }).finally(() => {
            if (!ctrl.signal.aborted) setIsTranslating(false);
        });
        return () => ctrl.abort();
    }, [showAnimeDetail?.id, showAnimeDetail?.synopsis, initialSynopsis.needsFetch, retryNonce]);

    const retryTranslate = useCallback(() => setRetryNonce((n) => n + 1), []);

    if (!showAnimeDetail) return null;
    const a = showAnimeDetail;
    const isDiscovery = a._isSeason || a._isTop;
    const isSchedule = !a._isWatchLater && !a._isWatched && !isDiscovery;
    const closeAndDo = (fn) => { setShowAnimeDetail(null); fn(); };
    const airing = airingData[a.id];

    return (
        <div
            className="modal-overlay"
            onClick={() => setShowAnimeDetail(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="anime-detail-title"
            onKeyDown={(e) => { if (e.key === 'Escape') setShowAnimeDetail(null); }}
        >
            <div className="detail-modal fade-in" onClick={e => e.stopPropagation()}>
                <div className="bottom-sheet-handle" aria-hidden="true"></div>
                <button className="close-btn" onClick={() => setShowAnimeDetail(null)} aria-label="Cerrar">×</button>
                <div className="detail-header">
                    <img src={a.image} alt={a.title} loading="lazy" decoding="async" />
                    <div className="detail-info">
                        <h2 id="anime-detail-title">{a.title}</h2>
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
                    <div className="detail-synopsis-header">
                        <h4>📖 Sinopsis</h4>
                        {translationFailed && !isTranslating && (
                            <button
                                type="button"
                                className="synopsis-retry"
                                onClick={retryTranslate}
                                title="Reintentar traducción al español"
                                aria-label="Reintentar traducción al español"
                            >
                                <span aria-hidden="true">🔄</span> Traducir
                            </button>
                        )}
                    </div>
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
                        <div className="detail-section-header">
                            <h4>📺 Episodio actual</h4>
                            <button className={`binge-toggle ${bingeMode ? 'active' : ''}`} onClick={() => setBingeMode(!bingeMode)}>
                                {bingeMode ? '🔥 Maratón' : '🔥 Maratón'}
                            </button>
                        </div>
                        <div className="episode-controls">
                            <button className="ep-control-btn" onClick={() => { updateEpisode(a.id, -1); setLocalEp(p => Math.max(0, p - 1)); }}>−</button>
                            <span className="ep-number">{localEp}</span>
                            <button className="ep-control-btn" onClick={() => { updateEpisode(a.id, 1); setLocalEp(p => p + 1); }}>+</button>
                        </div>
                        {bingeMode && (
                            <div className="binge-panel fade-in">
                                <div className="binge-quick-btns">
                                    {[1, 3, 5].map(n => (
                                        <button key={n} className="binge-quick-btn" onClick={() => {
                                            updateEpisode(a.id, n);
                                            setBingeCount(prev => prev + n);
                                            setLocalEp(p => p + n);
                                        }}>+{n} ep{n > 1 ? 's' : ''}</button>
                                    ))}
                                </div>
                                {bingeCount > 0 && (
                                    <div className="binge-stats">
                                        <span className="binge-stat">🔥 {bingeCount} ep{bingeCount > 1 ? 's' : ''} esta sesión</span>
                                        <span className="binge-stat">⏱ {Math.round((Date.now() - bingeStart) / 60000)} min</span>
                                    </div>
                                )}
                            </div>
                        )}
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
                            <input type="url" placeholder="Pegá una URL..." value={localLink} onChange={e => setLocalLink(e.target.value)} />
                            <button className="save-link-btn" onClick={() => {
                                updateAnimeLink(a.id, localLink);
                                setShowAnimeDetail({ ...a, watchLink: localLink });
                                setShowLinkInput(false);
                            }}>Guardar</button>
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

                {customLists.length > 0 && (
                    <div className="detail-section">
                        <div className="detail-section-header">
                            <h4>📋 Listas</h4>
                            <button className="detail-action-sm" onClick={() => setShowListPicker(!showListPicker)}>
                                {showListPicker ? 'Ocultar' : 'Añadir a lista'}
                            </button>
                        </div>
                        {(() => {
                            const inLists = customLists.filter(l => l.items.some(x => x.id === a.id));
                            return inLists.length > 0 && (
                                <div className="detail-list-tags">
                                    {inLists.map(l => (
                                        <span key={l.id} className="detail-list-tag">
                                            {l.emoji} {l.name}
                                            <button className="detail-list-tag-remove" onClick={() => removeFromCustomList(l.id, a.id)}>✕</button>
                                        </span>
                                    ))}
                                </div>
                            );
                        })()}
                        {showListPicker && (
                            <div className="detail-list-picker fade-in">
                                {customLists.map(l => {
                                    const isIn = l.items.some(x => x.id === a.id);
                                    return (
                                        <button key={l.id} className={`detail-list-option ${isIn ? 'in-list' : ''}`}
                                            onClick={() => isIn ? removeFromCustomList(l.id, a.id) : addToCustomList(l.id, a)}>
                                            <span>{l.emoji} {l.name}</span>
                                            <span>{isIn ? '✓' : '+'}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                <div className="detail-actions">
                    {isSchedule && <>
                        <button className="detail-action-btn finish" onClick={() => closeAndDo(() => markAsFinished(a, a._day))}>✓ Finalizar</button>
                        <button className="detail-action-btn drop" onClick={() => closeAndDo(() => dropAnime(a, a._day))}>✗ Dropear</button>
                        <button className="detail-action-btn move" onClick={() => closeAndDo(() => setShowMoveDayPicker({ anime: a, fromDay: a._day }))}>↔ Mover día</button>
                    </>}
                    {(a._isWatchLater || isDiscovery) && <button className="detail-action-btn schedule" onClick={() => closeAndDo(() => setShowDayPicker(a))}>📅 Añadir a semana</button>}
                    {isDiscovery && <button className="detail-action-btn later" onClick={() => closeAndDo(() => addToWatchLater(a))}>🕐 Ver después</button>}
                    {isDiscovery && <button className="detail-action-btn watched" onClick={() => closeAndDo(() => markAsWatched(a))}>✓ Visto</button>}
                    {a._isWatched && !a.finished && <button className="detail-action-btn resume" onClick={() => closeAndDo(() => resumeAnime(a))}>▶ Retomar</button>}
                    {a._isCustomList && (
                        <button className="detail-action-btn delete" onClick={() => closeAndDo(() => removeFromCustomList(a._customListId, a.id))}>✕ Quitar de lista</button>
                    )}
                    {(isSchedule || a._isWatchLater || a._isWatched) && (
                        <button className="detail-action-btn delete" onClick={() => closeAndDo(() => deleteAnime(a))}>🗑 Eliminar</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AnimeDetailModal;
