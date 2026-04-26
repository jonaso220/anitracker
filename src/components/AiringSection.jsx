import React, { useState } from 'react';
import { daysOfWeek } from '../constants';

const STORAGE_KEY = 'anitracker-airing-expanded';

const AiringSection = ({ schedule, airingData, onDetail, onScrollToDay }) => {
    const allAnime = daysOfWeek.flatMap(d => (schedule[d] || []).map(a => ({ ...a, _day: d })));
    const airingAnime = allAnime.filter(a => airingData[a.id]).map(a => ({
        ...a, airing: airingData[a.id]
    })).sort((a, b) => a.airing.airingAt - b.airing.airingAt);

    const [expanded, setExpanded] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
    });
    const toggle = () => {
        setExpanded((v) => {
            const next = !v;
            try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { /* empty */ }
            return next;
        });
    };

    if (airingAnime.length === 0) return null;

    const formatAiringTime = (airing) => {
        if (airing.hasAired) return '¡Ya disponible!';
        if (airing.isToday) {
            const hours = Math.floor(airing.timeUntilAiring / 3600);
            const mins = Math.floor((airing.timeUntilAiring % 3600) / 60);
            return hours > 0 ? `En ${hours}h ${mins}m` : `En ${mins}m`;
        }
        if (airing.isTomorrow) return 'Mañana';
        const date = new Date(airing.airingAt * 1000);
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        return dayNames[date.getDay()];
    };

    return (
        <div className={`airing-section fade-in ${expanded ? 'expanded' : 'collapsed'}`}>
            <button
                type="button"
                className="airing-header"
                onClick={toggle}
                aria-expanded={expanded}
                aria-controls="airing-list-panel"
            >
                <span className="airing-icon" aria-hidden="true">
                    <span className="airing-icon-dot" />
                    📡
                </span>
                <h3>Próximos episodios</h3>
                <span className="airing-count">{airingAnime.length}</span>
                <span className="airing-chevron" aria-hidden="true">▾</span>
            </button>
            <div id="airing-list-panel" className="airing-list" hidden={!expanded}>
                {airingAnime.map(a => (
                    <div key={a.id} className={`airing-item ${a.airing.hasAired ? 'aired' : a.airing.isToday ? 'today' : ''}`}
                        onClick={() => onDetail(a)}>
                        <img src={a.imageSm || a.image} alt={a.title} className="airing-img" loading="lazy" decoding="async" />
                        <div className="airing-info">
                            <span className="airing-title">{a.title}</span>
                            <span className="airing-ep">Ep. {a.airing.episode}{a.airing.totalEpisodes ? ` / ${a.airing.totalEpisodes}` : ''}</span>
                        </div>
                        <div className={`airing-time ${a.airing.hasAired ? 'aired' : a.airing.isToday ? 'today' : a.airing.isTomorrow ? 'tomorrow' : 'later'}`}>
                            {formatAiringTime(a.airing)}
                        </div>
                        {onScrollToDay && a._day && (
                            <button
                                type="button"
                                className="airing-jump"
                                onClick={(e) => { e.stopPropagation(); onScrollToDay(a._day); }}
                                aria-label={`Ir al día ${a._day}`}
                                title={`Ir a ${a._day}`}
                            >
                                <span aria-hidden="true">↓</span>
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default React.memo(AiringSection);
