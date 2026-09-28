import React, { useCallback } from 'react';
import { daysOfWeek } from '../../constants';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';

const DayPickerModal = ({ showDayPicker, setShowDayPicker, watchLater, addToSchedule, moveFromWatchLaterToSchedule }) => {
    const close = useCallback(() => setShowDayPicker(null), [setShowDayPicker]);
    const dialogRef = useAccessibleDialog(close);
    const airDay = daysOfWeek.includes(showDayPicker.airDay) ? showDayPicker.airDay : '';

    return (
        <div className="modal-overlay" onClick={close}>
            <div ref={dialogRef} className="day-picker-modal fade-in" role="dialog" aria-modal="true" aria-labelledby="day-picker-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
                <div className="bottom-sheet-handle" aria-hidden="true"></div>
                <h3 id="day-picker-title">📅 ¿Qué día querés ver "{showDayPicker.title}"?</h3>
                {airDay && <p className="day-picker-hint">Nuevos episodios los {airDay.toLowerCase()} en {showDayPicker.source || 'su plataforma'}</p>}
                <div className="days-grid">{daysOfWeek.map(d => (
                    <button key={d} className={`day-btn ${d === airDay ? 'suggested' : ''}`} onClick={() => {
                        const fromWL = !showDayPicker._isWatched && watchLater.some(a => a.id === showDayPicker.id);
                        if (fromWL) moveFromWatchLaterToSchedule(showDayPicker, d);
                        else addToSchedule(showDayPicker, d);
                    }}>{d}{d === airDay && <span className="day-btn-badge">Nuevo ep.</span>}</button>
                ))}</div>
            </div>
        </div>
    );
};

export default DayPickerModal;
