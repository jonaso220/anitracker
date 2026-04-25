import React, { useRef, useCallback } from 'react';
import AnimeCard from '../AnimeCard';
import AiringSection from '../AiringSection';
import { daysOfWeek, dayEmojis } from '../../constants';

// Maps JS Date.getDay() (0=Sun…6=Sat) to our daysOfWeek index (0=Mon…6=Sun)
const todayDayName = () => {
  const jsDay = new Date().getDay();
  return daysOfWeek[(jsDay + 6) % 7];
};

const ScheduleView = ({
  schedule, airingData, setShowAnimeDetail, updateEpisode,
  dragState, isDragging, dropTarget, dropIndex,
  handleDragStart, handleDragEnd, handleDragOverRow, handleDragOverCard,
  handleDrop, handleTouchStart, handleTouchMove, handleTouchEnd, touchRef,
}) => {
  const dayRowRefs = useRef({});
  const today = todayDayName();

  const scrollToDay = useCallback((day) => {
    const el = dayRowRefs.current[day];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('day-row-flash');
    setTimeout(() => el.classList.remove('day-row-flash'), 1400);
  }, []);

  return (
    <div className="schedule-rows" role="region" aria-label="Horario semanal">
      {Object.keys(airingData).length > 0 && (
        <AiringSection
          schedule={schedule}
          airingData={airingData}
          onDetail={(a) => setShowAnimeDetail({ ...a, _day: a._day, _isWatchLater: false, _isWatched: false, _isSeason: false })}
          onScrollToDay={scrollToDay}
        />
      )}
      {daysOfWeek.map((day, i) => {
        const items = schedule[day] || [];
        const isEmpty = items.length === 0;
        const isToday = day === today;
        return (
          <section
            key={day}
            ref={(el) => { dayRowRefs.current[day] = el; }}
            className={`day-row fade-in ${isToday ? 'is-today' : ''} ${isEmpty ? 'is-empty' : ''} ${dropTarget === day ? 'drop-target' : ''} ${isDragging && dragState.fromDay === day ? 'drag-source' : ''}`}
            onDragOver={(e) => handleDragOverRow(e, day)}
            onDrop={(e) => handleDrop(e, day)}
            aria-labelledby={`day-${day}`}
          >
            <header className="day-label" id={`day-${day}`}>
              <span className="day-emoji" aria-hidden="true">{dayEmojis[i]}</span>
              <span className="day-name">{day}</span>
              {isToday && <span className="day-today-pill" aria-label="Hoy">HOY</span>}
              <span className="day-count" aria-label={`${items.length} animes`}>{items.length}</span>
            </header>
            {!isEmpty && (
              <div className="day-animes">
                {items.map((a, idx) => (
                  <React.Fragment key={a.id}>
                    {dropTarget === day && dropIndex === idx && isDragging && dragState.anime?.id !== a.id && <div className="drop-indicator" />}
                    <AnimeCard
                      anime={a} day={day} cardIndex={idx} cardDay={day} airingData={airingData} isDraggable
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOverCard}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onIncrementEpisode={updateEpisode}
                      onClick={() => {
                        if (touchRef.current.moved || touchRef.current.active) return;
                        setShowAnimeDetail({ ...a, _day: day, _isWatchLater: false, _isWatched: false, _isSeason: false });
                      }}
                    />
                    {dropTarget === day && dropIndex === idx + 1 && idx === items.length - 1 && isDragging && <div className="drop-indicator" />}
                  </React.Fragment>
                ))}
              </div>
            )}
            {isEmpty && (
              <div className="day-empty" role="status">
                {dropTarget === day ? '⬇️ Soltar aquí' : 'Sin animes este día'}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};

export default React.memo(ScheduleView);
