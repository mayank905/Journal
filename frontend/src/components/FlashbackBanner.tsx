import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchOnThisDayFlashbacks } from '../lib/entriesApi';
import type { JournalEntry, FlashbackEntryItem, FlashbackResponse } from '../types/entry';
import { MOOD_CONFIGS } from '../types/entry';
import { Sparkles, ArrowRight, X, Bot, Clock } from 'lucide-react';

interface FlashbackBannerProps {
  onOpenEntry: (entry: JournalEntry) => void;
  onAskAgentToCompare?: (entry: JournalEntry) => void;
}

export const FlashbackBanner: React.FC<FlashbackBannerProps> = ({
  onOpenEntry,
  onAskAgentToCompare,
}) => {
  const { idToken, user } = useAuth();
  const [data, setData] = useState<FlashbackResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetchOnThisDayFlashbacks(idToken)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Flashback fetch error:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user, idToken]);

  if (isDismissed || loading || !data || !data.flashbacks || data.flashbacks.length === 0) {
    return null;
  }

  const currentFlashback: FlashbackEntryItem = data.flashbacks[currentIndex] || data.flashbacks[0];
  const { entry, formattedAnniversary } = currentFlashback;
  const moodConfig = MOOD_CONFIGS[entry.mood] || MOOD_CONFIGS.Reflective;

  const entryDate = entry.createdAt ? new Date(entry.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }) : '';

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-purple-500/10 border border-amber-300/40 dark:border-amber-500/30 shadow-lg p-5 transition-all animate-in fade-in duration-300">
      {/* Background ambient decorative shapes */}
      <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-amber-400/10 dark:bg-amber-400/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute left-1/3 -top-10 w-40 h-40 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar with Badge & Dismiss */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-amber-200/40 dark:border-slate-800/60">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-900 dark:text-amber-300 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 animate-pulse" />
            <span>On This Day Flashback</span>
          </div>

          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium">
            <Clock className="h-3 w-3 text-slate-500" />
            <span>{formattedAnniversary}</span>
          </div>

          {entryDate && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              ({entryDate})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {data.flashbacks.length > 1 && (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              {data.flashbacks.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === currentIndex ? 'w-5 bg-amber-500' : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
                  }`}
                  aria-label={`View flashback ${i + 1}`}
                />
              ))}
            </div>
          )}

          <button
            onClick={() => setIsDismissed(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-colors"
            title="Dismiss flashback banner for this session"
            aria-label="Dismiss flashback"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Flashback Content */}
      <div className="pt-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{entry.title || 'Untitled Reflection'}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${moodConfig.badgeClass}`}>
                <span>{moodConfig.emoji}</span>
                <span className="hidden sm:inline">{moodConfig.label}</span>
              </span>
            </h3>

            <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
              {entry.content ? (entry.content.length > 200 ? `${entry.content.slice(0, 200)}...` : entry.content) : 'No written content.'}
            </p>
          </div>
        </div>

        {/* Curated AI Prompt */}
        {data.prompt && (
          <div className="p-2.5 rounded-xl bg-white/60 dark:bg-slate-900/60 border border-indigo-200/50 dark:border-indigo-900/50 flex items-start gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
            <Bot className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <p className="leading-snug italic">
              "{data.prompt}"
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-1 flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => onOpenEntry(entry)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs shadow-sm transition-colors"
          >
            <span>Open Reflection</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          {onAskAgentToCompare && (
            <button
              onClick={() => onAskAgentToCompare(entry)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold transition-colors"
            >
              <Bot className="h-3.5 w-3.5 text-indigo-500" />
              <span>Ask AI to Compare Growth</span>
            </button>
          )}

          {entry.tags && entry.tags.length > 0 && (
            <div className="hidden md:flex items-center gap-1.5 ml-auto">
              {entry.tags.slice(0, 3).map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 text-[11px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
