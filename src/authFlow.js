const PRODUCTION_HOST = 'anitracker-jona.netlify.app';
const FIREBASE_PROJECT = 'animetracker-47abf';

export function resolveAuthDomain({ hostname, configuredDomain, projectId }) {
  if (configuredDomain) return configuredDomain;
  // This host serves Firebase's helpers through the /__/auth proxy. Preview
  // and local hosts must keep the provider's registered Firebase domain.
  if (hostname === PRODUCTION_HOST && projectId === FIREBASE_PROJECT) return hostname;
  return `${projectId}.firebaseapp.com`;
}

export function shouldRedirectGoogle({ hostname, authDomain, standalone }) {
  // A same-origin helper keeps the redirect state in the app's storage
  // partition. Never redirect to a different auth domain in a standalone app.
  return Boolean(standalone && hostname === authDomain);
}
