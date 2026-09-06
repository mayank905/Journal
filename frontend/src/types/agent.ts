export type AgentPersonaMode = 
  | 'socratic'
  | 'action_momentum'
  | 'pattern_memory'
  | 'cognitive_reframing'
  | 'guided_inquiry';

export interface PersonaConfig {
  mode: AgentPersonaMode;
  title: string;
  shortTitle: string;
  emoji: string;
  description: string;
  accentColor: string;
  badgeClass: string;
  quickPrompts: string[];
}

export const PERSONA_CONFIGS: Record<AgentPersonaMode, PersonaConfig> = {
  socratic: {
    mode: 'socratic',
    title: 'Deep Reflection & Socratic Mirror',
    shortTitle: 'Socratic Mirror',
    emoji: '🪞',
    description: 'Unpacks underlying beliefs, examines assumptions, and asks poignant questions.',
    accentColor: 'sky',
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
    quickPrompts: [
      'What assumption am I making here?',
      'Why does this feel so significant to me?',
      'What is beneath this surface feeling?',
    ],
  },
  action_momentum: {
    mode: 'action_momentum',
    title: 'Action Steps & Momentum Strategist',
    shortTitle: 'Action Momentum',
    emoji: '⚡',
    description: 'Converts abstract processing into concrete, bounded micro-actions.',
    accentColor: 'indigo',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
    quickPrompts: [
      'What is a 5-minute micro-action I can take?',
      'Break this challenge into 3 bounded steps',
      'How can I build momentum without burnout?',
    ],
  },
  pattern_memory: {
    mode: 'pattern_memory',
    title: 'Longitudinal Pattern & Memory Tracker',
    shortTitle: 'Memory & Patterns',
    emoji: '🔍',
    description: 'Correlates this entry with historical memories to illuminate subconscious loops.',
    accentColor: 'purple',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    quickPrompts: [
      'Have I felt this way before in past entries?',
      'What historical pattern is repeating here?',
      'What breakthroughs helped me previously?',
    ],
  },
  cognitive_reframing: {
    mode: 'cognitive_reframing',
    title: 'Cognitive Re-framing & Mental Clarity',
    shortTitle: 'Cognitive Reframing',
    emoji: '🌿',
    description: 'Illuminates cognitive traps and suggests two empowering alternative lenses.',
    accentColor: 'emerald',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    quickPrompts: [
      'Help me reframe this thought gently',
      'Am I falling into all-or-nothing thinking?',
      'What would a compassionate friend tell me?',
    ],
  },
  guided_inquiry: {
    mode: 'guided_inquiry',
    title: 'Guided Follow-Up Inquirer',
    shortTitle: 'Follow-Up Inquirer',
    emoji: '✍️',
    description: 'Formulates tailored follow-up questions for subsequent writing sessions.',
    accentColor: 'amber',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    quickPrompts: [
      'Give me 3 follow-up journaling questions',
      'What question am I avoiding asking myself?',
      'Prompt my next reflection session',
    ],
  },
};

export interface AgentTraceStep {
  step_type: 'thought' | 'tool_call' | 'observation' | 'synthesis';
  title: string;
  detail?: string;
  data?: Record<string, any>;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode?: AgentPersonaMode;
  modelUsed?: string;
  traceSteps?: AgentTraceStep[];
  timestamp: string;
}
