import React from 'react';

const MoveDayPickerModal = ({ showMoveDayPicker, setShowMoveDayPicker, moveAnimeToDay }) => (
    <div className="modal-overlay" onClick={() => setShowMoveDayPicker(null)}>
        <div className="day-picker-modal fade-in" onClick={e => e.stopPropagation()}>
            <h3>↔ Mover "{showMoveDayPicker.anime.title}" a otro día</h3>
            <div className="days-grid">{['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].filter(d => d !== showMoveDayPicker.fromDay).map(d => (
                <button key={d} className="day-btn" onClick={() => moveAnimeToDay(showMoveDayPicker.anime, showMoveDayPicker.fromDay, d)}>{d}</button>
            ))}</div>
        </div>
    </div>
);

export default MoveDayPickerModal;
