import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  MapPin, 
  Star, 
  Calendar, 
  Trash2, 
  Download, 
  Filter, 
  Grid, 
  Map as MapIcon, 
  Sparkles, 
  Bot, 
  AlertTriangle,
  X,
  Compass,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { SafeMapBoundary } from './SafeMapBoundary';
import { useAuth } from '../context/AuthContext';
import { 
  type JournalEntry, 
  type MoodType, 
  MOOD_CONFIGS 
} from '../types/entry';
import { 
  saveJournalEntry, 
  deleteJournalEntry, 
  subscribeToUserEntries 
} from '../lib/entriesApi';
import { downloadEntryAsMarkdown } from '../lib/exportMarkdown';
import { fetchMapsConfig } from '../lib/mapsApi';

interface HistoryArchiveProps {
  onOpenEntry: (entry: JournalEntry) => void;
  initialFilterTag?: string | null;
  onClearInitialTag?: () => void;
}

export const HistoryArchive: React.FC<HistoryArchiveProps> = ({
  onOpenEntry,
  initialFilterTag,
  onClearInitialTag
}) => {
  const { user, idToken } = useAuth();

  // Entries state
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMood, setSelectedMood] = useState<MoodType | 'All'>('All');
  const [selectedTag, setSelectedTag] = useState<string | null>(initialFilterTag || null);
  const [starredOnly, setStarredOnly] = useState<boolean>(false);
  const [withLocationOnly, setWithLocationOnly] = useState<boolean>(false);

  // View state: 'grid' or 'map'
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  // Deletion safety modal
  const [entryToDelete, setEntryToDelete] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Map preview drawer modal
  const [selectedMapEntry, setSelectedMapEntry] = useState<JournalEntry | null>(null);

  // Google Maps configuration
  const [mapsConfig, setMapsConfig] = useState<{ hasClientKey: boolean; clientKey: string }>({
    hasClientKey: false,
    clientKey: '',
  });

  // Sync initial tag from props if changed
  useEffect(() => {
    if (initialFilterTag) {
      setSelectedTag(initialFilterTag);
    }
  }, [initialFilterTag]);

  // Load maps config
  useEffect(() => {
    fetchMapsConfig().then(cfg => setMapsConfig(cfg));
  }, []);

  // Real-time Firestore snapshot subscription
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsubscribe = subscribeToUserEntries(user.uid, idToken, (updatedEntries) => {
      setEntries(updatedEntries);
      setLoading(false);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, idToken]);

  // Extract all unique tags across entries
  const allAvailableTags = useMemo(() => {
    const tagSet = new Set<string>();
    entries.forEach(e => {
      e.tags?.forEach(t => {
        if (t) tagSet.add(t);
      });
    });
    return Array.from(tagSet).sort();
  }, [entries]);

  // Global search and multi-filter logic
  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return entries.filter(entry => {
      // 1. Text Search across title, body, tags, location, and agent messages
      if (q) {
        const matchesTitle = (entry.title || '').toLowerCase().includes(q);
        const matchesBody = (entry.content || '').toLowerCase().includes(q);
        const matchesTags = (entry.tags || []).some(t => t.toLowerCase().includes(q));
        const matchesLocation = entry.location && (
          (entry.location.name || '').toLowerCase().includes(q) ||
          (entry.location.address || '').toLowerCase().includes(q)
        );
        const matchesDialogue = (entry.dialogueHistory || []).some(d => 
          (d.content || '').toLowerCase().includes(q)
        );
        const matchesSynthesis = entry.synthesis && (
          (entry.synthesis.summary || '').toLowerCase().includes(q) ||
          (entry.synthesis.takeaways || []).some(t => t.toLowerCase().includes(q))
        );

        if (!matchesTitle && !matchesBody && !matchesTags && !matchesLocation && !matchesDialogue && !matchesSynthesis) {
          return false;
        }
      }

      // 2. Mood Filter
      if (selectedMood !== 'All' && entry.mood !== selectedMood) {
        return false;
      }

      // 3. Tag Filter
      if (selectedTag && !(entry.tags || []).includes(selectedTag)) {
        return false;
      }

      // 4. Starred Favorites Filter
      if (starredOnly && !entry.isFavorite) {
        return false;
      }

      // 5. With Location Filter
      if (withLocationOnly && (!entry.location || entry.location.lat == null)) {
        return false;
      }

      return true;
    });
  }, [entries, searchQuery, selectedMood, selectedTag, starredOnly, withLocationOnly]);

