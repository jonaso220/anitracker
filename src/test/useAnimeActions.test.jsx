
import { it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState, useRef, useEffect } from 'react';
import { useAnimeActions } from '../hooks/useAnimeActions';
const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const anime={id:1,title:'Example',currentEp:2,userRating:5};
function useHarness() {
 const [schedule,setSchedule]=useState(Object.fromEntries(days.map(d=>[d,d==='Lunes'?[anime]:[]])));
 const [watchedList,setWatchedList]=useState([{...anime,finished:false}]);
 const [watchLater,setWatchLater]=useState([anime]);
 const [customLists,setCustomLists]=useState([{id:'l1',items:[anime]}]);
 const [dayPicker,setShowDayPicker]=useState(null);
 const scheduleRef=useRef(schedule);
 useEffect(()=>{ scheduleRef.current=schedule; },[schedule]);
 const watchedListRef=useRef(watchedList);
 useEffect(()=>{ watchedListRef.current=watchedList; },[watchedList]);
 const watchLaterRef=useRef(watchLater);
 useEffect(()=>{ watchLaterRef.current=watchLater; },[watchLater]);
 const customListsRef=useRef(customLists);
 useEffect(()=>{ customListsRef.current=customLists; },[customLists]);
 const actions=useAnimeActions({setSchedule,scheduleRef,setWatchedList,watchedListRef,setWatchLater,watchLaterRef,setCustomLists,customListsRef,setShowDayPicker,showToast:()=>{},setShowSearch:()=>{},setSearchQuery:()=>{},setSearchResults:()=>{}});
 return {schedule,watchedList,watchLater,customLists,dayPicker,setShowDayPicker,...actions};
}
it('canceling Retomar retains anime in history',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.resumeAnime(anime));
 act(()=>result.current.setShowDayPicker(null));
 expect(result.current.watchedList).toHaveLength(1);
});
it('moving from watch later closes day picker',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.setShowDayPicker(anime));
 act(()=>result.current.moveFromWatchLaterToSchedule(anime,'Martes'));
 expect(result.current.dayPicker).toBeNull();
});
it('episode change updates copy in custom list',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.updateEpisode(1,1));
 expect(result.current.customLists[0].items[0].currentEp).toBe(3);
});
it('finishing from already open detail retains latest episode count',()=>{
 const {result}=renderHook(useHarness);
 const openDetailAnime={...anime,_day:'Lunes'};
 act(()=>result.current.updateEpisode(1,1));
 act(()=>result.current.markAsFinished(openDetailAnime,'Lunes'));
 expect(result.current.watchedList[0].currentEp).toBe(3);
});

it('Retomar moves history only after choosing a day and removes dropped flags',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.resumeAnime({...anime,finished:false,droppedDate:'2026-01-01'}));
 expect(result.current.watchedList).toHaveLength(1);
 act(()=>result.current.addToSchedule(result.current.dayPicker,'Martes'));
 expect(result.current.watchedList).toHaveLength(0);
 expect(result.current.schedule.Martes[0]).not.toHaveProperty('finished');
 expect(result.current.schedule.Martes[0]).not.toHaveProperty('droppedDate');
 expect(result.current.dayPicker).toBeNull();
});
it('moving an anime preserves edits made after opening its detail',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.updateUserRating(1,9));
 act(()=>result.current.moveAnimeToDay({...anime,_day:'Lunes'},'Lunes','Martes'));
 expect(result.current.schedule.Martes[0].userRating).toBe(9);
 expect(result.current.schedule.Martes[0]).not.toHaveProperty('_day');
});
it('custom list actions cannot crash the schedule with an undefined day',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.markAsFinished({...anime,_isCustomList:true},undefined));
 act(()=>result.current.dropAnime({...anime,_isCustomList:true},undefined));
 act(()=>result.current.moveAnimeToDay(anime,undefined,'Martes'));
 expect(result.current.schedule.Lunes).toHaveLength(1);
});
it('rating and link changes are saved in custom lists',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.updateUserRating(1,9));
 act(()=>result.current.updateAnimeLink(1,'https://example.com/series'));
 expect(result.current.customLists[0].items[0]).toMatchObject({userRating:9,watchLink:'https://example.com/series'});
});
it('preserves a newly pasted URL when scheduling an existing anime from search',()=>{
 const {result}=renderHook(useHarness);
 const watchLink='https://www.crunchyroll.com/series/example?source=share';
 act(()=>result.current.addToSchedule({...anime,watchLink},'Martes'));
 expect(result.current.schedule.Martes[0].watchLink).toBe(watchLink);
});
it('adding to a custom list uses edits made after opening the detail',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.updateEpisode(1,1));
 act(()=>result.current.addToCustomList('l1',anime));
 expect(result.current.customLists[0].items[0].currentEp).toBe(3);
});
