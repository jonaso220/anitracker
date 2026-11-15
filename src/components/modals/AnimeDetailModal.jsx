import React, { useState, useEffect, useCallback } from 'react';
import { autoTranslatesSynopsis, dayLabel, genreLabel, linkLanguageLabel, relationLabel, t, typeLabel } from '../../i18n';
import SeasonControls from '../SeasonControls';
import { seasonPatch, trackingAiring } from '../../tracking';
import StarRating from '../StarRating';
import { changeEpisode } from '../../libraryEdits';
import { sanitizeUrl, pruneTranslationCache } from '../../constants';
import { translateEnToEs } from '../../services/translationService';
import { getPlatformInfo, formatAiringDate, airingEpisodeLabel, displaySynopsis, looksSpanish, getDisplayStreamingLinks, pickAutoWatchLink } from '../../utils';
import { fetchTmdbExtras, parseTmdbKey, TMDB_ENABLED, TMDB_REGIONS, getPreferredRegion, setPreferredRegion } from '../../services/tmdbService';
import { fetchAnilistRelations } from '../../services/anilistService';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';

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
                    ? <a key={i} className="provider-chip" href={sanitizeUrl(link)} target="_blank" rel="noopener noreferrer" title={t('detail.providerAvailability', 'Ver disponibilidad de {name}', { name: p.name })}>{chip}</a>
                    : <span key={i} className="provider-chip">{chip}</span>;
            })}
        </div>
    </div>
);

