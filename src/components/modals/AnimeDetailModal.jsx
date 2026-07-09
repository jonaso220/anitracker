import React, { useState, useEffect, useCallback } from 'react';
import StarRating from '../StarRating';
import { sanitizeUrl, pruneTranslationCache } from '../../constants';
import { translateEnToEs } from '../../services/translationService';
import { getPlatformInfo, formatAiringDate, looksSpanish, sortStreamingLinks, pickAutoWatchLink } from '../../utils';
import { fetchTmdbExtras, parseTmdbKey, TMDB_ENABLED, TMDB_REGIONS, getPreferredRegion, setPreferredRegion } from '../../services/tmdbService';
import { fetchAnilistRelations } from '../../services/anilistService';

const ProviderRow = ({ label, items, link }) => (
    <div className="provider-row">
        <span className="provider-row-label">{label}</span>
        <div className="provider-row-items">
            {items.map((p, i) => {
                const chip = <>
                    {p.logo && <img src={p.logo} alt="" loading="lazy" decoding="async" />}
                    <span>{p.name}</span>
                </>;
                return link
                    ? <a key={i} className="provider-chip" href={sanitizeUrl(link)} target="_blank" rel="noopener noreferrer" title={`Ver disponibilidad de ${p.name}`}>{chip}</a>
                    : <span key={i} className="provider-chip">{chip}</span>;
            })}
        </div>
    </div>
);

