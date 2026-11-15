import React, { useCallback } from 'react';
import { daysOfWeek } from '../../constants';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import { t } from '../../i18n';

const MoveDayPickerModal = ({ showMoveDayPicker, setShowMoveDayPicker, moveAnimeToDay }) => {
    const close = useCallback(() => setShowMoveDayPicker(null), [setShowMoveDayPicker]);
    const dialogRef = useAccessibleDialog(close);

    return (
        <div className="modal-overlay" onClick={close}>
            <div ref={dialogRef} className="day-picker-modal fade-in" role="dialog" aria-modal="true" aria-labelledby="move-day-picker-title" tabIndex={-1} onClick={e => e.stopPropagation()}>
                <div className="bottom-sheet-handle" aria-hidden="true"></div>
                <h3 id="move-day-picker-title">↔ {t('dayPicker.moveTitle', 'Mover "{title}" a otro día', { title: showMoveDayPicker.anime.title })}</h3>
                <div className="days-grid">{daysOfWeek.filter(d => d !== showMoveDayPicker.fromDay).map(d => (
                    <button key={d} className="day-btn" onClick={() => moveAnimeToDay(showMoveDayPicker.anime, showMoveDayPicker.fromDay, d)}>{d}</button>
                ))}</div>
            </div>
        </div>
    );
};

export default MoveDayPickerModal;
