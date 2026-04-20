import React from 'react';

const MoveDayPickerModal = ({ showMoveDayPicker, setShowMoveDayPicker, moveAnimeToDay }) => (
    <div className="modal-overlay" onClick={() => setShowMoveDayPicker(null)} role="dialog" aria-modal="true" aria-labelledby="move-day-picker-title">
        <div className="day-picker-modal fade-in" onClick={e => e.stopPropagation()}>
            <div className="bottom-sheet-handle" aria-hidden="true"></div>
            <h3 id="move-day-picker-title">↔ Mover "{showMoveDayPicker.anime.title}" a otro día</h3>
            <div className="days-grid">{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].filter(d => d !== showMoveDayPicker.fromDay).map(d => (
                <button key={d} className="day-btn" onClick={() => moveAnimeToDay(showMoveDayPicker.anime, showMoveDayPicker.fromDay, d)}>{d}</button>
            ))}</div>
        </div>
    </div>
);

export default MoveDayPickerModal;