const AnimeDetailModal = ({ showAnimeDetail, setShowAnimeDetail, airingData, updateEpisode, updateUserRating, updateAnimeLink, mergeAnimeExtras, markAsFinished, dropAnime, deleteAnime, addToWatchLater, markAsWatched, setShowMoveDayPicker, setShowDayPicker, resumeAnime, customLists = [], addToCustomList, removeFromCustomList, libraryIds }) => {
    // Compute initial synopsis synchronously (Spanish detection + cache check)
    const getInitialSynopsis = () => {
        const syn = showAnimeDetail?.synopsis;
        if (!syn || syn.length < 10) return { text: null, needsFetch: false };
        if (looksSpanish(syn)) return { text: syn, needsFetch: false };
        try { const cached = localStorage.getItem(`anitracker-tr-${showAnimeDetail.id}`); if (cached) return { text: cached, needsFetch: false }; } catch { /* empty */ }
        return { text: null, needsFetch: true };
    };
    const initialSynopsis = getInitialSynopsis();

    const [localEp, setLocalEp] = useState(showAnimeDetail?.currentEp || 0);
    const [localRating, setLocalRating] = useState(showAnimeDetail?.userRating || 0);
    const [localLink, setLocalLink] = useState(showAnimeDetail?.watchLink || '');
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [translatedSynopsis, setTranslatedSynopsis] = useState(initialSynopsis.text);
    const [isTranslating, setIsTranslating] = useState(initialSynopsis.needsFetch);
    const [translationFailed, setTranslationFailed] = useState(false);
    const [retryNonce, setRetryNonce] = useState(0);
    const [bingeMode, setBingeMode] = useState(false);
    const [bingeCount, setBingeCount] = useState(0);
    const [bingeStart] = useState(() => Date.now());
    const [bingeMinutes, setBingeMinutes] = useState(0);
    const [showListPicker, setShowListPicker] = useState(false);

    useEffect(() => {
        if (!bingeMode) return undefined;
        const updateElapsed = () => setBingeMinutes(Math.round((Date.now() - bingeStart) / 60000));
        updateElapsed();
        const intervalId = setInterval(updateElapsed, 30000);
        return () => clearInterval(intervalId);
    }, [bingeMode, bingeStart]);

    // Only fetch translation if needed (not already Spanish or cached)
    useEffect(() => {
        if (!initialSynopsis.needsFetch && retryNonce === 0) return;
        const syn = showAnimeDetail?.synopsis;
        if (!syn) return;
        const ctrl = new AbortController();
        const cacheKey = `anitracker-tr-${showAnimeDetail?.id}`;
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

    const retryTranslate = useCallback(() => {
        setIsTranslating(true);
        setTranslationFailed(false);
        setRetryNonce((n) => n + 1);
    }, []);

    // --- TMDB "where to watch" + trailer (lazy, cached in the service) ---
    const isTmdbItem = TMDB_ENABLED && !!parseTmdbKey(showAnimeDetail?.sourceKey);
    const [tmdbExtras, setTmdbExtras] = useState(null);
    const [tmdbLoading, setTmdbLoading] = useState(isTmdbItem);
    const [region, setRegion] = useState(getPreferredRegion);

    // Loading starts true for TMDB items (the modal remounts per anime via
    // key={id}); region changes re-arm it from the change handler below.
    useEffect(() => {
        if (!isTmdbItem) return undefined;
        const ctrl = new AbortController();
        fetchTmdbExtras(showAnimeDetail.sourceKey, { region, signal: ctrl.signal })
            .then((extras) => {
                if (ctrl.signal.aborted || !extras) return;
                setTmdbExtras(extras);
                // Persist the trailer on the saved copy (no-op for discovery items).
                if (extras.trailerUrl && mergeAnimeExtras) {
                    mergeAnimeExtras(showAnimeDetail.id, { trailerUrl: extras.trailerUrl });
                }
            })
            .catch((e) => { if (e?.name !== 'AbortError') console.error('TMDB extras error:', e); })
            .finally(() => { if (!ctrl.signal.aborted) setTmdbLoading(false); });
        return () => ctrl.abort();
    }, [isTmdbItem, showAnimeDetail?.sourceKey, showAnimeDetail?.id, region, mergeAnimeExtras]);

    const changeRegion = (code) => {
        setPreferredRegion(code);
        setTmdbExtras(null);
        setTmdbLoading(true);
        setRegion(code);
    };

    // --- Obras relacionadas: temporadas, películas, OVAs (vía AniList) ---
    const animeId = showAnimeDetail?.id;
    const animeSourceKey = showAnimeDetail?.sourceKey;
    const animeMalId = showAnimeDetail?.malId;
    const [related, setRelated] = useState(null);

    useEffect(() => {
        if (!animeId) return undefined;
        const ctrl = new AbortController();
        fetchAnilistRelations({ id: animeId, sourceKey: animeSourceKey, malId: animeMalId }, { signal: ctrl.signal })
            .then((rels) => { if (!ctrl.signal.aborted) setRelated(rels); })
            .catch((e) => { if (e?.name !== 'AbortError') console.error('AniList relations error:', e); });
        return () => ctrl.abort();
    }, [animeId, animeSourceKey, animeMalId]);

    const openRelated = (rel) => {
        setShowAnimeDetail({ ...rel, _isWatchLater: false, _isWatched: false, _isSeason: false, _isDirectory: true });
    };

    if (!showAnimeDetail) return null;
    const a = showAnimeDetail;
    const isDiscovery = a._isSeason || a._isDirectory;
    const isSchedule = !a._isWatchLater && !a._isWatched && !isDiscovery;
    const closeAndDo = (fn) => { setShowAnimeDetail(null); fn(); };
    const airing = airingData[a.id];

    // Preferred platforms first; dead ones (HIDIVE) last. "Ver ahora" never
    // points to a dead platform even if it's stored as watchLink.
    const streamingLinks = sortStreamingLinks(a.streamingLinks || []);
    const effectiveWatchLink = pickAutoWatchLink(a);
    const trailerUrl = a.trailerUrl || tmdbExtras?.trailerUrl || '';
    const providers = tmdbExtras?.providers;
    const hasProviders = !!providers && (providers.flatrate.length > 0 || providers.rent.length > 0 || providers.buy.length > 0);
    const showWhereToWatch = streamingLinks.length > 0 || isTmdbItem || trailerUrl;

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

                {/* For schedule items this info lives inside "Episodio actual" below. */}
                {airing && !isSchedule && (
                    <div className={`detail-section detail-airing ${airing.hasAired ? 'aired' : airing.isToday ? 'today' : ''}`}>
                        <h4>{airing.hasAired ? '🆕 ¡Episodio disponible!' : airing.isToday ? '🔴 Sale hoy' : airing.isTomorrow ? '📢 Sale mañana' : '📡 Próximamente'}</h4>
                        <div className="detail-airing-info">
                            <span className="detail-airing-ep">Episodio {airing.episode}</span>
                            <span className="detail-airing-date">{formatAiringDate(airing.airingAt)}</span>
                        </div>
                    </div>
                )}

                {showWhereToWatch && (
                    <div className="detail-section">
                        <div className="detail-section-header">
                            <h4>📺 Dónde ver</h4>
                            {isTmdbItem && (
                                <select
                                    className="region-select"
                                    value={region}
                                    onChange={(e) => changeRegion(e.target.value)}
                                    aria-label="País para ver disponibilidad"
                                >
                                    {TMDB_REGIONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                                </select>
                            )}
                        </div>
                        {streamingLinks.length > 0 && (
                            <div className="streaming-links">
                                {streamingLinks.map((l, i) => {
                                    const info = getPlatformInfo(l.url);
                                    return (
                                        <a key={i} href={sanitizeUrl(l.url)} target="_blank" rel="noopener noreferrer"
                                            className="streaming-chip" style={{ '--platform-color': info.color }}>
                                            ▶ {l.site}{l.language ? ` · ${l.language}` : ''}
                                        </a>
                                    );
                                })}
                            </div>
                        )}
                        {isTmdbItem && (
                            tmdbLoading ? <p className="streaming-status">Buscando plataformas…</p>
                            : hasProviders ? <>
                                {providers.flatrate.length > 0 && <ProviderRow label="Streaming" items={providers.flatrate} link={providers.link} />}
                                {providers.rent.length > 0 && <ProviderRow label="Alquiler" items={providers.rent} link={providers.link} />}
                                {providers.buy.length > 0 && <ProviderRow label="Compra" items={providers.buy} link={providers.link} />}
                                <p className="tmdb-attribution">Disponibilidad por JustWatch, vía TMDB</p>
                            </>
                            : tmdbExtras ? <p className="streaming-status">Sin plataformas conocidas en este país.</p>
                            : null
                        )}
                        {trailerUrl && (
                            <a className="platform-btn trailer" href={sanitizeUrl(trailerUrl)} target="_blank" rel="noopener noreferrer">
                                🎬 Ver trailer
                            </a>
                        )}
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
                        {airing && (
                            <p className={`detail-next-ep ${airing.hasAired ? 'aired' : airing.isToday ? 'today' : ''}`}>
                                {airing.hasAired
                                    ? <>🆕 Episodio {airing.episode}: ¡ya disponible!</>
                                    : <>📅 Próximo episodio ({airing.episode}): {formatAiringDate(airing.airingAt)}</>}
                            </p>
                        )}
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
                                        <span className="binge-stat">⏱ {bingeMinutes} min</span>
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
                    {effectiveWatchLink && !showLinkInput ? (
                        <div className="detail-link-row">
                            <a href={sanitizeUrl(effectiveWatchLink)} target="_blank" rel="noopener noreferrer" className="platform-btn watch">▶ Ver ahora</a>
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

                {related?.length > 0 && (
                    <div className="detail-section detail-related">
                        <h4>🎬 Más de este anime</h4>
                        <div className="related-strip">
                            {related.map((rel) => (
                                <button
                                    key={rel.id}
                                    type="button"
                                    className="related-card"
                                    onClick={() => openRelated(rel)}
                                    title={rel.title}
                                >
                                    <div className="related-cover">
                                        {(rel.imageSm || rel.image)
                                            ? <img src={rel.imageSm || rel.image} alt="" loading="lazy" decoding="async" />
                                            : <span className="related-cover-fallback" aria-hidden="true">🎬</span>}
                                        <span className="related-relation">{rel._relation}</span>
                                        {libraryIds?.has(rel.id) && (
                                            <span className="related-owned" title="Ya está en tu biblioteca" aria-label="Ya está en tu biblioteca">✓</span>
                                        )}
                                    </div>
                                    <span className="related-title">{rel.title}</span>
                                    <span className="related-meta">{[rel.type, rel.year].filter(Boolean).join(' · ')}</span>
                                </button>
                            ))}
                        </div>
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