interface GeotaggedEntry extends JournalEntry {
  location: NonNullable<JournalEntry['location']> & { lat: number; lng: number };
}

  // Location-tagged entries for Map Atlas
  const geotaggedEntries = useMemo(() => {
    return filteredEntries.filter(
      (e): e is GeotaggedEntry =>
        e.location != null &&
        typeof e.location.lat === 'number' &&
        typeof e.location.lng === 'number'
    );
  }, [filteredEntries]);

  // Toggle favorite on an entry
  const handleToggleFavorite = async (entry: JournalEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;

    const updated: JournalEntry = {
      ...entry,
      isFavorite: !entry.isFavorite,
      updatedAt: new Date().toISOString()
    };

    // Optimistic local update
    setEntries(prev => prev.map(item => item.id === entry.id ? updated : item));
    await saveJournalEntry(updated, idToken, user.uid);
  };

  // Two-step safe deletion
  const handleConfirmDelete = async () => {
    if (!entryToDelete || !user) return;
    setDeleting(true);
    try {
      await deleteJournalEntry(entryToDelete.id, idToken, user.uid);
      setEntries(prev => prev.filter(e => e.id !== entryToDelete.id));
      if (selectedMapEntry?.id === entryToDelete.id) {
        setSelectedMapEntry(null);
      }
      setEntryToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const hasActiveFilters = searchQuery || selectedMood !== 'All' || selectedTag || starredOnly || withLocationOnly;

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedMood('All');
    setSelectedTag(null);
    setStarredOnly(false);
    setWithLocationOnly(false);
    if (onClearInitialTag) onClearInitialTag();
  };

  // Calculate default center for Map Atlas
  const mapCenter = useMemo(() => {
    if (geotaggedEntries.length > 0) {
      const loc = geotaggedEntries[0].location;
      return { lat: loc.lat, lng: loc.lng };
    }
    return { lat: 37.7749, lng: -122.4194 };
  }, [geotaggedEntries]);

  return (
    <div className="space-y-6">
      {/* Top Header & Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              <span>Real-Time History & Geo-Spatial Atlas</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {entries.length} reflections recorded • Privately encrypted and saved
            </p>
          </div>

          {/* View Toggle */}
          <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'grid'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
              <span>Cards ({filteredEntries.length})</span>
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'map'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              <span>Map Atlas ({geotaggedEntries.length})</span>
            </button>
          </div>
        </div>

        {/* Global Search Input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search across titles, reflections, tags, locations, and agent dialogue messages..."
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Multi-Filter Controls */}
        <div className="pt-2 flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-medium mr-1">
            <Filter className="h-3.5 w-3.5" />
            <span>Filters:</span>
          </div>

          {/* Mood Selectors */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedMood('All')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                selectedMood === 'All'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              All Moods
            </button>
            {(Object.keys(MOOD_CONFIGS) as MoodType[]).map((m) => {
              const cfg = MOOD_CONFIGS[m];
              const isSelected = selectedMood === m;
              return (
                <button
                  key={m}
                  onClick={() => setSelectedMood(isSelected ? 'All' : m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{cfg.emoji}</span>
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Starred Only Toggle */}
          <button
            onClick={() => setStarredOnly(prev => !prev)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors ${
              starredOnly
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <Star className={`h-3 w-3 ${starredOnly ? 'fill-white' : ''}`} />
            <span>Starred</span>
          </button>

          {/* Location Only Toggle */}
          <button
            onClick={() => setWithLocationOnly(prev => !prev)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1 transition-colors ${
              withLocationOnly
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <MapPin className="h-3 w-3" />
            <span>With Location</span>
          </button>

          {/* Tag Filter Dropdown or Active Tag Pill */}
          {selectedTag && (
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700">
              <span>Tag: {selectedTag}</span>
              <button 
                onClick={() => {
                  setSelectedTag(null);
                  if (onClearInitialTag) onClearInitialTag();
                }}
                className="hover:text-indigo-900 dark:hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-rose-500 hover:underline font-medium ml-auto"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Tag pills tray if tags exist */}
        {allAvailableTags.length > 0 && (
          <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium">Themes:</span>
            {allAvailableTags.slice(0, 10).map((tag) => {
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(isSelected ? null : tag)}
                  className={`text-[11px] px-2 py-0.5 rounded-md transition-colors ${
                    isSelected
                      ? 'bg-indigo-600 text-white font-medium'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="p-16 flex flex-col items-center justify-center gap-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <div className="h-8 w-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500">Loading reflection archive...</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="p-16 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
          <BookOpen className="h-10 w-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            No reflections match your filters
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {hasActiveFilters 
              ? 'Try clearing or loosening your filters to view more of your historical reflections.'
              : 'You have not composed any reflections yet. Start your first session in the Journal Editor!'}
          </p>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="mt-2 px-4 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-xs font-medium hover:bg-indigo-100"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Responsive Card Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredEntries.map((entry) => {
            const moodCfg = MOOD_CONFIGS[entry.mood] || MOOD_CONFIGS.Reflective;
            const formattedDate = new Date(entry.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });
            const dialogueCount = (entry.dialogueHistory || []).length;

            return (
              <div
                key={entry.id}
                onClick={() => onOpenEntry(entry)}
                className="group relative flex flex-col justify-between p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 hover:shadow-lg transition-all cursor-pointer"
              >
                <div className="space-y-3">
                  {/* Top Bar: Mood & Date & Favorite */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${moodCfg.badgeClass}`}>
                      <span>{moodCfg.emoji}</span>
                      <span>{moodCfg.label}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formattedDate}</span>
                      </span>

                      <button
                        onClick={(e) => handleToggleFavorite(entry, e)}
                        title={entry.isFavorite ? 'Unstar' : 'Star'}
                        className={`p-1 rounded-md transition-colors ${
                          entry.isFavorite
                            ? 'text-amber-500 hover:text-amber-600'
                            : 'text-slate-300 dark:text-slate-600 hover:text-amber-400'
                        }`}
                      >
                        <Star className={`h-4 w-4 ${entry.isFavorite ? 'fill-amber-500' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-slate-900 dark:text-white text-base line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                    {entry.title || 'Untitled Reflection'}
                  </h3>

                  {/* Content snippet */}
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3 leading-relaxed">
                    {entry.content || '(No text penned)'}
                  </p>

                  {/* Agent Synthesis Excerpt if present */}
                  {entry.synthesis && entry.synthesis.summary && (
                    <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-semibold text-[11px]">
                        <Sparkles className="h-3 w-3" />
                        <span>Agent Synthesis</span>
                      </div>
                      <p className="text-[11px] italic line-clamp-2 text-slate-600 dark:text-slate-300">
                        "{entry.synthesis.summary}"
                      </p>
                    </div>
                  )}

                  {/* Location badge if geotagged */}
                  {entry.location && entry.location.name && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      <MapPin className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                      <span className="truncate">{entry.location.name}</span>
                    </div>
                  )}

                  {/* Tags Tray */}
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {entry.tags.map(t => (
                        <span key={t} className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Metrics & Actions */}
                <div className="pt-4 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-3 text-[11px]">
                    <span>{entry.wordCount} words</span>
                    {dialogueCount > 0 && (
                      <span className="flex items-center gap-1 text-indigo-500">
                        <Bot className="h-3 w-3" />
                        <span>{dialogueCount} {dialogueCount === 1 ? 'turn' : 'turns'}</span>
                      </span>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadEntryAsMarkdown(entry);
                      }}
                      title="Export as Markdown (.md)"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEntryToDelete(entry);
                      }}
                      title="Delete reflection"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Map Atlas View */
        <div className="space-y-4">
          <div className="h-[550px] w-full rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 relative bg-slate-100 dark:bg-slate-900 shadow-inner">
            {mapsConfig.hasClientKey ? (
              <SafeMapBoundary
                fallback={
                  <div className="p-8 h-full flex flex-col justify-center items-center text-center space-y-4 max-w-lg mx-auto">
                    <Compass className="h-12 w-12 text-indigo-500 animate-pulse" />
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Geo-Spatial Atlas (Reflections Overview)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      All {geotaggedEntries.length} location-anchored reflections are indexed cleanly below.
                    </p>
                    <div className="w-full max-h-60 overflow-y-auto space-y-2 text-left border border-slate-200 dark:border-slate-800 rounded-2xl p-2 bg-white dark:bg-slate-950">
                      {geotaggedEntries.map((entry) => (
                        <div
                          key={entry.id}
                          onClick={() => onOpenEntry(entry)}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer flex items-center justify-between transition-colors"
                        >
                          <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{entry.title}</p>
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              <span>{entry.location?.name} • [{entry.location?.lat}, {entry.location?.lng}]</span>
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-slate-400" />
                        </div>
                      ))}
                    </div>
                  </div>
                }
              >
                <APIProvider apiKey={mapsConfig.clientKey}>
                  <Map
                    defaultCenter={mapCenter}
                    defaultZoom={geotaggedEntries.length === 1 ? 12 : 3}
                    mapId="mindmirror_history_atlas"
                    style={{ width: '100%', height: '100%' }}
                    gestureHandling="greedy"
                    disableDefaultUI={false}
                  >
                    {geotaggedEntries.map((entry) => {
                      const loc = entry.location!;
                      return (
                        <AdvancedMarker
                          key={entry.id}
                          position={{ lat: loc.lat, lng: loc.lng }}
                          onClick={() => setSelectedMapEntry(entry)}
                          title={entry.title || loc.name}
                        >
                          <Pin
                            background="#4f46e5"
                            borderColor="#312e81"
                            glyphColor="#ffffff"
                            scale={1.1}
                          />
                        </AdvancedMarker>
                      );
                    })}
                  </Map>
                </APIProvider>
              </SafeMapBoundary>
            ) : (
              /* Graceful Fallback List when Google Maps API key is unconfigured */
              <div className="p-8 h-full flex flex-col justify-center items-center text-center space-y-4 max-w-lg mx-auto">
                <Compass className="h-12 w-12 text-indigo-500 animate-pulse" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Geo-Spatial Atlas (Fallback List Mode)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Interactive satellite rendering is standing by. All {geotaggedEntries.length} location-anchored reflections are indexed cleanly with coordinate bounds below.
                </p>
                <div className="w-full max-h-60 overflow-y-auto space-y-2 text-left border border-slate-200 dark:border-slate-800 rounded-2xl p-2 bg-white dark:bg-slate-950">
                  {geotaggedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      onClick={() => onOpenEntry(entry)}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{entry.title}</p>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          <span>{entry.location?.name} • [{entry.location?.lat}, {entry.location?.lng}]</span>
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Selected Pin Modal / Drawer */}
          {selectedMapEntry && (
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{selectedMapEntry.location?.name}</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    ({selectedMapEntry.location?.address})
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  {selectedMapEntry.title}
                </h4>
                {selectedMapEntry.synthesis?.summary && (
                  <p className="text-xs text-slate-500 italic max-w-xl">
                    "{selectedMapEntry.synthesis.summary}"
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenEntry(selectedMapEntry)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <span>Open in Editor</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setSelectedMapEntry(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Two-Step Deletion Confirmation Modal */}
      {entryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Permanently Delete Reflection?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                This will permanently erase <span className="font-semibold text-slate-800 dark:text-slate-200">"{entryToDelete.title || 'Untitled Reflection'}"</span> and its associated agent dialogue history from your private Firestore partition. This action cannot be undone.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setEntryToDelete(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {deleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