const AnimeDetailModal = ({ showAnimeDetail, setShowAnimeDetail, airingData, updateEpisode, setEpisodeNumber, setAnimeSeason, setAnimePaused, updateUserRating, updateAnimeLink, mergeAnimeExtras, markAsFinished, dropAnime, deleteAnime, addToWatchLater, markAsWatched, setShowMoveDayPicker, setShowDayPicker, resumeAnime, customLists = [], addToCustomList, removeFromCustomList, libraryIds }) => {
    const closeDetail = useCallback(() => setShowAnimeDetail(null), [setShowAnimeDetail]);
    const dialogRef = useAccessibleDialog(closeDetail);
    // Compute initial synopsis synchronously (Spanish detection + cache check).
    // Only the Spanish UI translates; any other language shows the original.
    const getInitialSynopsis = () => {
        const syn = showAnimeDetail?.synopsis;
        if (!syn || syn.length < 10) return { text: null, needsFetch: false };
        if (!autoTranslatesSynopsis() || looksSpanish(syn)) return { text: syn, needsFetch: false };
        try { const cached = localStorage.getItem(`anitracker-tr-${showAnimeDetail.id}`); if (cached) return { text: cached, needsFetch: false }; } catch { /* empty */ }
        return { text: null, needsFetch: true };
    };
    const initialSynopsis = getInitialSynopsis();

    const [localEp, setLocalEp] = useState(showAnimeDetail?.currentEp || 0);
    const [episodeDraft, setEpisodeDraft] = useState(null);
    const [episodeError, setEpisodeError] = useState('');
    const [localRating, setLocalRating] = useState(showAnimeDetail?.userRating || 0);
    const [localLink, setLocalLink] = useState(showAnimeDetail?.watchLink || '');
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [linkError, setLinkError] = useState('');
    const [translatedSynopsis, setTranslatedSynopsis] = useState(initialSynopsis.text);
    const [isTranslating, setIsTranslating] = useState(initialSynopsis.needsFetch);
    const [translationFailed, setTranslationFailed] = useState(false);
    const [retryNonce, setRetryNonce] = useState(0);
    const [bingeMode, setBingeMode] = useState(false);
    const [bingeCount, setBingeCount] = useState(0);
    const [bingeClock, setBingeClock] = useState({ startedAt: null, elapsedMs: 0 });
    const [bingeMinutes, setBingeMinutes] = useState(0);
    const [showListPicker, setShowListPicker] = useState(false);
    const [synopsisExpanded, setSynopsisExpanded] = useState(false);
    const [titleExpanded, setTitleExpanded] = useState(false);
    const [coverFailed, setCoverFailed] = useState(false);
    const [askRating, setAskRating] = useState(false);

    useEffect(() => {
        if (!bingeMode) return undefined;
        const updateElapsed = () => setBingeMinutes(Math.floor((bingeClock.elapsedMs + Date.now() - bingeClock.startedAt) / 60000));
        updateElapsed();
        const intervalId = setInterval(updateElapsed, 30000);
        return () => clearInterval(intervalId);
    }, [bingeMode, bingeClock]);

    const toggleBinge = () => {
        const now = Date.now();
        setBingeClock((clock) => bingeMode
            ? { startedAt: null, elapsedMs: clock.elapsedMs + now - clock.startedAt }
            : { ...clock, startedAt: now });
        setBingeMode(!bingeMode);
    };

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
    const isSchedule = !!a._day && !a._isCustomList && !a._isWatchLater && !a._isWatched && !isDiscovery;
    const closeAndDo = (fn) => { setShowAnimeDetail(null); fn(); };
    const airing = trackingAiring(a, airingData[a.id]);

    // API links + generated fan-platform links (JKAnime/AnimeFLV), preferred
    // platforms first and dead ones (HIDIVE) last. "Ver ahora" never points to
    // a dead platform even if it's stored as watchLink.
    const effectiveWatchLink = sanitizeUrl(pickAutoWatchLink(a));
    const watchPlatform = getPlatformInfo(effectiveWatchLink);
    // Only collapse exact URL duplicates. Different destinations/languages remain accessible.
    const seenLinks = new Set(effectiveWatchLink ? [effectiveWatchLink] : []);
    const streamingLinks = getDisplayStreamingLinks(a).filter((link) => {
        const url = sanitizeUrl(link.url);
        if (!url || seenLinks.has(url)) return false;
        seenLinks.add(url);
        return true;
    });
    const isWatchAlternative = (link) => !!watchPlatform && !watchPlatform.generic && watchPlatform.name === getPlatformInfo(link.url)?.name;
    const otherPlatforms = streamingLinks.filter((link) => !isWatchAlternative(link));
    const watchAlternatives = streamingLinks.filter(isWatchAlternative);
    const synopsis = displaySynopsis(translatedSynopsis || a.synopsis) || t('detail.noSynopsis');
    const longSynopsis = synopsis.length > 320;
    const synopsisPreview = longSynopsis ? synopsis.slice(0, 320).replace(/\s+\S*$/, '') + '…' : synopsis;
    const trailerUrl = a.trailerUrl || tmdbExtras?.trailerUrl || '';
    const providers = tmdbExtras?.providers;
    const hasProviders = !!providers && (providers.flatrate.length > 0 || providers.rent.length > 0 || providers.buy.length > 0);
    const hasWatchExtras = streamingLinks.length > 0 || isTmdbItem;
    const episodeComplete = a.episodes > 0 && localEp >= a.episodes;
    const progressPercent = a.episodes > 0 ? Math.round((Math.min(localEp, a.episodes) / a.episodes) * 100) : 0;
    const changeLocalEpisode = (delta) => {
        setEpisodeDraft(null);
        setEpisodeError('');
        const next = changeEpisode(localEp, delta, a.episodes);
        updateEpisode(a.id, delta);
        setLocalEp(next);
        if (bingeMode) setBingeCount((count) => Math.max(0, count + next - localEp));
    };
    const commitEpisode = () => {
        if (episodeDraft === null) return;
        const text = episodeDraft.trim();
        const value = Number(text);
        if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 0 || (a.episodes > 0 && value > a.episodes)) {
            setEpisodeError(a.episodes > 0 ? t('detail.episodeRange', 'Elegí un episodio entre 0 y {total}.', { total: a.episodes }) : t('detail.episodeInteger', 'Ingresá un número entero de episodios, desde 0.'));
            return;
        }
        setEpisodeNumber?.(a.id, value);
        setLocalEp(value);
        if (bingeMode) setBingeCount((count) => Math.max(0, count + value - localEp));
        setEpisodeDraft(null);
        setEpisodeError('');
    };
    const changeSeason = (season, total) => {
        setAnimeSeason?.(a.id, season, total);
        setShowAnimeDetail((prev) => ({ ...prev, ...seasonPatch({ ...a, currentEp: localEp }, season, total) }));
    };
    const saveLink = () => {
        const link = localLink.trim();
        if (link && !sanitizeUrl(link)) {
            setLinkError(t('detail.linkInvalid', 'Pegá un enlace válido que empiece con https:// o http://.'));
            return;
        }
        updateAnimeLink(a.id, link);
        setLocalLink(link);
        setLinkError('');
        setShowAnimeDetail({ ...a, watchLink: link });
        setShowLinkInput(false);
    };


    // Terminada (o ya en Vistas), la nota es lo que falta: sube al bloque principal.
    const ratingFirst = !!a._isWatched || episodeComplete;
    const ratingSection = (
        <div className="detail-section detail-rating-section">
            <h4>{t('detail.yourRating', '★ Tu valoración')}</h4>
            <div className="detail-rating-row">
                <StarRating rating={localRating} size={24} interactive onChange={(r) => { setLocalRating(r); updateUserRating(a.id, r); }} />
                <span className="detail-rating-value" aria-live="polite">{localRating ? `${localRating}/5` : t('detail.unrated')}</span>
            </div>
        </div>
    );
    const finish = () => closeAndDo(() => markAsFinished(a, a._day));
    // Primero pasa a Vistas y después se aplica la nota: así la nota cae sobre la
    // entrada ya movida (las dos actualizaciones corren en ese orden).
    const finishWithRating = (rating) => closeAndDo(() => { markAsFinished(a, a._day); updateUserRating(a.id, rating); });

    return (
        <div className="modal-overlay" onClick={closeDetail}>
            <div ref={dialogRef} className="detail-modal tracking-detail fade-in" role="dialog" aria-modal="true" aria-labelledby="anime-detail-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
                <div className="bottom-sheet-handle" aria-hidden="true"></div>
                <button className="close-btn" onClick={closeDetail} aria-label={t('common.close', 'Cerrar')}>×</button>
                <div className="detail-header">
                    {(a.image || a.imageSm) && !coverFailed
                        ? <img src={a.image || a.imageSm} alt="" loading="lazy" decoding="async" onError={() => setCoverFailed(true)} />
                        : <div className="detail-cover-fallback" aria-hidden="true">{a.title?.charAt(0) || '?'}</div>}
                    <div className="detail-info">
                        <h2 id="anime-detail-title" className={titleExpanded || a.title?.length <= 90 ? '' : 'detail-title-compact'}>{a.title}</h2>
                        {a.title?.length > 90 && <button className="detail-disclosure" aria-expanded={titleExpanded} aria-controls="anime-detail-title" onClick={() => setTitleExpanded(!titleExpanded)}>{t(titleExpanded ? 'detail.lessTitle' : 'detail.fullTitle')}</button>}
                        {a.titleJp && a.titleJp !== a.title && <p className="title-jp detail-original-title"><span className="sr-only">{t('detail.originalTitle')}: </span>{a.titleJp}</p>}
                        <div className="detail-meta">
                            {a.type && <span className="meta-tag type">{typeLabel(a.type)}</span>}
                            {a.year && <span className="meta-tag year">{a.year}</span>}
                            {a.episodes > 0 && <span className="meta-tag eps">{t('card.episodeCount', '{count} episodios', { count: a.episodes })}</span>}
                        </div>
                        {airing && (
                            <p className={`detail-next-ep detail-header-airing ${airing.hasAired ? 'aired' : airing.isToday ? 'today' : ''}`}>
                                {airing.hasAired
                                    ? <>🆕 {t('detail.episodeAvailable', '{episode}: ¡ya disponible!', { episode: airingEpisodeLabel(airing) })}</>
                                    : <>📅 {t('detail.nextEpisodeOn', 'Próximo episodio ({episode}): {date}', { episode: airingEpisodeLabel(airing), date: formatAiringDate(airing.airingAt, airing) })}</>}
                            </p>
                        )}
                        {a.paused && isSchedule && <span className="detail-paused-label">{t('card.pausedOn', 'En pausa · {day}', { day: dayLabel(a._day) })}</span>}
                        <div className="detail-genres">{(a.genres || []).map((g, i) => <span key={i} className="genre-tag">{genreLabel(g)}</span>)}</div>
                        {a.rating > 0 && <div className="detail-score"><span className="score-label">{t('detail.score', 'Valoración:')}</span><span className="score-value">⭐ {Number(a.rating).toFixed(1)}</span></div>}
                    </div>
                </div>

                <div className="detail-primary">
                {(isSchedule || a._isCustomList) && (
                    <div className="detail-section detail-progress-section">
                        <div className="detail-section-header">
                            <h4>{t('detail.progressTitle', '📺 Tu avance')}</h4>
                        </div>
                        <div className="episode-controls">
                            <button className="ep-control-btn" disabled={localEp <= 0} onClick={() => changeLocalEpisode(-1)} aria-label={t('detail.prevEpisode', 'Episodio anterior')}>−</button>
                            <input className="ep-number ep-input" aria-label={t('detail.currentEpisode', 'Episodio actual')} inputMode="numeric" type="text"
                                value={episodeDraft ?? String(localEp)} aria-invalid={!!episodeError} aria-describedby="episode-entry-hint"
                                onChange={(e) => { setEpisodeDraft(e.target.value); setEpisodeError(''); }} onBlur={commitEpisode}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); commitEpisode(); }
                                    if (e.key === 'Escape' && episodeDraft !== null) { e.stopPropagation(); setEpisodeDraft(null); setEpisodeError(''); }
                                }} />
                            {a.episodes > 0 && <span className="ep-total">{t('detail.ofTotal', 'de {total}', { total: a.episodes })}</span>}
                        </div>
                        {/* La acción de todos los días, con nombre: qué episodio se marca. */}
                        <button className="ep-watch-btn" disabled={episodeComplete} onClick={() => changeLocalEpisode(1)}>
                            {episodeComplete ? t('detail.caughtUp', '✓ Al día') : t('detail.watchedEpisode', '✓ Vi el episodio {episode}', { episode: localEp + 1 })}
                        </button>
                        {a.episodes > 0 && (
                            <div className="detail-progress">
                                <div className="card-progress-track" role="progressbar" aria-label={t('card.progress', 'Progreso de episodios')} aria-valuemin={0} aria-valuemax={a.episodes} aria-valuenow={Math.min(localEp, a.episodes)}>
                                    <span style={{ width: `${progressPercent}%` }} />
                                </div>
                                <span className="detail-progress-copy">
                                    {episodeComplete
                                        ? t('detail.progressDone', 'Viste todos los episodios', { count: a.episodes })
                                        : t('detail.progressLeft', '{percent}% · faltan {count}', { percent: progressPercent, count: a.episodes - localEp })}
                                </span>
                            </div>
                        )}
                        <p id="episode-entry-hint" className="episode-entry-hint">{t('detail.editHint', 'Tocá el número para editar')}</p>
                        {episodeError && <p className="tracking-error" role="alert">{episodeError}</p>}
                        {/* Con el seguimiento por temporadas prendido, sus controles van a
                            la vista; lo que se usa de vez en cuando queda plegado. */}
                        {setAnimeSeason && a.currentSeason && <SeasonControls anime={{ ...a, currentEp: localEp }} onChange={changeSeason} />}
                        <details className="detail-progress-more">
                            <summary>{t('detail.moreOptions', 'Más opciones')}</summary>
                            <div className="detail-progress-more-body">
                                <button className={`binge-toggle ${bingeMode ? 'active' : ''}`} onClick={toggleBinge} aria-pressed={bingeMode}>
                                    {t('detail.binge', '🔥 Maratón')}
                                </button>
                                {setAnimeSeason && !a.currentSeason && <SeasonControls anime={{ ...a, currentEp: localEp }} onChange={changeSeason} />}
                            </div>
                            <p className="detail-progress-more-hint">{t('detail.moreOptionsHint', 'Maratón suma varios episodios de una y cuenta la sesión. Por temporadas guarda el avance de cada una por separado.')}</p>
                        </details>
                        {bingeMode && (
                            <div className="binge-panel fade-in">
                                <div className="binge-quick-btns">
                                    {[1, 3, 5].map(n => (
                                        <button key={n} className="binge-quick-btn" disabled={episodeComplete} onClick={() => changeLocalEpisode(n)}>{t('detail.bingeAdd', '+{count} eps', { count: n })}</button>
                                    ))}
                                </div>
                                <div className="binge-stats">
                                        <span className="binge-stat">🔥 {t('detail.bingeSession', '{count} eps esta sesión', { count: bingeCount })}</span>
                                        <span className="binge-stat">⏱ {t('detail.bingeMinutes', '{count} min', { count: bingeMinutes })}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {ratingFirst && ratingSection}

                {/* Una sola sección "Dónde ver": el enlace principal y, debajo, el
                    resto de las opciones (otras plataformas, proveedores por país). */}
                <div className="detail-section detail-watch-section">
                    <div className="detail-section-header">
                        <h4>📺 {t('detail.watch', 'Dónde ver')}</h4>
                        {isTmdbItem && (
                            <select
                                className="region-select"
                                value={region}
                                onChange={(e) => changeRegion(e.target.value)}
                                aria-label={t('detail.region', 'País para ver disponibilidad')}
                            >
                                {TMDB_REGIONS.map((r) => <option key={r.code} value={r.code}>{t(`region.${r.code}`, r.label)}</option>)}
                            </select>
                        )}
                    </div>
                    {effectiveWatchLink && !showLinkInput ? (
                        <div className="detail-link-row">
                            <a href={sanitizeUrl(effectiveWatchLink)} target="_blank" rel="noopener noreferrer" className="platform-btn watch" style={{ '--platform-color': watchPlatform.color }}>▶ {watchPlatform.generic ? t('detail.watchNow') : t('detail.watchOn', undefined, { platform: watchPlatform.name })}</a>
                            <button className="detail-action-sm" onClick={() => setShowLinkInput(true)}>{t('detail.editLink', '✏️ Editar')}</button>
                        </div>
                    ) : (
                        <div className="detail-link-edit">
                            <input type="url" placeholder={t('detail.linkPlaceholder', 'Pegá una URL...')} value={localLink} aria-label={t('detail.watchLink', 'Enlace para ver')} aria-invalid={!!linkError} aria-describedby={linkError ? "watch-link-error" : undefined} onChange={e => { setLocalLink(e.target.value); setLinkError(''); }} onKeyDown={e => { if (e.key === 'Enter') saveLink(); }} />
                            <button className="save-link-btn" onClick={saveLink}>{t('detail.saveLink', 'Guardar')}</button>
                        </div>
                    )}
                    {linkError && <p id="watch-link-error" className="detail-link-error" role="alert">{linkError}</p>}
                    {hasWatchExtras && (
                        <div className="detail-watch-extras">
                            {effectiveWatchLink && otherPlatforms.length > 0 && <p className="detail-watch-extras-label">{t('detail.otherOptions', 'Otras opciones')}</p>}
                            {otherPlatforms.length > 0 && (
                                <div className="streaming-links">
                                    {otherPlatforms.map((l, i) => {
                                        const info = getPlatformInfo(l.url);
                                        return (
                                            <a key={i} href={sanitizeUrl(l.url)} target="_blank" rel="noopener noreferrer"
                                                className="streaming-chip" style={{ '--platform-color': info.color }}>
                                                ▶ {l.site}{l.language ? ` · ${linkLanguageLabel(l.language)}` : ''}
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                            {watchAlternatives.length > 0 && <details className="detail-watch-alternatives">
                                <summary>{t('detail.otherLinks', undefined, { platform: watchPlatform.name })}</summary>
                                <div className="streaming-links">{watchAlternatives.map((link) => <a key={link.url} className="streaming-chip" href={sanitizeUrl(link.url)} target="_blank" rel="noopener noreferrer">{link.site}{link.language ? ` · ${linkLanguageLabel(link.language)}` : ''}</a>)}</div>
                            </details>}
                            {isTmdbItem && (
                                tmdbLoading ? <p className="streaming-status">{t('detail.providersLoading', 'Buscando plataformas…')}</p>
                                : hasProviders ? <>
                                    {providers.flatrate.length > 0 && <ProviderRow label={t('detail.providerStreaming', 'Streaming')} items={providers.flatrate} link={providers.link} />}
                                    {providers.rent.length > 0 && <ProviderRow label={t('detail.providerRent', 'Alquiler')} items={providers.rent} link={providers.link} />}
                                    {providers.buy.length > 0 && <ProviderRow label={t('detail.providerBuy', 'Compra')} items={providers.buy} link={providers.link} />}
                                    <p className="tmdb-attribution">{t('detail.providersAttribution', 'Disponibilidad por JustWatch, vía TMDB')}</p>
                                </>
                                : tmdbExtras ? <p className="streaming-status">{t('detail.providersNone', 'Sin plataformas conocidas en este país.')}</p>
                                : null
                            )}
                        </div>
                    )}
                </div>

                {/* Una acción principal por contexto, las secundarias de a dos y
                    "Dropear" aparte: es la única que no se quiere tocar por error. */}
                {askRating ? (
                    <div className="detail-finish-rating" role="group" aria-labelledby="detail-finish-rating-title">
                        <p id="detail-finish-rating-title" className="detail-finish-rating-title">{t('detail.finishRatingTitle', '¿Qué te pareció?')}</p>
                        <p className="detail-finish-rating-hint">{t('detail.finishRatingHint', 'Ponele una nota y la paso a Vistas.')}</p>
                        <StarRating rating={0} size={30} interactive onChange={finishWithRating} />
                        <div className="detail-finish-rating-actions">
                            <button className="tracking-text-button" onClick={finish}>{t('detail.finishUnrated', 'Finalizar sin nota')}</button>
                            <button className="tracking-text-button" onClick={() => setAskRating(false)}>{t('common.cancel', 'Cancelar')}</button>
                        </div>
                    </div>
                ) : (
                <div className="detail-secondary-row" role="group" aria-label={t('detail.actions')}>
                    {isSchedule && <button className="detail-action-btn finish detail-action-primary" onClick={() => (localRating > 0 ? finish() : setAskRating(true))}>{t('detail.finish', '✓ Finalizar')}</button>}
                    {(a._isWatchLater || a._isCustomList || isDiscovery) && <button className="tracking-text-button detail-action-primary" onClick={() => closeAndDo(() => setShowDayPicker(a))}>{t('detail.addToWeek', '📅 Añadir a semana')}</button>}
                    {a._isWatched && !a.finished && <button className="tracking-pause-button resume detail-action-primary" onClick={() => closeAndDo(() => resumeAnime(a))}>{t('detail.resume', '▶ Retomar')}</button>}

                    {isDiscovery && <button className="tracking-text-button" onClick={() => closeAndDo(() => addToWatchLater(a))}>{t('detail.watchLater', '🕐 Ver después')}</button>}
                    {isDiscovery && <button className="detail-action-btn watched" onClick={() => closeAndDo(() => markAsWatched(a))}>{t('detail.watched', '✓ Visto')}</button>}
                    {isSchedule && setAnimePaused && <button className={`tracking-pause-button ${a.paused ? 'resume' : ''}`}
                        onClick={() => closeAndDo(() => setAnimePaused(a.id, !a.paused))}>
                        {a.paused ? t('detail.resumeOn', '▶ Retomar en {day}', { day: dayLabel(a._day) }) : t('detail.pause', '⏸ Poner en pausa')}
                    </button>}
                    {isSchedule && <button className="detail-action-btn move" onClick={() => closeAndDo(() => setShowMoveDayPicker({ anime: a, fromDay: a._day }))}>{t('detail.moveDay', '↔ Mover día')}</button>}

                    {isSchedule && <button className="detail-action-btn drop detail-action-danger" onClick={() => closeAndDo(() => dropAnime(a, a._day))}>{t('detail.drop', '✗ Dropear')}</button>}
                </div>
                )}
                </div>
                <div className="detail-synopsis">
                    <div className="detail-synopsis-header">
                        <h4>{t('detail.synopsis', '📖 Sinopsis')}</h4>
                        {trailerUrl && (
                            <a className="detail-action-sm detail-trailer-link" href={sanitizeUrl(trailerUrl)} target="_blank" rel="noopener noreferrer">
                                {t('detail.trailer', '🎬 Ver trailer')}
                            </a>
                        )}
                        {translationFailed && !isTranslating && (
                            <button
                                type="button"
                                className="synopsis-retry"
                                onClick={retryTranslate}
                                title={t('detail.retryTranslation', 'Reintentar traducción al español')}
                                aria-label={t('detail.retryTranslation', 'Reintentar traducción al español')}
                            >
                                <span aria-hidden="true">🔄</span> {t('detail.translate', 'Traducir')}
                            </button>
                        )}
                    </div>
                    {isTranslating ? <p className="synopsis-loading">{t('detail.translating', 'Traduciendo')}<span className="dot-anim">...</span></p>
                    : <><p id="detail-synopsis-text">{synopsisExpanded ? synopsis : synopsisPreview}</p>
                        {longSynopsis && <button className="detail-disclosure" aria-expanded={synopsisExpanded} aria-controls="detail-synopsis-text" onClick={() => setSynopsisExpanded(!synopsisExpanded)}>{t(synopsisExpanded ? 'detail.readLess' : 'detail.readMore')}</button>}</>}
                </div>

                {!ratingFirst && ratingSection}

                {customLists.length > 0 && (
                    <div className="detail-section">
                        <div className="detail-section-header">
                            <h4>{t('detail.lists', '📋 Listas')}</h4>
                            <button className="detail-action-sm" onClick={() => setShowListPicker(!showListPicker)}>
                                {showListPicker ? t('detail.hideLists', 'Ocultar') : t('detail.addToList', 'Añadir a lista')}
                            </button>
                        </div>
                        {(() => {
                            const inLists = customLists.filter(l => l.items.some(x => x.id === a.id));
                            return inLists.length > 0 && (
                                <div className="detail-list-tags">
                                    {inLists.map(l => (
                                        <span key={l.id} className="detail-list-tag">
                                            {l.emoji} {l.name}
                                            <button type="button" className="detail-list-tag-remove" onClick={() => removeFromCustomList(l.id, a.id)}
                                                aria-label={t('detail.removeFromList', 'Quitar de {list}', { list: l.name })} title={t('detail.removeFromList', 'Quitar de {list}', { list: l.name })}>
                                                <span aria-hidden="true">✕</span>
                                            </button>
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
                        <h4>{t('detail.related', '🎬 Más de este anime')}</h4>
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
                                            ? <img src={rel.imageSm || rel.image || undefined} alt="" loading="lazy" decoding="async" />
                                            : <span className="related-cover-fallback" aria-hidden="true">🎬</span>}
                                        <span className="related-relation">{relationLabel(rel._relation)}</span>
                                        {libraryIds?.has(rel.id) && (
                                            <span className="related-owned" title={t('detail.inLibrary', 'Ya está en tu biblioteca')} aria-label={t('detail.inLibrary', 'Ya está en tu biblioteca')}>✓</span>
                                        )}
                                    </div>
                                    <span className="related-title">{rel.title}</span>
                                    <span className="related-meta">{[typeLabel(rel.type), rel.year].filter(Boolean).join(' · ')}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {(a._isCustomList || isSchedule || a._isWatchLater || a._isWatched) && <div className="detail-danger-zone" role="group" aria-label={t('detail.removeActions')}>
                    <span>{t('detail.removeActions')}</span>
                    {a._isCustomList && <button className="detail-action-btn delete" onClick={() => closeAndDo(() => removeFromCustomList(a._customListId, a.id))}>{t('detail.removeFromThisList', '✕ Quitar de lista')}</button>}
                    {(isSchedule || a._isWatchLater || a._isWatched) && <button className="detail-action-btn delete" onClick={() => closeAndDo(() => deleteAnime(a))}>{t('bulk.delete', '🗑 Eliminar')}</button>}
                </div>}


            </div>
        </div>
    );
};

export default AnimeDetailModal;
