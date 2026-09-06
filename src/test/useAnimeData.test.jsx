
import { it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimeData } from '../hooks/useAnimeData';
const h=vi.hoisted(()=>({resolve:null}));
vi.mock('../services/searchAnime',()=>({searchAnime:vi.fn(()=>new Promise(resolve=>{h.resolve=resolve;}))}));
it('clearing input prevents old request from restoring results',async()=>{
 const schedule={};
 const {result}=renderHook(()=>useAnimeData(schedule));
 let pending;
 act(()=>{pending=result.current.performSearch('naruto');});
 await act(async()=>result.current.performSearch(''));
 await act(async()=>{h.resolve({results:[{id:1,title:'Naruto'}],failedApis:[]}); await pending;});
 expect(result.current.searchResults).toEqual([]);
});

it('closing the search modal invalidates its pending request',async()=>{
 const schedule={};
 const {result}=renderHook(()=>useAnimeData(schedule));
 let pending;
 act(()=>{pending=result.current.performSearch('naruto');});
 act(()=>result.current.setSearchQuery(''));
 await act(async()=>{h.resolve({results:[{id:1}],failedApis:[]}); await pending;});
 expect(result.current.searchResults).toEqual([]);
 expect(result.current.isSearching).toBe(false);
});
it('editing the query invalidates a response during the debounce delay',async()=>{
 vi.useFakeTimers();
 try {
   const schedule={};
   const {result,unmount}=renderHook(()=>useAnimeData(schedule));
   let pending;
   act(()=>{pending=result.current.performSearch('naruto');});
   act(()=>result.current.handleSearch('bleach'));
   await act(async()=>{h.resolve({results:[{id:1}],failedApis:[]}); await pending;});
   expect(result.current.searchResults).toEqual([]);
   unmount();
 } finally { vi.useRealTimers(); }
});
