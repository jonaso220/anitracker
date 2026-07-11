import React, { useCallback } from 'react';
import { daysOfWeek } from '../../constants';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';

const DayPickerModal = ({ showDayPicker, setShowDayPicker, watchLater, addToSchedule, moveFromWatchLaterToSchedule }) => {
    const close = useCallback(() => setShowDayPicker(null), [setShowDayPicker]);
    const dialogRef = useAccessibleDialog(close);

    return (
        <div className="modal-overlay" onClick={close}>
            <div ref={dialogRef} className="day-picker-modal fade-in" role="dialog" aria-modal="true" aria-labelledby="day-picker-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
                <div className="bottom-sheet-handle" aria-hidden="true"></div>
                <h3 id="day-picker-title">📅 ¿Qué día querés ver "{showDayPicker.title}"?</h3>
                <div className="days-grid">{daysOfWeek.map(d => (
                    <button key={d} className="day-btn" onClick={() => {
                        const fromWL = watchLater.some(a => a.id === showDayPicker.id);
                        if (fromWL) moveFromWatchLaterToSchedule(showDayPicker, d);
                        else addToSchedule(showDayPicker, d);
                    }}>{d}</button>
                ))}</div>
            </div>
        </div>
    );
};

export default DayPickerModal;
