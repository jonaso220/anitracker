import { useEffect, useMemo, useState } from 'react';
import './App.css';

import Header from './components/Header';
import NavTabs from './components/NavTabs';
import Toast from './components/Toast';
import ScheduleView from './components/views/ScheduleView';
import WatchLaterView from './components/views/WatchLaterView';
import WatchedView from './components/views/WatchedView';
import SeasonSection from './components/SeasonSection';
import TopAnimeSection from './components/TopAnimeSection';
import CustomListsTab from './components/CustomListsTab';
import StatsPanel from './components/StatsPanel';
import SearchModal from './components/modals/SearchModal';
import AnimeDetailModal from './components/modals/AnimeDetailModal';
import DayPickerModal from './components/modals/DayPickerModal';
import MoveDayPickerModal from './components/modals/MoveDayPickerModal';
import ImportModal from './components/modals/ImportModal';
import BulkDayPickerModal from './components/modals/BulkDayPickerModal';

import { useFirebase } from './hooks/useFirebase';
import { useAnimeData } from './hooks/useAnimeData';
import { useDragDrop } from './hooks/useDragDrop';
import { useNotifications } from './hooks/useNotifications';
import { usePersistedState } from './hooks/usePersistedState';
import { useToast } from './hooks/useToast';
import { useBulkMode } from './hooks/useBulkMode';
import { useAnimeActions } from './hooks/useAnimeActions';
import { useBulkActions } from './hooks/useBulkActions';
import { useDiscovery } from './hooks/useDiscovery';
import { daysOfWeek } from './constants';

const EMPTY_SCHEDULE = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };

