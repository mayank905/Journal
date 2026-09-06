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
  welcomeMessage: string;
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
      'What expectation am I holding myself to right now?',
      'If I step outside my ego, what is the core truth here?',
      'What fear is quietly driving my reaction?',
      'What would happen if I accepted this reality completely?',
      'Whose approval am I subconsciously seeking?',
      'What belief about myself is being challenged?',
      'What does this situation reveal about my core values?',
    ],
    welcomeMessage: "Hello. I am your Socratic Reflection Mirror. I gently unpack underlying beliefs, examine unstated assumptions, and formulate poignant questions that lead you deeper into self-discovery. What would you like to reflect on today?",
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
      'What is the single highest-leverage task for today?',
      'Where can I set a firm boundary to protect my energy?',
      'What friction can I remove in the next 10 minutes?',
      'What can I safely de-prioritize or say no to?',
      'How can I reward myself for taking this next step?',
      'What does minimum viable progress look like today?',
      'What is one concrete decision I will commit to by tonight?',
    ],
    welcomeMessage: "Welcome. I am your Action Momentum Strategist. I convert abstract reflection into concrete, bounded micro-actions and immediate 24-hour steps. How can we turn your current thoughts into grounded momentum?",
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
      'How does this connect to earlier cycles of burnout or stress?',
      'When did I last overcome a similar obstacle?',
      'What recurring triggers appear around this emotion?',
      'What seasonal or environmental factors match past reflections?',
      'Compare my mindset today with my reflections last month',
      'What lessons from past entries have I forgotten to apply?',
      'What recurring positive habit has supported me the most?',
    ],
    welcomeMessage: "Greetings. I am your Longitudinal Memory & Pattern Tracker. I search your past journal entries in Firestore to identify recurring emotional cycles, behavioral themes, and historical breakthroughs. Ask me to compare your thoughts with past reflections!",
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
      'What is an alternative, balanced interpretation?',
      'Am I catastrophizing the worst-case scenario?',
      'Where am I placing unrealistic "shoulds" on myself?',
      'What is within my control, and what must I release?',
      'How can I see this struggle as a catalyst for growth?',
      'What evidence contradicts my harsh inner critic?',
      'What kindness can I offer myself in this difficult moment?',
    ],
    welcomeMessage: "Hello. I am your Cognitive Reframing Companion. I compassionately illuminate cognitive traps (all-or-nothing thinking, catastrophizing, harsh expectations) and suggest balanced, empowering alternative perspectives. Share a thought you'd like to reframe.",
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
      'What unexpressed emotion needs a voice right now?',
      'If I had complete trust in the future, what would I do next?',
      'What part of this experience feels unresolved?',
      'What would bring a sense of closure or peace to this day?',
      'How does this moment shape the person I am becoming?',
      'What quiet victory did I achieve today that went unnoticed?',
      'What wisdom would my future self offer to me right now?',
    ],
    welcomeMessage: "Welcome. I am your Guided Follow-Up Inquirer. I craft tailored, progressive questions to guide your subsequent journaling sessions and spark meaningful self-inquiry. How can I prompt your exploration today?",
  },
};

/**
 * Samples count random prompts from the 10 hardcoded pool for the specified cognitive mode.
 * Uses Fisher-Yates shuffle to guarantee uniform randomness.
 */
export function getRandomPromptsForMode(mode: AgentPersonaMode, count = 3): string[] {
  const pool = PERSONA_CONFIGS[mode]?.quickPrompts || [];
  if (pool.length <= count) return [...pool];
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

/**
 * Generates instant content-aware prompts grounded in the user's reflection text
 * and strictly tailored to the chosen cognitive persona mode.
 */
export function getContentGroundedPromptsForMode(
  mode: AgentPersonaMode,
  content: string,
  count = 3
): string[] {
  const trimmed = content.trim();
  const firstClause = trimmed.split('.')[0].trim().slice(0, 60);
  const snippet = firstClause || trimmed.slice(0, 60);

  const modeTemplates: Record<AgentPersonaMode, string[]> = {
    socratic: [
      `When reflecting on "${snippet}...", what unexamined assumption might you be making?`,
      `What unspoken expectation or fear is quietly driving your reaction to this?`,
      `If you stepped completely outside your ego, what core truth is surfacing here?`,
      `Whose judgment or approval are you anticipating regarding "${snippet}"?`,
      `What belief about your own capacity is being tested right now?`,
    ],
    action_momentum: [
      `What is a friction-free 5-minute micro-action you can take regarding "${snippet}"?`,
      `What is the single highest-leverage step you can complete within the next 24 hours?`,
      `Where can you set a firm boundary or remove friction around this today?`,
      `What does minimum viable progress look like on this challenge before tonight?`,
      `What is one decision or commitment you will finalize today?`,
    ],
    pattern_memory: [
      `Have you felt this way before in past entries when facing something like "${snippet}"?`,
      `What historical pattern or emotional cycle might be repeating around this situation?`,
      `When you faced a similar challenge previously, what breakthrough helped you navigate it?`,
      `How does your reaction here compare with past reflections during stressful periods?`,
      `What past lesson or personal strength have you forgotten to apply here?`,
    ],
    cognitive_reframing: [
      `How might you be viewing "${snippet}" through an all-or-nothing or catastrophic lens?`,
      `What would a compassionate, wise friend tell you about this situation right now?`,
      `What is an alternative, more balanced interpretation of what you wrote?`,
      `What evidence contradicts your harsh inner critic in this reflection?`,
      `How can this moment of friction be viewed as a catalyst for growth?`,
    ],
    guided_inquiry: [
      `If you could explore one deeper question about "${snippet}", what would it be?`,
      `What unexpressed emotion or realization needs a voice in your next journal entry?`,
      `If you had complete trust in your path, what would your next step look like?`,
      `What part of this experience feels unresolved or asking for more reflection?`,
      `What quiet victory in this reflection went unnoticed today?`,
    ],
  };

  const pool = modeTemplates[mode] || modeTemplates.socratic;
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

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
