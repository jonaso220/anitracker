import React, {useState,useRef,useEffect} from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,renderHook,screen,fireEvent,act,cleanup} from '@testing-library/react';
import {useAnimeActions} from '../hooks/useAnimeActions.js';
import {useDragDrop} from '../hooks/useDragDrop.js';
import AnimeDetailModal from '../components/modals/AnimeDetailModal.jsx';
vi.mock('../services/anilistService.js',()=>({fetchAnilistRelations:vi.fn(async()=>[])}));
const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const a={id:900001,title:'QA Anime',episodes:12,currentEp:11,userRating:2,genres:[],watchLink:'https://example.com/old',synopsis:'Una historia de aventuras y amistad en la ciudad.'};
const b={...a,id:900002,title:'QA Serie',currentEp:2};
const blank=()=>Object.fromEntries(days.map(d=>[d,[]]));
function useHarness(initial=[a,b]) {
 const [schedule,setSchedule]=useState({...blank(),Lunes:initial});
 const [watchedList,setWatchedList]=useState([]);
 const [watchLater,setWatchLater]=useState([]);
 const [customLists,setCustomLists]=useState([{id:'qa',name:'Favoritos',emoji:'⭐',items:[]}]);
 const undo=useRef(null);
 const useValueRef=v=>{const r=useRef(v);useEffect(()=>{r.current=v;},[v]);return r;};
 const actions=useAnimeActions({setSchedule,scheduleRef:useValueRef(schedule),setWatchedList,watchedListRef:useValueRef(watchedList),setWatchLater,watchLaterRef:useValueRef(watchLater),setCustomLists,customListsRef:useValueRef(customLists),showToast:(_,fn)=>{undo.current=fn;},setShowDayPicker:()=>{},setShowSearch:()=>{},setSearchQuery:()=>{},setSearchResults:()=>{}});
 return {...actions,schedule,setSchedule,watchedList,watchLater,customLists,undo};
}
const modalProps=()=>({showAnimeDetail:{...a,_day:'Lunes'},setShowAnimeDetail:vi.fn(),airingData:{},updateEpisode:vi.fn(),updateUserRating:vi.fn(),updateAnimeLink:vi.fn(),markAsFinished:vi.fn(),dropAnime:vi.fn(),deleteAnime:vi.fn(),setShowMoveDayPicker:vi.fn()});
afterEach(async()=>{await act(async()=>{});cleanup();vi.useRealTimers();vi.restoreAllMocks();});
it('decrement stops at zero and unknown totals can advance',()=>{
 const {result}=renderHook(()=>useHarness([{...a,currentEp:0,episodes:0}]));
 act(()=>result.current.updateEpisode(a.id,-1)); expect(result.current.schedule.Lunes[0].currentEp).toBe(0);
 act(()=>result.current.updateEpisode(a.id,5)); expect(result.current.schedule.Lunes[0].currentEp).toBe(5);
});
it('known total should cap +5 at 12 rather than persist 16',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.updateEpisode(a.id,5));
 expect(result.current.schedule.Lunes[0].currentEp).toBe(12);
});
it.each(['markAsFinished','dropAnime','deleteAnime'])('undo %s must preserve later progress on another card',(action)=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current[action]({...a,_day:'Lunes'},'Lunes'));
 act(()=>result.current.updateEpisode(b.id,1));
 act(()=>result.current.undo.current());
 expect(result.current.schedule.Lunes.find(x=>x.id===b.id).currentEp).toBe(3);
});
it.each(['markAsFinished','dropAnime'])('%s retains latest episode, rating and link',(action)=>{
 const {result}=renderHook(useHarness);
 act(()=>{result.current.updateEpisode(a.id,1);result.current.updateUserRating(a.id,4);result.current.updateAnimeLink(a.id,'https://example.com/new');});
 act(()=>result.current[action]({...a,_day:'Lunes'},'Lunes'));
 expect(result.current.schedule.Lunes).toEqual([b]);
 expect(result.current.watchedList[0]).toMatchObject({currentEp:12,userRating:4,watchLink:'https://example.com/new',finished:action==='markAsFinished'});
 act(()=>result.current.undo.current());expect(result.current.schedule.Lunes[0].currentEp).toBe(12);expect(result.current.watchedList).toHaveLength(0);
});
it('moving retains edits and does not duplicate destination card',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.updateUserRating(a.id,5));
 act(()=>result.current.moveAnimeToDay(a,'Lunes','Martes'));
 expect(result.current.schedule.Lunes).toEqual([b]);expect(result.current.schedule.Martes[0].userRating).toBe(5);
});
it('list toggle preserves current edits and never removes schedule card',()=>{
 const {result}=renderHook(useHarness);
 act(()=>result.current.updateEpisode(a.id,1));
 act(()=>result.current.addToCustomList('qa',a));
 expect(result.current.customLists[0].items[0].currentEp).toBe(12);
 act(()=>result.current.removeFromCustomList('qa',a.id));
 expect(result.current.customLists[0].items).toHaveLength(0);expect(result.current.schedule.Lunes).toHaveLength(2);
});
it('Maraton timer should start on activation, not opening detail',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
 render(<AnimeDetailModal {...modalProps()}/>);
 act(()=>vi.advanceTimersByTime(600000));
 fireEvent.click(screen.getByRole('button',{name:'🔥 Maratón'}));
 fireEvent.click(screen.getByRole('button',{name:'+1 ep',exact:true}));
 expect(screen.getByText(/min$/).textContent).toBe('⏱ 0 min');
});
it('Maraton session count should include normal + and - controls',()=>{
 render(<AnimeDetailModal {...modalProps()} showAnimeDetail={{...a,_day:'Lunes',currentEp:2}}/>);
 fireEvent.click(screen.getByRole('button',{name:'🔥 Maratón'}));
 fireEvent.click(screen.getByRole('button',{name:'+1 ep',exact:true}));
 fireEvent.click(screen.getByRole('button',{name:'+',exact:true}));
 expect(screen.getByText(/esta sesión/).textContent).toContain('2 eps');
 fireEvent.click(screen.getByRole('button',{name:'−',exact:true}));
 expect(screen.getByText(/esta sesión/).textContent).toContain('1 ep');
});
it('reject invalid manual URL instead of persisting an unusable link',()=>{
 const p=modalProps();render(<AnimeDetailModal {...p}/>);
 fireEvent.click(screen.getByRole('button',{name:'✏️ Editar'}));
 fireEvent.change(screen.getByPlaceholderText('Pegá una URL...'),{target:{value:'not a link'}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar'}));
 expect(p.updateAnimeLink).not.toHaveBeenCalled();
});
it('rating toggles on/off and valid URL is passed unchanged',()=>{
 const p=modalProps();const {container}=render(<AnimeDetailModal {...p}/>);
 fireEvent.click(container.querySelectorAll('.star')[3]);expect(p.updateUserRating).toHaveBeenLastCalledWith(a.id,4);
 fireEvent.click(container.querySelectorAll('.star')[3]);expect(p.updateUserRating).toHaveBeenLastCalledWith(a.id,0);
 fireEvent.click(screen.getByRole('button',{name:'✏️ Editar'}));
 fireEvent.change(screen.getByPlaceholderText('Pegá una URL...'),{target:{value:'https://example.com/series?share=1'}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar'}));
 expect(p.updateAnimeLink).toHaveBeenLastCalledWith(a.id,'https://example.com/series?share=1');
});
it('repeated touch drag must not inherit previous destination',()=>{
 vi.useFakeTimers();
 const {result}=renderHook(()=>{const [s,ss]=useState({...blank(),Lunes:[a,b]});return {s,...useDragDrop(s,ss,days)};});
 const start={touches:[{clientX:50,clientY:50}]};
 act(()=>result.current.handleTouchStart(start,a,'Lunes'));
 act(()=>vi.advanceTimersByTime(401));
 const row=document.createElement('section');row.className='day-row';row.innerHTML='<span class="day-name">Martes</span>';
 Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>row});
 act(()=>result.current.handleTouchMove({touches:[{clientX:80,clientY:150}],preventDefault:()=>{}}));
 act(()=>result.current.handleTouchEnd());
 act(()=>vi.advanceTimersByTime(1));
 act(()=>result.current.handleTouchStart(start,b,'Lunes'));
 act(()=>vi.advanceTimersByTime(401));
 act(()=>result.current.handleTouchEnd());
 expect(result.current.s.Lunes.map(x=>x.id)).toContain(b.id);
});
it('moving first card immediately after second must not move it after third',()=>{
 vi.useFakeTimers();
 const c={...b,id:900003};
 const {result}=renderHook(()=>{const [s,ss]=useState({...blank(),Lunes:[a,b,c]});return {s,...useDragDrop(s,ss,days)};});
 act(()=>result.current.handleDragStart({dataTransfer:{setData:()=>{}}},a,'Lunes'));
 act(()=>result.current.handleDragOverCard({preventDefault:()=>{},stopPropagation:()=>{},dataTransfer:{},clientX:190,currentTarget:{getBoundingClientRect:()=>({left:100,width:100})}},'Lunes',1));
 act(()=>result.current.handleDrop({preventDefault:()=>{}},'Lunes'));
 expect(result.current.s.Lunes.map(x=>x.id)).toEqual([b.id,a.id,c.id]);
});

it('undo preserves new cards and the moved position of another card', () => {
 const {result}=renderHook(useHarness);
 act(()=>result.current.deleteAnime({...a,_day:'Lunes'}));
 act(()=>result.current.moveAnimeToDay(b,'Lunes','Martes'));
 act(()=>result.current.addToSchedule({...b,id:900003,title:'New card'},'Lunes'));
 act(()=>result.current.undo.current());
 expect(result.current.schedule.Martes).toEqual([b]);
 expect(result.current.schedule.Lunes.map(x=>x.id)).toEqual([a.id,900003]);
});
it('undo removing a list item preserves later changes in that list', () => {
 const {result}=renderHook(useHarness);
 act(()=>result.current.addToCustomList('qa',a));
 act(()=>result.current.removeFromCustomList('qa',a.id));
 act(()=>result.current.addToCustomList('qa',b));
 act(()=>result.current.undo.current());
 expect(result.current.customLists[0].items.map(x=>x.id)).toEqual([a.id,b.id]);
});
it('Maraton caps a batch, counts only applied episodes, and allows correction', () => {
 const p=modalProps();render(<AnimeDetailModal {...p}/>);
 fireEvent.click(screen.getByRole('button',{name:'🔥 Maratón'}));
 fireEvent.click(screen.getByRole('button',{name:'+5 eps'}));
 expect(screen.getByText('12',{selector:'.ep-number'})).toBeInTheDocument();
 expect(screen.getByText(/esta sesión/)).toHaveTextContent('1 ep esta sesión');
 expect(screen.getByRole('button',{name:'+',exact:true})).toBeDisabled();
 expect(screen.getByRole('button',{name:'+5 eps'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'−',exact:true}));
 expect(screen.getByRole('button',{name:'+',exact:true})).toBeEnabled();
 expect(screen.getByText(/esta sesión/)).toHaveTextContent('0 eps esta sesión');
});
it('Maraton pauses its clock while disabled and resumes accumulated active time', () => {
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-06T12:00:00Z'));
 render(<AnimeDetailModal {...modalProps()}/>);
 const toggle=screen.getByRole('button',{name:'🔥 Maratón'});
 fireEvent.click(toggle);
 act(()=>vi.advanceTimersByTime(120000));
 fireEvent.click(toggle);
 act(()=>vi.advanceTimersByTime(600000));
 fireEvent.click(toggle);
 expect(screen.getByText(/min$/)).toHaveTextContent('⏱ 2 min');
 act(()=>vi.advanceTimersByTime(60000));
 expect(screen.getByText(/min$/)).toHaveTextContent('⏱ 3 min');
});
it('invalid links show an error, keep editing, and can be corrected', () => {
 const p=modalProps();render(<AnimeDetailModal {...p}/>);
 fireEvent.click(screen.getByRole('button',{name:'✏️ Editar'}));
 const input=screen.getByRole('textbox',{name:'Enlace para ver'});
 fireEvent.change(input,{target:{value:'javascript:alert(1)'}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar'}));
 expect(screen.getByRole('alert')).toHaveTextContent('enlace válido');
 expect(p.updateAnimeLink).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:'  https://example.com/show?share=1  '}});
 fireEvent.keyDown(input,{key:'Enter'});
 expect(p.updateAnimeLink).toHaveBeenCalledWith(a.id,'https://example.com/show?share=1');
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('cancelling a touch drag removes its ghost without moving the card', () => {
 vi.useFakeTimers();
 const {result,unmount}=renderHook(()=>{const [s,ss]=useState({...blank(),Lunes:[a]});return {s,...useDragDrop(s,ss,days)};});
 act(()=>result.current.handleTouchStart({touches:[{clientX:50,clientY:50}]},a,'Lunes'));
 act(()=>vi.advanceTimersByTime(401));
 expect(document.querySelector('.touch-drag-ghost')).not.toBeNull();
 act(()=>result.current.handleTouchCancel());
 expect(document.querySelector('.touch-drag-ghost')).toBeNull();
 expect(result.current.s.Lunes).toEqual([a]);
 unmount();
 act(()=>vi.runOnlyPendingTimers());
 expect(document.querySelector('.touch-drag-ghost')).toBeNull();
});