export default function AnimeTracker() {
  // --- UI state ---
  const [activeTab, setActiveTab] = useState('schedule');
  const [showSearch, setShowSearch] = useState(false);
  const [showAnimeDetail, setShowAnimeDetail] = useState(null);
  const [showDayPicker, setShowDayPicker] = useState(null);
  const [showMoveDayPicker, setShowMoveDayPicker] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showBulkDayPicker, setShowBulkDayPicker] = useState(false);
  const [watchedFilter, setWatchedFilter] = useState('all');
  const [watchedSort, setWatchedSort] = useState('date');
  const [localSearch, setLocalSearch] = useState('');

  // --- Persisted state ---
  // Migrate legacy string theme key ('dark'/'light') to the new boolean-based JSON format.
  const [darkMode, setDarkMode] = usePersistedState('anitracker-theme-v2', () => {
    try {
      const legacy = localStorage.getItem('anitracker-theme');
      if (legacy === 'light') return false;
      if (legacy === 'dark') return true;
    } catch { /* empty */ }
    return true;
  });
  const [schedule, setSchedule, scheduleRef] = usePersistedState('animeSchedule', () => ({ ...EMPTY_SCHEDULE }));
  const [watchedList, setWatchedList, watchedListRef] = usePersistedState('watchedAnimes', []);
  const [watchLater, setWatchLater, watchLaterRef] = usePersistedState('watchLater', []);
  const [customLists, setCustomLists, customListsRef] = usePersistedState('anitracker-custom-lists', []);

  // --- Hooks ---
  const { toast, showToast, dismissToast, undoToast } = useToast();
  const { user, syncing, loginWithGoogle, logout, FIREBASE_ENABLED } = useFirebase(
    schedule, watchedList, watchLater, setSchedule, setWatchedList, setWatchLater
  );
  const { searchQuery, setSearchQuery, searchResults, setSearchResults, isSearching, searchPartial, airingData, handleSearch } = useAnimeData(schedule);
  const dragDrop = useDragDrop(schedule, setSchedule, daysOfWeek);
  const { notifEnabled, notifPermission, toggleNotifications } = useNotifications(airingData);
  const bulk = useBulkMode();
  const discovery = useDiscovery();

  const actions = useAnimeActions({
    schedule, setSchedule, scheduleRef,
    watchedList, setWatchedList, watchedListRef,
    watchLater, setWatchLater, watchLaterRef,
    setCustomLists, customListsRef,
    showToast,
    setShowDayPicker, setShowSearch, setSearchQuery, setSearchResults,
  });

  const bulkActions = useBulkActions({
    activeTab,
    schedule, setSchedule,
    watchedList, setWatchedList,
    watchLater, setWatchLater,
    bulkSelected: bulk.bulkSelected,
    exitBulkMode: bulk.exitBulkMode,
    showToast,
  });

  // Reset localSearch + bulk mode when switching tabs
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setLocalSearch('');
    bulk.exitBulkMode();
    if (tab === 'season') discovery.loadSeasonCurrent();
    if (tab === 'top') discovery.loadTop();
  };

  // Apply dark/light class to the body for CSS custom properties
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  // --- Stats ---
  const stats = useMemo(() => {
    const allSchedule = daysOfWeek.flatMap((d) => schedule[d] || []);
    const allAnime = [...allSchedule, ...watchedList, ...watchLater];
    const genreCount = {};
    allAnime.forEach((a) => (a.genres || []).forEach((g) => { genreCount[g] = (genreCount[g] || 0) + 1; }));
    const rated = allAnime.filter((a) => a.userRating > 0);
    return {
      totalSchedule: allSchedule.length,
      totalWatched: watchedList.length,
      totalWatchLater: watchLater.length,
      finished: watchedList.filter((a) => a.finished).length,
      dropped: watchedList.filter((a) => !a.finished).length,
      totalEps: allAnime.reduce((sum, a) => sum + (a.currentEp || 0), 0),
      avgRating: rated.length > 0 ? (rated.reduce((s, a) => s + a.userRating, 0) / rated.length).toFixed(1) : '—',
      topGenres: Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 8),
      allTotal: allAnime.length,
    };
  }, [schedule, watchedList, watchLater]);

  return (
    <div className={`anime-tracker ${darkMode ? 'dark' : 'light'}`}>
      <Header
        darkMode={darkMode} setDarkMode={setDarkMode}
        notifEnabled={notifEnabled} notifPermission={notifPermission} toggleNotifications={toggleNotifications}
        user={user} syncing={syncing} loginWithGoogle={loginWithGoogle} logout={logout} firebaseEnabled={FIREBASE_ENABLED}
        onOpenSearch={() => setShowSearch(true)} onOpenImport={() => setShowImport(true)}
      />

      <NavTabs
        activeTab={activeTab}
        counts={{ watchLater: watchLater.length, watched: watchedList.length, lists: customLists.length }}
        onChange={handleTabChange}
      />

      <main className="main-content" id="main-content" role="main">
        {activeTab === 'schedule' && (
          <ScheduleView
            schedule={schedule} airingData={airingData} setShowAnimeDetail={setShowAnimeDetail}
            {...dragDrop}
          />
        )}

        {activeTab === 'watchLater' && (
          <WatchLaterView
            watchLater={watchLater} airingData={airingData}
            localSearch={localSearch} setLocalSearch={setLocalSearch}
            bulkMode={bulk.bulkMode} bulkSelected={bulk.bulkSelected}
            enterBulkMode={bulk.enterBulkMode} exitBulkMode={bulk.exitBulkMode}
            toggleBulkSelect={bulk.toggleBulkSelect}
            bulkSelectAll={bulk.bulkSelectAll} bulkDeselectAll={bulk.bulkDeselectAll}
            onOpenBulkDayPicker={() => setShowBulkDayPicker(true)}
            onBulkMarkWatched={bulkActions.bulkMarkWatched}
            onBulkDelete={bulkActions.bulkDelete}
            setShowAnimeDetail={setShowAnimeDetail}
          />
        )}

        {activeTab === 'watched' && (
          <WatchedView
            watchedList={watchedList} airingData={airingData}
            localSearch={localSearch} setLocalSearch={setLocalSearch}
            watchedFilter={watchedFilter} setWatchedFilter={setWatchedFilter}
            watchedSort={watchedSort} setWatchedSort={setWatchedSort}
            bulkMode={bulk.bulkMode} bulkSelected={bulk.bulkSelected}
            enterBulkMode={bulk.enterBulkMode} exitBulkMode={bulk.exitBulkMode}
            toggleBulkSelect={bulk.toggleBulkSelect}
            bulkSelectAll={bulk.bulkSelectAll} bulkDeselectAll={bulk.bulkDeselectAll}
            onBulkDelete={bulkActions.bulkDelete}
            setShowAnimeDetail={setShowAnimeDetail}
          />
        )}

        {activeTab === 'lists' && (
          <CustomListsTab
            customLists={customLists}
            onCreateList={actions.createCustomList}
            onDeleteList={actions.deleteCustomList}
            onRenameList={actions.renameCustomList}
            onRemoveFromList={actions.removeFromCustomList}
            airingData={airingData}
            onDetail={(a) => setShowAnimeDetail(a)}
          />
        )}

        {activeTab === 'season' && (
          <SeasonSection
            seasonAnime={discovery.seasonAnime} seasonLoading={discovery.seasonLoading}
            schedule={schedule} watchedList={watchedList} watchLater={watchLater}
            selectedSeason={discovery.selectedSeason} onChangeSeason={discovery.changeSeason}
            setShowDayPicker={setShowDayPicker}
            addToWatchLater={actions.addToWatchLater}
            markAsWatched={actions.markAsWatched}
            onDetail={(a) => setShowAnimeDetail({ ...a, _isWatchLater: false, _isWatched: false, _isSeason: true })}
          />
        )}

        {activeTab === 'top' && (
          <TopAnimeSection
            topAnime={discovery.topAnime} topLoading={discovery.topLoading}
            schedule={schedule} watchedList={watchedList} watchLater={watchLater}
            setShowDayPicker={setShowDayPicker}
            addToWatchLater={actions.addToWatchLater}
            markAsWatched={actions.markAsWatched}
            onDetail={(a) => setShowAnimeDetail({ ...a, _isWatchLater: false, _isWatched: false, _isSeason: false, _isTop: true })}
          />
        )}

        {activeTab === 'stats' && <StatsPanel stats={stats} />}
      </main>

      <Toast toast={toast} onUndo={undoToast} onDismiss={dismissToast} />

      {showSearch && (
        <SearchModal
          setShowSearch={setShowSearch}
          searchQuery={searchQuery} handleSearch={handleSearch}
          searchResults={searchResults} isSearching={isSearching} searchPartial={searchPartial}
          setSearchResults={setSearchResults} setSearchQuery={setSearchQuery}
          setShowDayPicker={setShowDayPicker}
          addToWatchLater={actions.addToWatchLater}
          markAsWatchedFromSearch={actions.markAsWatchedFromSearch}
        />
      )}

      {showAnimeDetail && (
        <AnimeDetailModal
          key={showAnimeDetail.id} showAnimeDetail={showAnimeDetail} setShowAnimeDetail={setShowAnimeDetail}
          airingData={airingData}
          updateEpisode={actions.updateEpisode} updateUserRating={actions.updateUserRating}
          updateAnimeLink={actions.updateAnimeLink} updateAnimeNotes={actions.updateAnimeNotes}
          markAsFinished={actions.markAsFinished} dropAnime={actions.dropAnime} deleteAnime={actions.deleteAnime}
          addToWatchLater={actions.addToWatchLater} markAsWatched={actions.markAsWatched}
          setShowMoveDayPicker={setShowMoveDayPicker} setShowDayPicker={setShowDayPicker}
          resumeAnime={actions.resumeAnime}
          customLists={customLists}
          addToCustomList={actions.addToCustomList} removeFromCustomList={actions.removeFromCustomList}
        />
      )}

      {showDayPicker && (
        <DayPickerModal
          showDayPicker={showDayPicker} setShowDayPicker={setShowDayPicker}
          watchLater={watchLater}
          addToSchedule={actions.addToSchedule}
          moveFromWatchLaterToSchedule={actions.moveFromWatchLaterToSchedule}
        />
      )}

      {showMoveDayPicker && (
        <MoveDayPickerModal
          showMoveDayPicker={showMoveDayPicker}
          setShowMoveDayPicker={setShowMoveDayPicker}
          moveAnimeToDay={(anime, fromDay, toDay) => {
            actions.moveAnimeToDay(anime, fromDay, toDay);
            setShowMoveDayPicker(null);
          }}
        />
      )}

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImport={actions.handleImport} />
      )}

      {showBulkDayPicker && (
        <BulkDayPickerModal
          count={bulk.bulkSelected.size}
          onPickDay={(day) => {
            bulkActions.bulkMoveToSchedule(day);
            setShowBulkDayPicker(false);
          }}
          onClose={() => setShowBulkDayPicker(false)}
        />
      )}
    </div>
  );
}
