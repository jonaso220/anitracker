import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import './App.css';

// Eager: part of the app shell or the default tab, so always needed on first paint.
import Header from './components/Header';
import NavTabs from './components/NavTabs';
import Toast from './components/Toast';
import UpdateBanner from './components/UpdateBanner';
import ScheduleView from './components/views/ScheduleView';

// Lazy: non-default tabs and modals are only fetched the first time they're
// opened, keeping the initial JS bundle small. (Firebase is already code-split
// inside useFirebase.)
const WatchLaterView = lazy(() => import('./components/views/WatchLaterView'));
const WatchedView = lazy(() => import('./components/views/WatchedView'));
const SeasonSection = lazy(() => import('./components/SeasonSection'));
const TopAnimeSection = lazy(() => import('./components/TopAnimeSection'));
const CustomListsTab = lazy(() => import('./components/CustomListsTab'));
const StatsPanel = lazy(() => import('./components/StatsPanel'));
const SearchModal = lazy(() => import('./components/modals/SearchModal'));
const AnimeDetailModal = lazy(() => import('./components/modals/AnimeDetailModal'));
const DayPickerModal = lazy(() => import('./components/modals/DayPickerModal'));
const MoveDayPickerModal = lazy(() => import('./components/modals/MoveDayPickerModal'));
const ImportModal = lazy(() => import('./components/modals/ImportModal'));
const BulkDayPickerModal = lazy(() => import('./components/modals/BulkDayPickerModal'));
const BackupModal = lazy(() => import('./components/modals/BackupModal'));

import { useFirebase } from './hooks/useFirebase';
import { useAnimeData } from './hooks/useAnimeData';
import { useDragDrop } from './hooks/useDragDrop';
import { usePersistedState } from './hooks/usePersistedState';
import { useToast } from './hooks/useToast';
import { useBulkMode } from './hooks/useBulkMode';
import { useAnimeActions } from './hooks/useAnimeActions';
import { useBulkActions } from './hooks/useBulkActions';
import { useDiscovery } from './hooks/useDiscovery';
import { useServiceWorkerUpdate } from './hooks/useServiceWorkerUpdate';
import { daysOfWeek } from './constants';
import { buildBackup } from './utils';

const EMPTY_SCHEDULE = { 'Lunes': [], 'Martes': [], 'Miércoles': [], 'Jueves': [], 'Viernes': [], 'Sábado': [], 'Domingo': [] };

export default function AnimeTracker() {
  // --- UI state ---
  const [activeTab, setActiveTab] = useState('schedule');
  const [showSearch, setShowSearch] = useState(false);
  const [showAnimeDetail, setShowAnimeDetail] = useState(null);
  const [showDayPicker, setShowDayPicker] = useState(null);
  const [showMoveDayPicker, setShowMoveDayPicker] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showBackup, setShowBackup] = useState(false);
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
  const { user, syncing, syncError, loginWithGoogle, logout, FIREBASE_ENABLED } = useFirebase(
    schedule, watchedList, watchLater, customLists, setSchedule, setWatchedList, setWatchLater, setCustomLists
  );
  const { searchQuery, setSearchQuery, searchResults, setSearchResults, isSearching, searchPartial, airingData, handleSearch } = useAnimeData(schedule);
  const dragDrop = useDragDrop(schedule, setSchedule, daysOfWeek);
  const bulk = useBulkMode();
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
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

  // --- Backup (export / restore) ---
  const exportData = () => {
    const backup = buildBackup({ schedule, watchedList, watchLater, customLists });
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anitracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Copia descargada');
  };

  const restoreBackup = (data) => {
    setSchedule({ ...EMPTY_SCHEDULE, ...data.schedule });
    setWatchedList(data.watchedList);
    setWatchLater(data.watchLater);
    setCustomLists(data.customLists);
    showToast('Datos restaurados');
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
    // ratingDist[i] = number of anime whose userRating rounds to (i + 1), i.e. ratings 1..10
    const ratingDist = Array.from({ length: 10 }, () => 0);
    rated.forEach((a) => {
      const r = Math.round(a.userRating);
      if (r >= 1 && r <= 10) ratingDist[r - 1] += 1;
    });
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
      ratingDist,
      ratedCount: rated.length,
    };
  }, [schedule, watchedList, watchLater]);

  return (
    <div className={`anime-tracker ${darkMode ? 'dark' : 'light'}`}>
      <Header
        darkMode={darkMode} setDarkMode={setDarkMode}
        user={user} syncing={syncing} syncError={syncError} loginWithGoogle={loginWithGoogle} logout={logout} firebaseEnabled={FIREBASE_ENABLED}
        onOpenSearch={() => setShowSearch(true)} onOpenImport={() => setShowImport(true)}
        onOpenBackup={() => setShowBackup(true)}
      />

      <NavTabs
        activeTab={activeTab}
        counts={{ watchLater: watchLater.length, watched: watchedList.length, lists: customLists.length }}
        onChange={handleTabChange}
      />

      <main className="main-content" id="main-content" role="main">
        <Suspense fallback={<div className="route-loading" role="status" aria-live="polite">Cargando…</div>}>
        {activeTab === 'schedule' && (
          <ScheduleView
            schedule={schedule} airingData={airingData} setShowAnimeDetail={setShowAnimeDetail}
            updateEpisode={actions.updateEpisode}
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
            seasonAnime={discovery.seasonAnime} seasonAiring={discovery.seasonAiring} seasonLoading={discovery.seasonLoading}
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
        </Suspense>
      </main>

      <Toast toast={toast} onUndo={undoToast} onDismiss={dismissToast} />
      <UpdateBanner visible={updateAvailable} onUpdate={applyUpdate} />

      <Suspense fallback={null}>
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
          airingData={{ ...discovery.seasonAiring, ...airingData }}
          updateEpisode={actions.updateEpisode} updateUserRating={actions.updateUserRating}
          updateAnimeLink={actions.updateAnimeLink} updateAnimeNotes={actions.updateAnimeNotes}
          mergeAnimeExtras={actions.mergeAnimeExtras}
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

      {showBackup && (
        <BackupModal
          onClose={() => setShowBackup(false)}
          onExport={exportData}
          onRestore={restoreBackup}
        />
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
      </Suspense>
    </div>
  );
}
