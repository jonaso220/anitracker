import React from 'react';
import { daysOfWeek, dayEmojis } from '../../constants';

const BulkDayPickerModal = ({ count, onPickDay, onClose }) => (
  <div
    className="modal-overlay"
    onClick={onClose}
    role="dialog"
    aria-modal="true"
    aria-labelledby="bulk-day-picker-title"
  >
    <div className="day-picker-modal fade-in" onClick={(e) => e.stopPropagation()}>
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

export default BulkDayPickerModal;
