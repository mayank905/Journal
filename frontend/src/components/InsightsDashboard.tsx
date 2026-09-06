import React, { useMemo } from 'react';
import { 
  TrendingUp, 
  BookOpen, 
  Edit3, 
  Bot, 
  Star, 
  MapPin, 
  Sparkles, 
  Tag, 
  Compass, 
  ArrowRight,
  Smile
} from 'lucide-react';
import { 
  type JournalEntry, 
  type MoodType, 
  MOOD_CONFIGS 
} from '../types/entry';

const MOOD_BAR_COLORS: Record<MoodType, string> = {
  Calm: 'bg-emerald-500',
  Reflective: 'bg-sky-500',
  Grateful: 'bg-amber-500',
  Motivated: 'bg-indigo-500',
  Anxious: 'bg-rose-500',
  Overwhelmed: 'bg-orange-500',
  Curious: 'bg-purple-500',
  Neutral: 'bg-slate-500',
};

interface InsightsDashboardProps {
  entries: JournalEntry[];
  onOpenEntry: (entry: JournalEntry) => void;
  onFilterByTag: (tag: string) => void;
}

export const InsightsDashboard: React.FC<InsightsDashboardProps> = ({
  entries,
  onOpenEntry,
  onFilterByTag
}) => {
  // 1. Top-Level Metric Calculations
  const metrics = useMemo(() => {
    const totalEntries = entries.length;
    const totalWords = entries.reduce((acc, e) => acc + (e.wordCount || 0), 0);
    const totalReflections = entries.reduce((acc, e) => acc + ((e.dialogueHistory || []).length), 0);
    const totalStarred = entries.filter(e => e.isFavorite).length;
    const totalGeotagged = entries.filter(e => e.location && e.location.lat != null).length;

    return {
      totalEntries,
      totalWords,
      totalReflections,
      totalStarred,
      totalGeotagged,
    };
  }, [entries]);

  // 2. Emotional State Distribution
  const moodDistribution = useMemo(() => {
    const counts: Record<MoodType, number> = {
      Calm: 0,
      Reflective: 0,
      Grateful: 0,
      Motivated: 0,
      Anxious: 0,
      Overwhelmed: 0,
      Curious: 0,
      Neutral: 0,
    };

    entries.forEach(e => {
      const m = e.mood as MoodType;
      if (counts[m] !== undefined) {
        counts[m]++;
      } else {
        counts['Reflective']++;
      }
    });

    const total = entries.length || 1;
    const list = (Object.keys(MOOD_CONFIGS) as MoodType[]).map(m => {
      const count = counts[m];
      const pct = Math.round((count / total) * 100);
      return {
        mood: m,
        count,
        percentage: pct,
        config: MOOD_CONFIGS[m],
      };
    });

    return { list, totalCount: entries.length };
  }, [entries]);

  // 3. Top 8 Recurring Themes / Tags Cloud
  const topTags = useMemo(() => {
    const tagFreq: Record<string, number> = {};
    entries.forEach(e => {
      (e.tags || []).forEach(t => {
        if (!t) return;
        tagFreq[t] = (tagFreq[t] || 0) + 1;
      });
    });

    return Object.entries(tagFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));
  }, [entries]);

  // 4. Geographic Footprint & Top Environments
  const placesFootprint = useMemo(() => {
    const placeFreq: Record<string, { count: number; moods: Record<string, number>; sampleEntry: JournalEntry }> = {};

    entries.forEach(e => {
      if (!e.location || !e.location.name) return;
      const placeName = e.location.name.trim();
      if (!placeFreq[placeName]) {
        placeFreq[placeName] = { count: 0, moods: {}, sampleEntry: e };
      }
      placeFreq[placeName].count++;
      const m = e.mood || 'Reflective';
      placeFreq[placeName].moods[m] = (placeFreq[placeName].moods[m] || 0) + 1;
    });

    return Object.entries(placeFreq)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, data]) => {
        // Dominant mood in this place
        const topMood = Object.entries(data.moods).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Reflective';
        return {
          name,
          count: data.count,
          topMood,
          sampleEntry: data.sampleEntry,
        };
      });
  }, [entries]);

  // 5. Aggregated Agent Takeaways Showcase
  const aggregatedTakeaways = useMemo(() => {
    const list: Array<{ entry: JournalEntry; takeaway: string }> = [];

    entries.forEach(e => {
      if (e.synthesis && Array.isArray(e.synthesis.takeaways)) {
        e.synthesis.takeaways.forEach(t => {
          if (t && typeof t === 'string') {
            list.push({ entry: e, takeaway: t });
          }
        });
      }
    });

    return list.slice(0, 6);
  }, [entries]);

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-8 border border-indigo-800/50 shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-indigo-300 text-xs font-semibold backdrop-blur-sm">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Reflective Behavioral Trends & Insights</span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight">
            Cognitive Analytics & Patterns
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Synthesized across {metrics.totalEntries} private reflections and {metrics.totalReflections} autonomous ReAct agent conversations.
          </p>
        </div>
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* 1. Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Entries */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Entries</span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <BookOpen className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {metrics.totalEntries}
          </p>
          <p className="text-[11px] text-slate-400">Reflections recorded</p>
        </div>

        {/* Words Penned */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Words Penned</span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Edit3 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {metrics.totalWords.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400">Cumulative expression</p>
        </div>

        {/* AI Reflections Held */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">AI Reflections</span>
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <Bot className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {metrics.totalReflections}
          </p>
          <p className="text-[11px] text-slate-400">Dialogue turns with Gemini</p>
        </div>

        {/* Starred Moments */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Favorite Moments</span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-500">
              <Star className="h-4 w-4 fill-amber-500" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {metrics.totalStarred}
          </p>
          <p className="text-[11px] text-slate-400">Starred breakthroughs</p>
        </div>

        {/* Geotagged Count */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Geotagged</span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-500">
              <MapPin className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
            {metrics.totalGeotagged}
          </p>
          <p className="text-[11px] text-slate-400">Anchored to places</p>
        </div>
      </div>

      {/* 2. Emotional State Distribution */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Smile className="h-5 w-5 text-indigo-500" />
              <span>Emotional Distribution Breakdown</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Proportion of emotional states recorded across reflections
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {metrics.totalEntries} Logged Moods
          </span>
        </div>

        {/* Proportional Mood Distribution Multi-segment Bar */}
        <div className="h-4 w-full rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-800">
          {moodDistribution.list.map(item => {
            if (item.count === 0) return null;
            return (
              <div
                key={item.mood}
                style={{ width: `${item.percentage}%` }}
                title={`${item.config.label}: ${item.count} (${item.percentage}%)`}
                className={`${MOOD_BAR_COLORS[item.mood] || 'bg-indigo-500'} transition-all hover:opacity-85`}
              />
            );
          })}
        </div>

        {/* Mood Badges Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {moodDistribution.list.map(item => (
            <div
              key={item.mood}
              className={`p-3 rounded-xl border flex items-center justify-between ${
                item.count > 0 
                  ? 'bg-slate-50/70 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700' 
                  : 'bg-transparent border-dashed border-slate-200 dark:border-slate-800 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{item.config.emoji}</span>
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {item.config.label}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {item.percentage}% of entries
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Grid: 3. Top Recurring Tags & 4. Places Footprint */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 3. Recurring Themes & Tags Cloud */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Tag className="h-4 w-4 text-indigo-500" />
                <span>Top Recurring Themes</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Top 8 frequent tags. Click to filter history archive.
              </p>
            </div>
          </div>

          {topTags.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-6 text-center">
              No tags recorded yet. Tag your entries with #Mindset, #Work, or custom themes!
            </p>
          ) : (
            <div className="flex flex-wrap gap-2.5 pt-2">
              {topTags.map(({ tag, count }) => (
                <button
                  key={tag}
                  onClick={() => onFilterByTag(tag)}
                  className="group flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-all text-xs cursor-pointer"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                    {tag}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 group-hover:bg-indigo-100 group-hover:text-indigo-700 dark:group-hover:bg-indigo-900 dark:group-hover:text-indigo-300">
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 4. Places & Geographic Footprint */}
        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Compass className="h-4 w-4 text-emerald-500" />
              <span>Places & Geographic Footprint</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Frequented writing environments and associated moods
            </p>
          </div>

          {placesFootprint.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-6 text-center">
              No location-anchored reflections yet. Add a location in the editor to track your geographic footprints!
            </p>
          ) : (
            <div className="space-y-2.5 pt-1">
              {placesFootprint.map(place => (
                <div
                  key={place.name}
                  onClick={() => onOpenEntry(place.sampleEntry)}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {place.name}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Top Mood: {place.topMood}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      {place.count} {place.count === 1 ? 'entry' : 'entries'}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 5. Aggregated Agent Takeaways Showcase */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-500" />
            <span>Aggregated Agent Breakthroughs & Takeaways</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Recent key takeaways synthesized by the MindMirror Socratic agent across your reflections
          </p>
        </div>

        {aggregatedTakeaways.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-6 text-center">
            No agent syntheses yet. Use the "Synthesize Reflection" tool in the Journal Editor to extract actionable breakthroughs!
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
            {aggregatedTakeaways.map(({ entry, takeaway }, idx) => (
              <div
                key={idx}
                onClick={() => onOpenEntry(entry)}
                className="group p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 hover:border-indigo-300 dark:hover:border-indigo-700 flex flex-col justify-between space-y-3 cursor-pointer transition-all hover:shadow-md"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-[160px]">
                      {entry.title || 'Untitled'}
                    </span>
                    <span>
                      {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                    "{takeaway}"
                  </p>
                </div>

                <div className="pt-2 border-t border-indigo-100/60 dark:border-indigo-900/40 flex items-center justify-between text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold group-hover:translate-x-1 transition-transform">
                  <span>Open in Editor</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
