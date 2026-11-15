import { useEpisodeAlerts } from '../hooks/useEpisodeAlerts';

/**
 * Monta `useEpisodeAlerts` desde un chunk aparte: quien no usa los avisos no
 * baja ese código con la carga inicial. `activated` = se prendieron en esta
 * sesión (lo ya emitido se da por avisado, sin una tanda de avisos viejos).
 */
export default function EpisodeAlertsBridge({ schedule, airingData, enabled, activated }) {
  useEpisodeAlerts({ schedule, airingData, enabled, activated });
  return null;
}
