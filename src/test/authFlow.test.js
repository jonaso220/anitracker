import { describe, it, expect } from 'vitest';
import { resolveAuthDomain, shouldRedirectGoogle } from '../authFlow';

const production = {hostname:'anitracker-jona.netlify.app',projectId:'animetracker-47abf'};
describe('Google auth routing', () => {
  it('uses the production proxy on its exact registered host', () => {
    expect(resolveAuthDomain(production)).toBe(production.hostname);
  });
  it.each(['localhost','127.0.0.1','preview--anitracker-jona.netlify.app','anitracker-jona.netlify.app.example.org'])(
    'does not use an unconfigured proxy on %s', (hostname) => {
      expect(resolveAuthDomain({...production,hostname})).toBe('animetracker-47abf.firebaseapp.com');
    }
  );
  it('preserves an explicitly configured auth domain', () => {
    expect(resolveAuthDomain({...production,configuredDomain:'login.example.com'})).toBe('login.example.com');
  });
  it('does not send another Firebase project through the fixed production proxy', () => {
    expect(resolveAuthDomain({...production,projectId:'other'})).toBe('other.firebaseapp.com');
  });
  it('uses a same-origin redirect for installed apps', () => {
    expect(shouldRedirectGoogle({hostname:production.hostname,authDomain:production.hostname,standalone:true})).toBe(true);
  });
  it('keeps popups for regular browsers and cross-domain configurations', () => {
    expect(shouldRedirectGoogle({hostname:production.hostname,authDomain:production.hostname,standalone:false})).toBe(false);
    expect(shouldRedirectGoogle({hostname:production.hostname,authDomain:'animetracker-47abf.firebaseapp.com',standalone:true})).toBe(false);
  });
});
