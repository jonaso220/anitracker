// @vitest-environment node
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { it, expect, vi } from 'vitest';

it('places the Firebase auth proxy before the SPA fallback', () => {
  const redirects=readFileSync(new URL('../../public/_redirects', import.meta.url),'utf8').trim().split('\n');
  expect(redirects[0].trim().split(/\s+/)).toEqual(['/__/auth/*','https://animetracker-47abf.firebaseapp.com/__/auth/:splat','200']);
});
it('never intercepts OAuth helper scripts, iframes, or callbacks in the service worker', () => {
  const handlers={};
  const origin='https://anitracker-jona.netlify.app';
  vm.runInNewContext(readFileSync(new URL('../../public/sw.js',import.meta.url),'utf8'),{
    URL, self:{location:{origin},addEventListener:(name,fn)=>{handlers[name]=fn;}},
  });
  for(const path of ['/__/auth/handler?state=test','/__/auth/handler.js','/__/auth/iframe','/__/auth/experiments.js']) {
    const respondWith=vi.fn();
    handlers.fetch({request:{method:'GET',url:origin+path,mode:'navigate'},respondWith});
    expect(respondWith).not.toHaveBeenCalled();
  }
});
