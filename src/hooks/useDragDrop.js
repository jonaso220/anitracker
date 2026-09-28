import { useState, useRef, useEffect } from 'react';

export function useDragDrop(schedule, setSchedule, daysOfWeek) {
  const [dragState, setDragState] = useState({ anime: null, fromDay: null });
  const [isDragging, setIsDragging] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  
  const dragRef = useRef({ anime: null, fromDay: null });
  const dropIndexRef = useRef(null);
  const touchRef = useRef({ timer: null, active: false, anime: null, fromDay: null, startY: 0, ghost: null });
  const dropTargetRef = useRef(null); // Ref para acceso síncrono en touch

  const resetTimerRef = useRef(null);
  const mouseTimerRef = useRef(null);
  const lastTouchRef = useRef(null);
  const autoScrollRef = useRef(null);
  const releaseTouchRef = useRef(null);
  const scheduleRef = useRef(schedule);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => () => {
    clearTimeout(touchRef.current.timer);
    clearTimeout(resetTimerRef.current);
    clearTimeout(mouseTimerRef.current);
    cancelAnimationFrame(autoScrollRef.current);
    releaseTouchRef.current?.();
    touchRef.current.ghost?.remove();
  }, []);

  // --- Logic Helpers ---
  const insertAnimeAtPosition = (anime, fromDay, toDay, index) => {
    setSchedule(prev => {
      if (!daysOfWeek.includes(toDay)) return prev;
      const current = prev[fromDay]?.find((a) => a.id === anime.id) || anime;
      const destination = prev[toDay] || [];
      const removedIndex = destination.findIndex((a) => a.id === anime.id);
      const adjustedIndex = index == null ? destination.length : index - (removedIndex >= 0 && removedIndex < index ? 1 : 0);
      const next = { ...prev };
      if (fromDay) {
        next[fromDay] = next[fromDay].filter(a => a.id !== anime.id);
      }
      const filtered = (next[toDay] || []).filter(a => a.id !== anime.id);
      const clampedIdx = Math.max(0, Math.min(adjustedIndex, filtered.length));
      next[toDay] = [...filtered.slice(0, clampedIdx), current, ...filtered.slice(clampedIdx)];
      return next;
    });
  };

  // --- Mouse Handlers ---
  const handleDragStart = (e, anime, fromDay) => {
    dropTargetRef.current = null;
    dropIndexRef.current = null;
    dragRef.current = { anime, fromDay };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', anime.id.toString());
    mouseTimerRef.current = setTimeout(() => {
      setDragState({ anime, fromDay });
      setIsDragging(true);
    }, 0);
  };

  const handleDragEnd = () => {
    clearTimeout(mouseTimerRef.current);
    dropTargetRef.current = null;
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
    if (dropTargetRef.current !== day) {
      dropIndexRef.current = null;
      setDropIndex(null);
    }
    dropTargetRef.current = day;
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
    
    dropTargetRef.current = day;
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
    if (e.target?.closest?.('button, a, input, select, textarea')) return;
    clearTimeout(resetTimerRef.current);
    clearTimeout(touchRef.current.timer);
    touchRef.current.ghost?.remove();
    touchRef.current.active = false;
    touchRef.current.ghost = null;
    dropTargetRef.current = null;
    dropIndexRef.current = null;
    setDropTarget(null);
    setDropIndex(null);
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
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      holdTouch();
      setDragState({ anime, fromDay: day });
      setIsDragging(true);
    }, 400);
  };

  const handleTouchMove = (e) => {
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
    if (touchRef.current.ghost) {
      touchRef.current.ghost.style.top = (touch.clientY - 20) + 'px';
      touchRef.current.ghost.style.left = (touch.clientX - 60) + 'px';
    }

    lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    updateTouchTarget(touch.clientX, touch.clientY);
  };

  // Día e índice bajo el dedo. Se recalcula también durante el auto-scroll:
  // las filas se mueven debajo de un dedo quieto.
  const updateTouchTarget = (x, y) => {
    const ghostEl = touchRef.current.ghost;
    if (ghostEl) ghostEl.style.pointerEvents = 'none';
    const element = document.elementFromPoint(x, y);
    if (ghostEl) ghostEl.style.pointerEvents = '';
    const dayRow = element?.closest('.day-row');
    const current = scheduleRef.current;

    if (dayRow) {
        const dayLabel = dayRow.querySelector('.day-name');
        const detectedDay = dayLabel ? dayLabel.textContent.trim() : null;
        if (detectedDay && daysOfWeek.includes(detectedDay)) {
          dropTargetRef.current = detectedDay;
          setDropTarget(detectedDay);

          // Calcular índice de inserción basado en las tarjetas de la fila
          const cards = dayRow.querySelectorAll('.anime-card');
          let idx = (current[detectedDay] || []).length;
          for (let i = 0; i < cards.length; i++) {
            const rect = cards[i].getBoundingClientRect();
            if (y < rect.bottom && x < rect.left + rect.width / 2) {
              const originalIndex = (current[detectedDay] || []).findIndex((item) => String(item.id) === cards[i].dataset.animeId);
              idx = originalIndex >= 0 ? originalIndex : i; break;
            }
          }
          dropIndexRef.current = idx;
          setDropIndex(idx);
        }
    } else {
        dropTargetRef.current = null;
        setDropTarget(null);
    }
  };

  // Auto-scroll cerca de los bordes para llegar a días fuera de pantalla (en
  // celular los 7 días van uno debajo del otro). Más rápido cuanto más cerca.
  const EDGE_PX = 90;
  const MAX_SPEED = 18;
  const autoScrollStep = () => {
    autoScrollRef.current = null;
    const last = lastTouchRef.current;
    if (!touchRef.current.active || !last) return;
    const nav = document.querySelector('.nav-tabs');
    const navRect = nav?.getBoundingClientRect();
    // En celular la barra de pestañas está fija abajo: el borde útil es su tope.
    const bottomEdge = navRect && navRect.top > window.innerHeight / 2 ? navRect.top : window.innerHeight;
    let speed = 0;
    if (last.y < EDGE_PX) speed = -MAX_SPEED * (1 - last.y / EDGE_PX);
    else if (last.y > bottomEdge - EDGE_PX) speed = MAX_SPEED * Math.min(1, (last.y - (bottomEdge - EDGE_PX)) / EDGE_PX);
    if (speed) {
      window.scrollBy(0, speed);
      updateTouchTarget(last.x, last.y);
    }
    autoScrollRef.current = requestAnimationFrame(autoScrollStep);
  };

  // Mientras se arrastra, la página no debe desplazarse con el dedo. React
  // registra touchmove como pasivo (su preventDefault no hace nada), así que
  // se agrega uno nativo no pasivo solo durante el arrastre. También se evita
  // el menú contextual que Android abre con la pulsación larga.
  const holdTouch = () => {
    const block = (event) => { if (event.cancelable) event.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    document.addEventListener('contextmenu', block);
    releaseTouchRef.current = () => {
      document.removeEventListener('touchmove', block);
      document.removeEventListener('contextmenu', block);
      releaseTouchRef.current = null;
    };
    autoScrollRef.current = requestAnimationFrame(autoScrollStep);
  };

  const finishTouch = (cancelled = false) => {
    if (touchRef.current.timer) clearTimeout(touchRef.current.timer);
    if (touchRef.current.ghost) touchRef.current.ghost.remove();
    cancelAnimationFrame(autoScrollRef.current);
    autoScrollRef.current = null;
    lastTouchRef.current = null;
    releaseTouchRef.current?.();

    const target = dropTargetRef.current;
    const idx = dropIndexRef.current;

    if (!cancelled && touchRef.current.active && touchRef.current.anime && target) {
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
    resetTimerRef.current = setTimeout(() => {
      touchRef.current = { timer: null, active: false, anime: null, fromDay: null, startY: 0, startX: 0, ghost: null, moved: false };
    }, 0);
  };

  const handleTouchEnd = () => finishTouch();
  const handleTouchCancel = () => finishTouch(true);

  return {
    dragState, isDragging, dropTarget, dropIndex, setDropTarget, setDropIndex,
    dropIndexRef, dropTargetRef, touchRef, // Exponemos refs para integración fina
    handleDragStart, handleDragEnd, handleDragOverRow, handleDragOverCard, handleDrop,
    handleTouchStart, handleTouchMove, handleTouchEnd, handleTouchCancel
  };
}
