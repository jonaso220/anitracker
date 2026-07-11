import React from 'react';
import { daysOfWeek, dayEmojis } from '../../constants';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';

const BulkDayPickerModal = ({ count, onPickDay, onClose }) => {
  const dialogRef = useAccessibleDialog(onClose);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
    >
      <div ref={dialogRef} className="day-picker-modal fade-in" role="dialog" aria-modal="true" aria-labelledby="bulk-day-picker-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <h3 id="bulk-day-picker-title" style={{ marginBottom: '1rem', textAlign: 'center' }}>
          Mover {count} anime{count > 1 ? 's' : ''} a...
        </h3>
        <div className="days-grid">
          {daysOfWeek.map((day, i) => (
            <button key={day} className="day-btn" onClick={() => onPickDay(day)}>
              <span aria-hidden="true">{dayEmojis[i]}</span> {day}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BulkDayPickerModal;
