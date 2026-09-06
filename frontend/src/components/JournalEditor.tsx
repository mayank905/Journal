import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { 
  Star, 
  Save, 
  Check, 
  Clock, 
  Sparkles, 
  Plus, 
  X, 
  AlertCircle, 
  RefreshCw, 
  FileText, 
  Calendar,
  ChevronRight,
  BookOpen,
  Bot,
  MapPin,
  Download,
  Bell
} from 'lucide-react';

import { AgentChat } from './AgentChat';
import { LocationPickerModal } from './LocationPickerModal';
import { NotificationSettingsModal } from './NotificationSettingsModal';
import { downloadEntryAsMarkdown } from '../lib/exportMarkdown';
import { useAuth } from '../context/AuthContext';
import { 
  MOOD_CONFIGS, 
  PRESET_TAGS, 
  type MoodType, 
  type JournalEntry, 
  type SaveStatus,
  type EntryLocation,
  type EntrySynthesis,
  type EntryDialogueTurn
} from '../types/entry';
import { 
  saveJournalEntry, 
  fetchUserEntries, 
  deleteJournalEntry 
} from '../lib/entriesApi';


function generateNewEntryId(): string {
  return `entry_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function countWordsAndChars(text: string): { words: number; chars: number } {
  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  return { words, chars: text.length };
}

interface JournalEditorProps {
  initialEntry?: JournalEntry | null;
  onEntrySaved?: (entry: JournalEntry) => void;
}

export const JournalEditor: React.FC<JournalEditorProps> = ({ initialEntry, onEntrySaved }) => {
  const { user, idToken } = useAuth();

  // Active entry state
  const [entryId, setEntryId] = useState<string>(() => initialEntry?.id || generateNewEntryId());
  const [title, setTitle] = useState<string>(() => initialEntry?.title || '');
  const [content, setContent] = useState<string>(() => initialEntry?.content || '');
  const [mood, setMood] = useState<MoodType>(() => initialEntry?.mood || 'Reflective');
  const [tags, setTags] = useState<string[]>(() => initialEntry?.tags || ['#Mindset']);
  const [isFavorite, setIsFavorite] = useState<boolean>(() => initialEntry?.isFavorite || false);
  const [createdAt, setCreatedAt] = useState<string>(() => initialEntry?.createdAt || new Date().toISOString());
  const [updatedAt, setUpdatedAt] = useState<string>(() => initialEntry?.updatedAt || new Date().toISOString());

  // Metrics
  const [wordCount, setWordCount] = useState<number>(0);
  const [charCount, setCharCount] = useState<number>(0);

  // Status & persistence
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Milestone Celebration
  const [hasCelebratedMilestone, setHasCelebratedMilestone] = useState<boolean>(false);
  const [showMilestoneBanner, setShowMilestoneBanner] = useState<boolean>(false);

  // Tag creation input
  const [customTagInput, setCustomTagInput] = useState<string>('');

  // Sidebar / Past Entries
  const [pastEntries, setPastEntries] = useState<JournalEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState<boolean>(true);

  const [location, setLocation] = useState<EntryLocation | null>(null);
  const [dialogueHistory, setDialogueHistory] = useState<EntryDialogueTurn[]>([]);
  const [synthesis, setSynthesis] = useState<EntrySynthesis | null>(null);
  const [locationModalOpen, setLocationModalOpen] = useState<boolean>(false);
  const [notificationsModalOpen, setNotificationsModalOpen] = useState<boolean>(false);

  // Auto-Save control state
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('mindmirror_autosave') !== 'false';
    } catch {
      return true;
    }
  });

  const handleToggleAutoSave = () => {
    setAutoSaveEnabled((prev) => {
      const nextVal = !prev;
      try {
        localStorage.setItem('mindmirror_autosave', String(nextVal));
      } catch {}
      return nextVal;
    });
  };

  // Refs for auto-expanding textareas
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Debounced auto-save timer ref
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-resize textarea heights dynamically
  const adjustTextareaHeight = useCallback((element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.max(element.scrollHeight, 40)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight(titleTextareaRef.current);
  }, [title, adjustTextareaHeight]);

  useEffect(() => {
    adjustTextareaHeight(bodyTextareaRef.current);
  }, [content, adjustTextareaHeight]);

  // Synchronize when initialEntry changes (from History or Insights)
  useEffect(() => {
    if (initialEntry && initialEntry.id !== entryId) {
      setEntryId(initialEntry.id);
      setTitle(initialEntry.title || '');
      setContent(initialEntry.content || '');
      setMood(initialEntry.mood || 'Reflective');
      setTags(initialEntry.tags || ['#Mindset']);
      setIsFavorite(initialEntry.isFavorite || false);
      setCreatedAt(initialEntry.createdAt || new Date().toISOString());
      setUpdatedAt(initialEntry.updatedAt || new Date().toISOString());
      setWordCount(initialEntry.wordCount || 0);
      setCharCount(initialEntry.charCount || 0);
      setLocation(initialEntry.location || null);
      setDialogueHistory(initialEntry.dialogueHistory || []);
      setSynthesis(initialEntry.synthesis || null);
      setIsDirty(false);
      setSaveStatus('saved');
      setHasCelebratedMilestone((initialEntry.wordCount || 0) >= 50);
      setShowMilestoneBanner(false);
      setSaveError(null);
    }
  }, [initialEntry]);

  // Load user's past entries on mount
  const refreshEntriesList = useCallback(async () => {
    if (!user) return;
    setLoadingEntries(true);
    try {
      const entries = await fetchUserEntries(idToken, user.uid);
      setPastEntries(entries);
    } catch (err) {
      console.warn('Failed to load past entries:', err);
    } finally {
      setLoadingEntries(false);
    }
  }, [user, idToken]);

  useEffect(() => {
    refreshEntriesList();
  }, [refreshEntriesList]);

  // Update live counters when content changes
  useEffect(() => {
    const counts = countWordsAndChars(content);
    setWordCount(counts.words);
    setCharCount(counts.chars);

    // Track 50-word milestone
    if (counts.words >= 50 && !hasCelebratedMilestone) {
      setShowMilestoneBanner(true);
    }
  }, [content, hasCelebratedMilestone]);

  // Fire celebratory confetti
  const triggerConfettiCelebration = () => {
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'],
    });
    setHasCelebratedMilestone(true);
    setShowMilestoneBanner(true);
  };

  // Perform persistence (manual or auto)
  const performSave = useCallback(
    async (isManual: boolean = false) => {
      if (!user) return;

      setSaveStatus('saving');
      setSaveError(null);

      const entryPayload: JournalEntry = {
        id: entryId,
        userId: user.uid,
        title: title.trim() || 'Untitled Reflection',
        content: content,
        mood: mood,
        tags: tags,
        isFavorite: isFavorite,
        wordCount: wordCount,
        charCount: charCount,
        location: location,
        // Dialogue history and synthesis are always preserved for this reflection
        dialogueHistory: dialogueHistory,
        synthesis: synthesis,
        createdAt: createdAt,
        updatedAt: new Date().toISOString(),
      };

      const result = await saveJournalEntry(entryPayload, idToken, user.uid);

      if (result.success) {
        setSaveStatus('saved');
        setIsDirty(false);
        setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        setUpdatedAt(result.data?.updatedAt || new Date().toISOString());

        // Confetti celebration if 50+ words upon manual save
        if (wordCount >= 50 && (!hasCelebratedMilestone || isManual)) {
          triggerConfettiCelebration();
        }

        // Refresh entries list in background
        refreshEntriesList();

        if (onEntrySaved && result.data) {
          onEntrySaved(result.data);
        }
      } else {
        setSaveStatus('error');
        setSaveError(result.error || 'Failed to persist reflection. Your writing is preserved locally.');
      }
    },
    [user, entryId, title, content, mood, tags, isFavorite, wordCount, charCount, location, dialogueHistory, synthesis, createdAt, idToken, hasCelebratedMilestone, refreshEntriesList, onEntrySaved, initialEntry]
  );


  // 5-Second Debounced Auto-Save (only when autoSaveEnabled is true)
  useEffect(() => {
    if (!isDirty || !autoSaveEnabled) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      if (isDirty && autoSaveEnabled) {
        performSave(false);
      }
    }, 5000); // 5 seconds debounced

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [isDirty, autoSaveEnabled, performSave]);

  // Handle content changes
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsDirty(true);
    setSaveStatus('unsaved');
  };

  // Handle title changes
  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value);
    setIsDirty(true);
    setSaveStatus('unsaved');
  };

  // Handle mood selection
  const handleMoodSelect = (selectedMood: MoodType) => {
    setMood(selectedMood);
    setIsDirty(true);
    setSaveStatus('unsaved');
  };

  // Toggle favorite star
  const handleToggleFavorite = () => {
    const nextVal = !isFavorite;
    setIsFavorite(nextVal);
    setIsDirty(true);
    setSaveStatus('unsaved');
  };

  // Toggle preset tag
  const handleTogglePresetTag = (tag: string) => {
    setTags((prev) => {
      const exists = prev.includes(tag);
      const updated = exists ? prev.filter((t) => t !== tag) : [...prev, tag];
      setIsDirty(true);
      setSaveStatus('unsaved');
      return updated;
    });
  };

  // Add custom hashtag
  const handleAddCustomTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const raw = customTagInput.trim();
      if (!raw) return;

      const formatted = raw.startsWith('#') ? raw : `#${raw}`;
      if (!tags.includes(formatted)) {
        setTags((prev) => [...prev, formatted]);
        setIsDirty(true);
        setSaveStatus('unsaved');
      }
      setCustomTagInput('');
    }
  };

  // Remove tag
  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
    setIsDirty(true);
    setSaveStatus('unsaved');
  };

  // Start fresh reflection
  const handleStartNewEntry = () => {
    if (isDirty) {
      performSave(true);
    }
    const newId = generateNewEntryId();
    const nowIso = new Date().toISOString();
    setEntryId(newId);
    setTitle('');
    setContent('');
    setMood('Reflective');
    setTags(['#Growth']);
    setIsFavorite(false);
    setCreatedAt(nowIso);
    setUpdatedAt(nowIso);
    setWordCount(0);
    setCharCount(0);
    setLocation(null);
    setDialogueHistory([]);
    setSynthesis(null);
    setIsDirty(false);
    setSaveStatus('saved');
    setHasCelebratedMilestone(false);
    setShowMilestoneBanner(false);
    setSaveError(null);
  };

  // Load a past entry into the editor
  const handleSelectPastEntry = (entry: JournalEntry) => {
    if (isDirty) {
      performSave(true);
    }
    setEntryId(entry.id);
    setTitle(entry.title);
    setContent(entry.content);
    setMood(entry.mood);
    setTags(entry.tags || []);
    setIsFavorite(entry.isFavorite);
    setCreatedAt(entry.createdAt);
    setUpdatedAt(entry.updatedAt);
    setWordCount(entry.wordCount);
    setCharCount(entry.charCount);
    setLocation(entry.location || null);
    setDialogueHistory(entry.dialogueHistory || []);
    setSynthesis(entry.synthesis || null);
    setIsDirty(false);
    setSaveStatus('saved');
    setHasCelebratedMilestone(entry.wordCount >= 50);
    setShowMilestoneBanner(false);
    setSaveError(null);
    setSidebarOpen(false);
  };

  // Delete past entry
  const handleDeleteEntry = async (idToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (window.confirm('Delete this reflection permanently?')) {
      await deleteJournalEntry(idToDelete, idToken, user.uid);
      if (entryId === idToDelete) {
        handleStartNewEntry();
      }
      refreshEntriesList();
    }
  };

  const handleInsertFromAgent = useCallback((textToInsert: string) => {
    setContent((prev) => {
      const addition = `\n\n---\n> **🤖 Cognitive Agent Synthesis**:\n> ${textToInsert.split('\n').join('\n> ')}\n`;
      return prev ? `${prev}${addition}` : textToInsert;
    });
    setIsDirty(true);
    setSaveStatus('unsaved');
  }, []);

  const handleSaveLocation = useCallback((newLoc: EntryLocation | null) => {
    setLocation(newLoc);
    setIsDirty(true);
    setSaveStatus('unsaved');
  }, []);

  const handleApplyTitle = useCallback((newTitle: string) => {
    setTitle(newTitle);
    setIsDirty(true);
    setSaveStatus('unsaved');
  }, []);

  const handleSaveSynthesis = useCallback((newSynthesis: EntrySynthesis) => {
    setSynthesis(newSynthesis);
    setIsDirty(true);
  }, []);

  const handleDialogueHistoryChange = useCallback((newHistory: any[]) => {
    if (!newHistory || newHistory.length === 0) return;
    const turns: EntryDialogueTurn[] = newHistory.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      mode: m.mode,
      timestamp: m.timestamp,
    }));
    setDialogueHistory(turns);
  }, []);

  const handleDeleteDialogueMessage = useCallback((deletedIds: string | string[]) => {
    const idSet = new Set(Array.isArray(deletedIds) ? deletedIds : [deletedIds]);
    setDialogueHistory(prev => prev.filter(t => !t.id || !idSet.has(t.id)));
    setIsDirty(true);
    setSaveStatus('unsaved');
  }, []);

  const handleDownloadMarkdown = () => {
    const currentEntry: JournalEntry = {
      id: entryId,
      userId: user?.uid,
      title: title.trim() || 'Untitled Reflection',
      content: content,
      mood: mood,
      tags: tags,
      isFavorite: isFavorite,
      wordCount: wordCount,
      charCount: charCount,
      location: location,
      dialogueHistory: dialogueHistory,
      synthesis: synthesis,
      createdAt: createdAt,
      updatedAt: updatedAt,
    };
    downloadEntryAsMarkdown(currentEntry);
  };


  const activeMoodConfig = MOOD_CONFIGS[mood] || MOOD_CONFIGS.Reflective;

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Left: New Entry, Past Entries Toggle, & Agent Assistant Toggle */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleStartNewEntry}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
            title="Start a new reflection draft"
          >
            <Plus className="h-4 w-4" />
            <span>New Reflection</span>
          </button>

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all"
            title="Browse past reflections"
          >
            <BookOpen className="h-4 w-4 text-slate-500" />
            <span>Reflections ({pastEntries.length})</span>
          </button>

          <button
            onClick={() => setAgentPanelOpen(!agentPanelOpen)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 ${
              agentPanelOpen
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm ring-2 ring-indigo-500/50'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
            title="Toggle Autonomous Cognitive Agent"
          >
            <Bot className="h-4 w-4 text-indigo-400" />
            <span>Cognitive Agent</span>
          </button>

          {/* Location Anchor Button */}
          <button
            onClick={() => setLocationModalOpen(true)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              location
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
            }`}
            title={location ? `Location: ${location.name}` : 'Attach real-world location'}
          >
            <MapPin className={`h-4 w-4 ${location ? 'text-emerald-500' : 'text-slate-400'}`} />
            <span className="max-w-[110px] truncate">{location ? location.name : 'Location'}</span>
          </button>

          {/* Export Markdown Button */}
          <button
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all"
            title="Download reflection as Markdown (.md)"
          >
            <Download className="h-4 w-4 text-slate-500" />
            <span className="hidden md:inline">Export .md</span>
          </button>

          {/* External Notifications & Alerts Button */}
          <button
            onClick={() => setNotificationsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium transition-all"
            title="Configure External Notifications (Slack, Discord, Email)"
          >
            <Bell className="h-4 w-4 text-indigo-500" />
            <span className="hidden sm:inline">Alerts</span>
          </button>

          {/* Favorite Star Toggle */}
          <button
            onClick={handleToggleFavorite}
            className={`p-2 rounded-xl border transition-all ${
              isFavorite
                ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-500'
                : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-400 hover:text-amber-500 hover:border-amber-300'
            }`}
            title={isFavorite ? 'Remove from favorites' : 'Mark as favorite reflection'}
            aria-label="Toggle favorite"
          >
            <Star className={`h-4 w-4 ${isFavorite ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>
        </div>



        {/* Right: Live Word/Char Counters & Dual-Tier Save Status */}
        <div className="flex items-center gap-3">
          {/* Real-time counters */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 font-mono">
            <span>
              <strong className="text-slate-900 dark:text-white">{wordCount}</strong> words
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span>
              <strong className="text-slate-900 dark:text-white">{charCount}</strong> chars
            </span>
          </div>

          {/* Status Badge */}
          <div className="flex items-center text-xs">
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-medium animate-pulse">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>Saving...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-medium">
                <Check className="h-3 w-3 text-emerald-500" />
                <span>Saved to Firestore</span>
                {lastSavedTime && <span className="text-[10px] opacity-70">({lastSavedTime})</span>}
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
                <span>Unsaved changes</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800 font-medium">
                <AlertCircle className="h-3 w-3 text-rose-500" />
                <span>Save failed</span>
              </span>
            )}
          </div>

          {/* Single Auto-Save Toggle Button */}
          <button
            type="button"
            onClick={handleToggleAutoSave}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              autoSaveEnabled
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            title={autoSaveEnabled ? "Auto-Save is ON. Continuous saving active." : "Auto-Save is OFF. Click to enable continuous saving."}
          >
            <span className={`h-2 w-2 rounded-full ${autoSaveEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>{autoSaveEnabled ? 'Auto-Save: ON' : 'Auto-Save: OFF'}</span>
          </button>

          {/* Manual Save Button */}
          <button
            onClick={() => performSave(true)}
            disabled={saveStatus === 'saving'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Manually save complete reflection, chat dialogue, and settings"
          >
            <Save className="h-4 w-4" />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Error Alert Banner with Retry (Strict Zero Input Loss) */}
      {saveError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 flex items-start justify-between gap-3 text-rose-800 dark:text-rose-200 text-xs">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Persistence Warning: {saveError}</p>
              <p className="text-[11px] opacity-80 mt-0.5">
                Your writing is preserved in your active browser buffer. You can retry synchronization at any time.
              </p>
            </div>
          </div>
          <button
            onClick={() => performSave(true)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium shrink-0"
          >
            Retry Save
          </button>
        </div>
      )}

      {/* 50+ Word Milestone Celebratory Toast */}
      {showMilestoneBanner && wordCount >= 50 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-emerald-500/10 border border-amber-300/60 dark:border-amber-700/60 flex items-center justify-between gap-3 animate-fade-in shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                🎉 Reflection Milestone Reached! (50+ words)
              </p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                You've articulated over {wordCount} words of thoughtful introspection. Saving now triggers celebratory confetti!
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowMilestoneBanner(false)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Past Entries Drawer Modal */}
      {sidebarOpen && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-lg space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="h-4 w-4 text-indigo-500" />
              <span>Saved Reflections Archive</span>
            </h3>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loadingEntries ? (
            <div className="py-6 text-center text-xs text-slate-500">Loading reflections...</div>
          ) : pastEntries.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No saved reflections yet. Write your thoughts and click Save!
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 space-y-1">
              {pastEntries.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelectPastEntry(item)}
                  className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between hover:bg-indigo-50/50 dark:hover:bg-indigo-950/40 transition-all ${
                    item.id === entryId ? 'bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800' : ''
                  }`}
                >
                  <div className="space-y-1 truncate pr-3">
                    <div className="flex items-center gap-2">
                      {item.isFavorite && <Star className="h-3 w-3 fill-amber-400 text-amber-500 shrink-0" />}
                      <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {item.title || 'Untitled Reflection'}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {item.mood}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {item.content ? item.content.slice(0, 80) : 'No content yet...'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {item.wordCount} words
                    </span>
                    <button
                      onClick={(e) => handleDeleteEntry(item.id, e)}
                      className="p-1 rounded text-slate-400 hover:text-rose-500"
                      title="Delete reflection"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Canvas & Cognitive Agent Responsive Grid */}
      <div className={`grid grid-cols-1 ${agentPanelOpen ? 'lg:grid-cols-12 gap-6' : ''}`}>
        <div className={agentPanelOpen ? 'lg:col-span-7' : 'w-full'}>
          {/* Main Distraction-Free Journal Canvas */}
          <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6 relative">
        {/* Entry Metadata Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>
                {new Date(createdAt).toLocaleDateString(undefined, {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>
                Updated {new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Attached Location Badge */}
            {location && (
              <>
                <span>•</span>
                <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-medium">
                  <MapPin className="h-3 w-3 text-emerald-500" />
                  <span className="max-w-[130px] truncate">{location.name}</span>
                  <button
                    type="button"
                    onClick={() => setLocationModalOpen(true)}
                    className="ml-1 underline hover:opacity-80 text-[10px]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocation(null);
                      setIsDirty(true);
                      setSaveStatus('unsaved');
                    }}
                    className="p-0.5 hover:text-rose-500"
                    title="Remove location"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Auto-Expanding Title Textarea */}
        <div>
          <textarea
            ref={titleTextareaRef}
            value={title}
            onChange={handleTitleChange}
            placeholder="Title your reflection..."
            rows={1}
            className="w-full bg-transparent text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none resize-none overflow-hidden leading-snug border-none p-0"
          />
        </div>

        {/* Emotional Mood Tracker Tray */}
        <div className="space-y-3 pt-3">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
            Current Emotional State
          </label>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            {(Object.keys(MOOD_CONFIGS) as MoodType[]).map((mKey) => {
              const cfg = MOOD_CONFIGS[mKey];
              const isSelected = mood === mKey;
              return (
                <button
                  key={mKey}
                  type="button"
                  onClick={() => handleMoodSelect(mKey)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                    isSelected
                      ? cfg.activeClass
                      : `${cfg.badgeClass} hover:opacity-80`
                  }`}
                  title={cfg.description}
                >
                  <span>{cfg.emoji}</span>
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 italic pt-0.5">
            {activeMoodConfig.description}
          </p>
        </div>

        {/* Auto-Expanding Body Textarea */}
        <div className="pt-2">
          <textarea
            ref={bodyTextareaRef}
            value={content}
            onChange={handleContentChange}
            placeholder="What is occupying your thoughts today? Write freely, without self-censorship. Your thoughts remain entirely isolated and private..."
            rows={8}
            className="w-full bg-transparent text-base sm:text-lg text-slate-800 dark:text-slate-200 placeholder-slate-400/80 focus:outline-none resize-none overflow-hidden leading-relaxed border-none p-0 min-h-[220px]"
          />
        </div>

        {/* Tagging Section: Pre-Set Tray & Custom Hashtags */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Categorization & Hashtags
            </span>
            <span className="text-[11px] text-slate-400">
              Press Enter or comma to add custom tag
            </span>
          </div>

          {/* Active Tags Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-medium"
              >
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="p-0.5 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800 text-indigo-400 hover:text-indigo-600"
                  aria-label={`Remove tag ${tag}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}

            {/* Custom Tag Input */}
            <input
              type="text"
              value={customTagInput}
              onChange={(e) => setCustomTagInput(e.target.value)}
              onKeyDown={handleAddCustomTag}
              placeholder="Add #tag..."
              className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 w-28"
            />
          </div>

          {/* Pre-set Tag Tray */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-400 mr-1">Quick tags:</span>
            {PRESET_TAGS.map((pTag) => {
              const isIncluded = tags.includes(pTag);
              return (
                <button
                  key={pTag}
                  type="button"
                  onClick={() => handleTogglePresetTag(pTag)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                    isIncluded
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {pTag}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status & Metrics Bar directly under Journal Entry Section */}
        <div className="mt-4 pt-4 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            {saveStatus === 'saving' && (
              <span className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 font-medium animate-pulse">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Saving reflection...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <Check className="h-3.5 w-3.5" />
                <span>Saved {lastSavedTime ? `at ${lastSavedTime}` : 'to Firestore'}</span>
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span>Unsaved changes</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="inline-flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-medium">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>Save error</span>
              </span>
            )}
          </div>

          {/* Right Metrics */}
          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
            <span>{wordCount} words • {charCount} chars • ~{Math.max(1, Math.ceil(wordCount / 200))} min read</span>
          </div>
        </div>

        {/* Micro note explaining auto-save scope */}
        <div className="pt-2 text-[11px] text-slate-400 dark:text-slate-500">
          💡 <span className="font-semibold text-slate-500 dark:text-slate-400">Auto-Save Note</span>: When enabled, written reflection text, mood, and tags save continuously in the background. Chat dialogue and executive synthesis are saved when clicking <strong>Save</strong>.
        </div>
      </div>
    </div>

    {/* Cognitive Agent Assistant Panel */}
    {agentPanelOpen && (
      <div className="lg:col-span-5">
        <AgentChat
          key={entryId}
          entryId={entryId}
          entryTitle={title}
          entryContent={content}
          entryMood={mood}
          entryTags={tags}
          initialDialogueHistory={dialogueHistory as any}
          initialSynthesis={synthesis}
          onInsertIntoJournal={handleInsertFromAgent}
          onApplyTitle={handleApplyTitle}
          onSaveSynthesis={handleSaveSynthesis}
          onDialogueHistoryChange={handleDialogueHistoryChange}
          onDeleteMessage={handleDeleteDialogueMessage}
          onClose={() => setAgentPanelOpen(false)}
        />
      </div>
    )}
  </div>

  {/* Location Picker Modal */}
  {locationModalOpen && (
    <LocationPickerModal
      currentLocation={location}
      onSaveLocation={handleSaveLocation}
      onClose={() => setLocationModalOpen(false)}
    />
  )}

  {/* Notification Settings Modal */}
  {notificationsModalOpen && (
    <NotificationSettingsModal
      isOpen={notificationsModalOpen}
      onClose={() => setNotificationsModalOpen(false)}
    />
  )}
</div>
  );
};



