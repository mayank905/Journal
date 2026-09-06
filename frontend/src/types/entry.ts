export type MoodType = 
  | 'Calm'
  | 'Reflective'
  | 'Grateful'
  | 'Motivated'
  | 'Anxious'
  | 'Overwhelmed'
  | 'Curious'
  | 'Neutral';

export interface MoodConfig {
  type: MoodType;
  emoji: string;
  label: string;
  description: string;
  badgeClass: string;
  activeClass: string;
}

export const MOOD_CONFIGS: Record<MoodType, MoodConfig> = {
  Calm: {
    type: 'Calm',
    emoji: '🌿',
    label: 'Calm',
    description: 'Peaceful, grounded, present',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    activeClass: 'bg-emerald-600 text-white ring-2 ring-emerald-500 shadow-emerald-500/20',
  },
  Reflective: {
    type: 'Reflective',
    emoji: '🪞',
    label: 'Reflective',
    description: 'Contemplative, searching, thoughtful',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
    activeClass: 'bg-sky-600 text-white ring-2 ring-sky-500 shadow-sky-500/20',
  },
  Grateful: {
    type: 'Grateful',
    emoji: '🙏',
    label: 'Grateful',
    description: 'Appreciative, blessed, fulfilled',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    activeClass: 'bg-amber-600 text-white ring-2 ring-amber-500 shadow-amber-500/20',
  },
  Motivated: {
    type: 'Motivated',
    emoji: '⚡',
    label: 'Motivated',
    description: 'Driven, energized, clear-minded',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
    activeClass: 'bg-indigo-600 text-white ring-2 ring-indigo-500 shadow-indigo-500/20',
  },
  Anxious: {
    type: 'Anxious',
    emoji: '🌧️',
    label: 'Anxious',
    description: 'Restless, worried, uneasy',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    activeClass: 'bg-rose-600 text-white ring-2 ring-rose-500 shadow-rose-500/20',
  },
  Overwhelmed: {
    type: 'Overwhelmed',
    emoji: '🌊',
    label: 'Overwhelmed',
    description: 'Burdened, cluttered, stressed',
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
    activeClass: 'bg-orange-600 text-white ring-2 ring-orange-500 shadow-orange-500/20',
  },
  Curious: {
    type: 'Curious',
    emoji: '🔍',
    label: 'Curious',
    description: 'Inquiring, open, exploring',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    activeClass: 'bg-purple-600 text-white ring-2 ring-purple-500 shadow-purple-500/20',
  },
  Neutral: {
    type: 'Neutral',
    emoji: '⚪',
    label: 'Neutral',
    description: 'Objective, observing, steady',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    activeClass: 'bg-slate-700 text-white ring-2 ring-slate-500 shadow-slate-500/20',
  },
};

export const PRESET_TAGS = [
  '#Gratitude',
  '#Work',
  '#Life',
  '#Growth',
  '#Creativity',
  '#Relationships',
  '#Health',
  '#Mindset',
];

export interface EntryLocation {
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
}

export interface EntrySynthesis {
  suggestedTitle: string;
  summary: string;
  takeaways: string[];
}

export interface EntryDialogueTurn {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: string;
  timestamp?: string;
}

export interface JournalEntry {
  id: string;
  userId?: string;
  title: string;
  content: string;
  mood: MoodType;
  tags: string[];
  isFavorite: boolean;
  wordCount: number;
  charCount: number;
  location?: EntryLocation | null;
  dialogueHistory?: EntryDialogueTurn[];
  synthesis?: EntrySynthesis | null;
  createdAt: string;
  updatedAt: string;
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

