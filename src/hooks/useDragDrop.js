import { useState, useRef } from 'react';

export function useDragDrop(schedule, setSchedule, daysOfWeek) {
  const [dragState, setDragState] = useState({ anime: null, fromDay: null });
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  
  const dragRef = useRef({ anime: null, fromDay: null });
  const dropIndexRef = useRef(null);
  const touchRef = useRef({ timer: null, active: false, anime: null, fromDay: null, startY: 0, ghost: null });
  const dropTargetRef = useRef(null); // Ref para acceso síncrono en touch

  // --- Logic Helpers ---
  const insertAnimeAtPosition = (anime, fromDay, toDay, index) => {
    setSchedule(prev => {
      const next = { ...prev };
      if (fromDay) {
        next[fromDay] = next[fromDay].filter(a => a.id !== anime.id);
      }
      const targetList = [...(next[toDay] || []).filter(a => a.id !== anime.id)];
      const clampedIdx = Math.min(index ?? targetList.length, targetList.length);
      targetList.splice(clampedIdx, 0, anime);
      next[toDay] = targetList;
      return next;
    });
  };

  // --- Mouse Handlers ---
  const handleDragStart = (e, anime, fromDay) => {
    dragRef.current = { anime, fromDay };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', anime.id.toString());
    setTimeout(() => {
      setDragState({ anime, fromDay });
      setIsDragging(true);
    }, 0);
  };

  const handleDragEnd = () => {
    dragRef.current = { anime: null, fromDay: null };
    setDragState({ anime: null, fromDay: null });
    setIsDragging(false);
    setDropTarget(null);
    setDropIndex(null);
    dropIndexRef.current = null;
  };

  const handleDragOverRow = (e, day) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== day) setDropTarget(day);
    if (!schedule[day] || schedule[day].length === 0) {
      dropIndexRef.current = 0;
      setDropIndex(0);
    }
  };

  const handleDragOverCard = (e, day, cardIndex) => {
    e.preventDefault(); // Necesario para permitir drop
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dropTarget !== day) setDropTarget(day);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const idx = e.clientX < midX ? cardIndex : cardIndex + 1;
    
    if (dropIndexRef.current !== idx) {
        dropIndexRef.current = idx;
        setDropIndex(idx);
    }
  };

  const handleDrop = (e, toDay) => {
    e.preventDefault();
    const { anime, fromDay } = dragRef.current;
    const idx = dropIndexRef.current;
    if (!anime) return handleDragEnd();
    
    insertAnimeAtPosition(anime, fromDay, toDay, idx);
    handleDragEnd();
  };

  // --- Touch Handlers (Mobile) ---
  const handleTouchStart = (e, anime, day) => {
    const touch = e.touches[0];
    touchRef.current.startY = touch.clientY;
    touchRef.current.startX = touch.clientX;
    touchRef.current.moved = false;
    
    touchRef.current.timer = setTimeout(() => {
      touchRef.current.active = true;
      touchRef.current.anime = anime;
      touchRef.current.fromDay = day;
      
      // Crear Ghost
      const ghost = document.createElement('div');
      ghost.className = 'touch-drag-ghost';
      ghost.textContent = anime.title;
      ghost.style.cssText = `position:fixed;top:${touch.clientY - 20}px;left:${touch.clientX - 60}px;z-index:9999;
        padding:8px 14px;border-radius:10px;font-size:0.8rem;font-weight:600;max-width:180px;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;
        background:linear-gradient(135deg,#a855f7,#4ecdc4);color:#fff;box-shadow:0 8px 25px rgba(168,85,247,0.5);`;
      document.body.appendChild(ghost);
      touchRef.current.ghost = ghost;
      
      if (navigator.vibrate) navigator.vibrate(30);
      
      dragRef.current = { anime, fromDay: day };
      setDragState({ anime, fromDay: day });
      setIsDragging(true);
    }, 400);
  };

  const handleTouchMove = (e, day) => {
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchRef.current.startX);
    const dy = Math.abs(touch.clientY - touchRef.current.startY);
    if (dx > 10 || dy > 10) touchRef.current.moved = true;

    if (!touchRef.current.active) {
      if (touchRef.current.moved && touchRef.current.timer) {
        clearTimeout(touchRef.current.timer);
        touchRef.current.timer = null;
      }
      return;
    }
    e.preventDefault(); // Prevenir scroll
    
    if (touchRef.current.ghost) {
      touchRef.current.ghost.style.top = (touch.clientY - 20) + 'px';
      touchRef.current.ghost.style.left = (touch.clientX - 60) + 'px';
    }

    // Detección manual de elementos bajo el dedo
    const ghostEl = touchRef.current.ghost;
    if (ghostEl) ghostEl.style.pointerEvents = 'none';
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    if (ghostEl) ghostEl.style.pointerEvents = '';
    const dayRow = element?.closest('.day-row');

    if (dayRow) {
        const dayLabel = dayRow.querySelector('.day-name');
        const detectedDay = dayLabel ? dayLabel.textContent.trim() : null;
        if (detectedDay && daysOfWeek.includes(detectedDay)) {
          dropTargetRef.current = detectedDay;
          setDropTarget(detectedDay);

          // Calcular índice de inserción basado en las tarjetas de la fila
          const cards = dayRow.querySelectorAll('.anime-card');
          let idx = cards.length;
          for (let i = 0; i < cards.length; i++) {
            const rect = cards[i].getBoundingClientRect();
            if (touch.clientX < rect.left + rect.width / 2) { idx = i; break; }
          }
          dropIndexRef.current = idx;
          setDropIndex(idx);
        }
    } else {
        dropTargetRef.current = null;
        setDropTarget(null);
    }
  };

  const handleTouchEnd = () => {
    if (touchRef.current.timer) clearTimeout(touchRef.current.timer);
    if (touchRef.current.ghost) touchRef.current.ghost.remove();

    const target = dropTargetRef.current;
    const idx = dropIndexRef.current;

    if (touchRef.current.active && touchRef.current.anime && target) {
      insertAnimeAtPosition(touchRef.current.anime, touchRef.current.fromDay, target, idx);
    }

    const wasMoved = touchRef.current.moved;
    const wasActive = touchRef.current.active;

    // Keep flags readable for the click handler that fires after touchend
    touchRef.current.ghost = null;
    touchRef.current.timer = null;
    touchRef.current.anime = null;
    touchRef.current.moved = wasMoved;
    touchRef.current.active = wasActive;

    handleDragEnd();

    // Delay full reset so onClick can still check moved/active flags
    setTimeout(() => {
      touchRef.current = { timer: null, active: false, anime: null, fromDay: null, startY: 0, startX: 0, ghost: null, moved: false };
    }, 0);
  };

  return {
    dragState, isDragging, dropTarget, dropIndex, setDropTarget, setDropIndex,
    dropIndexRef, dropTargetRef, touchRef, // Exponemos refs para integración fina
    handleDragStart, handleDragEnd, handleDragOverRow, handleDragOverCard, handleDrop,
    handleTouchStart, handleTouchMove, handleTouchEnd
  };
}