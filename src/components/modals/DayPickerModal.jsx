import React, { useEffect } from 'react';
import { daysOfWeek } from '../../constants';

const DayPickerModal = ({ showDayPicker, setShowDayPicker, watchLater, addToSchedule, moveFromWatchLaterToSchedule }) => {
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') setShowDayPicker(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [setShowDayPicker]);

    return (
        <div className="modal-overlay" onClick={() => setShowDayPicker(null)} role="dialog" aria-modal="true" aria-labelledby="day-picker-title">
            <div className="day-picker-modal fade-in" onClick={e => e.stopPropagation()}>
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
