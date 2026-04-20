import React, { useRef } from 'react';
import AnimeCard from '../AnimeCard';
import AiringSection from '../AiringSection';
import { daysOfWeek, dayEmojis } from '../../constants';

const ScheduleView = ({
  schedule, airingData, setShowAnimeDetail,
  dragState, isDragging, dropTarget, dropIndex,
  handleDragStart, handleDragEnd, handleDragOverRow, handleDragOverCard,
  handleDrop, handleTouchStart, handleTouchMove, handleTouchEnd, touchRef,
}) => {
  const dayRowRefs = useRef({});

  return (
    <div className="schedule-rows" role="region" aria-label="Horario semanal">
      {Object.keys(airingData).length > 0 && (
        <AiringSection
          schedule={schedule}
          airingData={airingData}
          onDetail={(a) => setShowAnimeDetail({ ...a, _day: a._day, _isWatchLater: false, _isWatched: false, _isSeason: false })}
        />
      )}
      {daysOfWeek.map((day, i) => (
        <div
          key={day}
          ref={(el) => { dayRowRefs.current[day] = el; }}
          className={`day-row fade-in ${dropTarget === day ? 'drop-target' : ''} ${isDragging && dragState.fromDay === day ? 'drag-source' : ''}`}
          onDragOver={(e) => handleDragOverRow(e, day)}
          onDrop={(e) => handleDrop(e, day)}
        >
          <div className="day-label">
            <span className="day-emoji" aria-hidden="true">{dayEmojis[i]}</span>
            <span className="day-name">{day}</span>
            <span className="day-count" aria-label={`${schedule[day].length} animes`}>{schedule[day].length}</span>
          </div>
          <div className="day-animes">
            {schedule[day].length > 0 ? schedule[day].map((a, idx) => (
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
                  onClick={() => {
                    if (touchRef.current.moved || touchRef.current.active) return;
                    setShowAnimeDetail({ ...a, _day: day, _isWatchLater: false, _isWatched: false, _isSeason: false });
                  }}
                />
                {dropTarget === day && dropIndex === idx + 1 && idx === schedule[day].length - 1 && isDragging && <div className="drop-indicator" />}
              </React.Fragment>
            )) : <div className="day-empty">{dropTarget === day ? '⬇️ Soltar aquí' : 'Sin animes'}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default React.memo(ScheduleView);
