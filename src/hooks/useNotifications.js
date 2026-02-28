import { useState, useEffect, useRef, useCallback } from 'react';

export function useNotifications(airingData) {
  const [notifEnabled, setNotifEnabled] = useState(() => {
    try { return localStorage.getItem('anitracker-notif') === 'true'; } catch { return false; }
  });
  const [notifPermission, setNotifPermission] = useState(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  });
  const notifiedRef = useRef(new Set());
  const checkIntervalRef = useRef(null);

  // Persist preference
  useEffect(() => {
    localStorage.setItem('anitracker-notif', notifEnabled ? 'true' : 'false');
  }, [notifEnabled]);

  // Load already-notified IDs from session
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('anitracker-notified');
      if (saved) notifiedRef.current = new Set(JSON.parse(saved));
    } catch { /* empty */ }
  }, []);

  const saveNotified = useCallback(() => {
    try {
      sessionStorage.setItem('anitracker-notified', JSON.stringify([...notifiedRef.current]));
    } catch { /* empty */ }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') {
      setNotifPermission('granted');
      setNotifEnabled(true);
      return true;
    }
    if (Notification.permission === 'denied') {
      setNotifPermission('denied');
      return false;
    }
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      setNotifEnabled(true);
      return true;
    }
    return false;
  }, []);

  const toggleNotifications = useCallback(async () => {
    if (notifEnabled) {
      setNotifEnabled(false);
      return;
    }
    await requestPermission();
  }, [notifEnabled, requestPermission]);

  const sendNotification = useCallback((title, body, tag, data) => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      // Fallback to regular Notification API
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icon-192.png', tag });
      }
      return;
    }
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title,
      body,
      tag,
      data
    });
  }, []);

  // Check airing data periodically for notifications
  useEffect(() => {
    if (!notifEnabled || notifPermission !== 'granted') return;

    const checkAiring = () => {
      Object.entries(airingData).forEach(([id, airing]) => {
        const key = `${id}-ep${airing.episode}`;

        // Already aired - notify if not already done
        if (airing.hasAired && !notifiedRef.current.has(key)) {
          notifiedRef.current.add(key);
          saveNotified();
          sendNotification(
            `${airing.title || 'Anime'}`,
            `Ep. ${airing.episode} ya disponible!`,
            `airing-${key}`
          );
        }

        // Airing today within 30 min
        if (airing.isToday && airing.timeUntilAiring > 0 && airing.timeUntilAiring <= 1800) {
          const soonKey = `${key}-soon`;
          if (!notifiedRef.current.has(soonKey)) {
            notifiedRef.current.add(soonKey);
            saveNotified();
            const mins = Math.floor(airing.timeUntilAiring / 60);
            sendNotification(
              `${airing.title || 'Anime'}`,
              `Ep. ${airing.episode} sale en ${mins} min!`,
              `airing-soon-${key}`
            );
          }
        }
      });
    };

    checkAiring();
    checkIntervalRef.current = setInterval(checkAiring, 60000); // Check every minute

    return () => {
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [airingData, notifEnabled, notifPermission, sendNotification, saveNotified]);

  return {
    notifEnabled,
    notifPermission,
    toggleNotifications,
    requestPermission
  };
}
