import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, 
  Send, 
  Sparkles, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Check, 
  FileText, 
  Wrench, 
  Eye, 
  Brain, 
  Layers, 
  X,
  ShieldCheck,
  Search,
  Lightbulb,
  RefreshCw
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { 
  PERSONA_CONFIGS, 
  type AgentPersonaMode, 
  type AgentTraceStep, 
  type AgentChatMessage 
} from '../types/agent';
import type { EntrySynthesis } from '../types/entry';
import { 
  streamAgentInteraction, 
  fetchPromptIdeas,
  synthesizeReflection 
} from '../lib/agentApi';

interface AgentChatProps {
  entryTitle: string;
  entryContent: string;
  entryMood: string;
  entryTags: string[];
  initialDialogueHistory?: AgentChatMessage[];
  initialSynthesis?: EntrySynthesis | null;
  onInsertIntoJournal: (textToInsert: string) => void;
  onApplyTitle?: (titleToApply: string) => void;
  onSaveSynthesis?: (synthesis: EntrySynthesis) => void;
  onDialogueHistoryChange?: (history: AgentChatMessage[]) => void;
  onClose?: () => void;
}

export const AgentChat: React.FC<AgentChatProps> = ({
  entryTitle,
  entryContent,
  entryMood,
  entryTags,
  initialDialogueHistory,
  initialSynthesis,
  onInsertIntoJournal,
  onApplyTitle,
  onSaveSynthesis,
  onDialogueHistoryChange,
  onClose,
}) => {
  const { idToken } = useAuth();

  const [activeMode, setActiveMode] = useState<AgentPersonaMode>('socratic');
  const [messages, setMessages] = useState<AgentChatMessage[]>(() => {
    if (initialDialogueHistory && initialDialogueHistory.length > 0) {
      return initialDialogueHistory;
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content: "Hello. I am your autonomous cognitive reflection companion. I can search past memories, detect cognitive framing traps, or formulate grounding follow-ups. How can I reflect with you today?",
        mode: 'socratic',
        modelUsed: 'gemini-3.8-flash',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    ];
  });

  const [inputText, setInputText] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [currentTraces, setCurrentTraces] = useState<AgentTraceStep[]>([]);
  const [showTracesMap, setShowTracesMap] = useState<Record<string, boolean>>({});
  const [promptChips, setPromptChips] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Executive Synthesis State
  const [synthesis, setSynthesis] = useState<EntrySynthesis | null>(initialSynthesis || null);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [appliedTitle, setAppliedTitle] = useState<boolean>(false);
  const [insertedTakeaways, setInsertedTakeaways] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activePersona = PERSONA_CONFIGS[activeMode];

  // Notify parent of dialogue history updates
  useEffect(() => {
    onDialogueHistoryChange?.(messages);
  }, [messages, onDialogueHistoryChange]);

  // Scroll to bottom when messages or traces update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentTraces]);

  // Fetch prompt ideas when mode or mood changes
  useEffect(() => {
    let isMounted = true;
    fetchPromptIdeas(entryMood, activeMode, idToken).then((prompts) => {
      if (isMounted && prompts.length > 0) {
        setPromptChips(prompts.slice(0, 3));
      } else if (isMounted) {
        setPromptChips(activePersona.quickPrompts);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [activeMode, entryMood, idToken, activePersona]);

  // Handle On-Demand Reflection Synthesis
  const handleTriggerSynthesis = async () => {
    if (!entryContent.trim()) {
      alert("Please write some reflection thoughts before synthesizing.");
      return;
    }
    setIsSynthesizing(true);
    try {
      const result = await synthesizeReflection(entryContent, entryTitle, idToken);
      const synthObj: EntrySynthesis = {
        suggestedTitle: result.suggested_title,
        summary: result.summary || result.summary,
        takeaways: result.takeaways || [],
      };
      setSynthesis(synthObj);
      onSaveSynthesis?.(synthObj);
      setAppliedTitle(false);
      setInsertedTakeaways(false);
    } catch (err: any) {
      console.warn("Synthesis failed:", err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  // 1-Click Apply Title
  const handleApplyTitleClick = () => {
    if (synthesis?.suggestedTitle && onApplyTitle) {
      onApplyTitle(synthesis.suggestedTitle);
      setAppliedTitle(true);
      setTimeout(() => setAppliedTitle(false), 3000);
    }
  };

  // 1-Click Insert Takeaways
  const handleInsertTakeawaysClick = () => {
    if (synthesis?.takeaways && synthesis.takeaways.length > 0) {
      const formatted = `\n\n### 🎯 Key Breakthrough Takeaways\n${synthesis.takeaways.map(t => `- ${t}`).join('\n')}\n`;
      onInsertIntoJournal(formatted);
      setInsertedTakeaways(true);
      setTimeout(() => setInsertedTakeaways(false), 3000);
    }
  };

  // Send interaction message
  const handleSendMessage = async (customMessage?: string) => {
    const textToSend = customMessage || inputText.trim();
    if (!textToSend || isGenerating) return;

    setInputText('');
    const userMsgId = `user_${Date.now()}`;
    const assistantMsgId = `assistant_${Date.now()}`;

    const newMessages: AgentChatMessage[] = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        content: textToSend,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }
    ];
    setMessages(newMessages);
    setIsGenerating(true);
    setCurrentTraces([]);

    let accumulatedContent = '';
    const capturedTraces: AgentTraceStep[] = [];

    const dialogueHistory = newMessages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    await streamAgentInteraction(
      {
        message: textToSend,
        mode: activeMode,
        entry_title: entryTitle,
        entry_content: entryContent,
        entry_mood: entryMood,
        entry_tags: entryTags,
        dialogue_history: dialogueHistory,
      },
      idToken,
      {
        onTrace: (trace) => {
          capturedTraces.push(trace);
          setCurrentTraces([...capturedTraces]);
        },
        onToken: (token) => {
          accumulatedContent += token;
          setMessages((prev) => {
            const exists = prev.find((m) => m.id === assistantMsgId);
            if (exists) {
              return prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: accumulatedContent } : m
              );
            } else {
              return [
                ...prev,
                {
                  id: assistantMsgId,
                  role: 'assistant',
                  content: accumulatedContent,
                  mode: activeMode,
                  traceSteps: capturedTraces,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ];
            }
          });
        },
        onDone: (data) => {
          setIsGenerating(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: accumulatedContent,
                    traceSteps: [...capturedTraces],
                    modelUsed: data.modelUsed,
                  }
                : m
            )
          );
          setShowTracesMap((m) => ({ ...m, [assistantMsgId]: true }));
          setCurrentTraces([]);
        },
        onError: (err) => {
          setIsGenerating(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `err_${Date.now()}`,
              role: 'assistant',
              content: `⚠️ Note: ${err}. Please try rephrasing your inquiry.`,
              mode: activeMode,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            },
          ]);
          setCurrentTraces([]);
        },
      }
    );
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleTraceVisibility = (msgId: string) => {
    setShowTracesMap((prev) => ({ ...prev, [msgId]: !prev[msgId] }));
  };

  return (
    <div className="flex flex-col h-[740px] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-md">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                MindMirror Autonomous Agent
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 font-semibold">
                <ShieldCheck className="h-3 w-3" />
                <span>Zero Client Keys</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ReAct Loop ⇄ Tool Calling ⇄ Gemini 3.8 Flash Fallback Ready
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* On-Demand Synthesis Button */}
          <button
            onClick={handleTriggerSynthesis}
            disabled={isSynthesizing || !entryContent.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold border border-indigo-200 dark:border-indigo-800 transition-all active:scale-95 disabled:opacity-40"
            title="Generate executive summary, takeaways, and title"
          >
            {isSynthesizing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
            )}
            <span>Synthesize</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Close agent assistant"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Executive Synthesis Card (if available) */}
      {synthesis && (
        <div className="p-4 bg-gradient-to-br from-indigo-50/70 via-purple-50/50 to-white dark:from-slate-800/90 dark:via-indigo-950/40 dark:to-slate-900 border-b border-indigo-100 dark:border-indigo-900/60 text-xs space-y-2.5 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-bold text-indigo-900 dark:text-indigo-200">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              <span>Executive Synthesis</span>
            </span>
            <button
              onClick={() => setSynthesis(null)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Dismiss card"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Suggested Title & 1-Click Apply */}
          {synthesis.suggestedTitle && (
            <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800/80 border border-indigo-200/80 dark:border-indigo-800">
              <div className="truncate pr-2">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Suggested Title:</span>
                <p className="font-bold text-slate-800 dark:text-white truncate">"{synthesis.suggestedTitle}"</p>
              </div>
              <button
                onClick={handleApplyTitleClick}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold shrink-0 transition-all active:scale-95"
              >
                {appliedTitle ? 'Applied ✓' : 'Apply Title'}
              </button>
            </div>
          )}

          {/* Summary */}
          {synthesis.summary && (
            <p className="text-slate-700 dark:text-slate-300 italic text-[11px] leading-relaxed">
              "{synthesis.summary}"
            </p>
          )}

          {/* Takeaways & 1-Click Insert */}
          {synthesis.takeaways && synthesis.takeaways.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                <span>Key Breakthroughs:</span>
                <button
                  onClick={handleInsertTakeawaysClick}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 text-[11px]"
                >
                  <FileText className="h-3 w-3" />
                  <span>{insertedTakeaways ? 'Inserted ✓' : 'Insert Takeaways into Entry'}</span>
                </button>
              </div>
              <ul className="list-disc list-inside text-[11px] text-slate-600 dark:text-slate-300 space-y-0.5">
                {synthesis.takeaways.map((t, idx) => (
                  <li key={idx}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Persona Mode Switcher Tray */}
      <div className="px-4 py-2.5 bg-slate-100/60 dark:bg-slate-900/60 border-b border-slate-200/80 dark:border-slate-800 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
        {(Object.keys(PERSONA_CONFIGS) as AgentPersonaMode[]).map((modeKey) => {
          const cfg = PERSONA_CONFIGS[modeKey];
          const isSelected = activeMode === modeKey;
          return (
            <button
              key={modeKey}
              onClick={() => setActiveMode(modeKey)}
              className={`whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700'
              }`}
            >
              <span>{cfg.emoji}</span>
              <span>{cfg.shortTitle}</span>
            </button>
          );
        })}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          // Check if memory was consulted in this turn's trace steps
          const hasMemoryConsulted = msg.traceSteps?.some(
            (s) => (s.data && s.data.memory_consulted) || s.title.toLowerCase().includes('memories')
          );
          const memoryMatches = msg.traceSteps?.find(
            (s) => s.data && s.data.memory_consulted
          )?.data?.matches_found;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              {/* Ticket 04: "Consulted past memories" Indicator Badge */}
              {msg.role === 'assistant' && hasMemoryConsulted && (
                <div className="mb-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[10px] font-semibold animate-fade-in shadow-xs">
                  <Search className="h-3 w-3 text-purple-500" />
                  <span>
                    Consulted past memories archive ({memoryMatches ?? 1} historical reflections)
                  </span>
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={`max-w-[88%] rounded-2xl p-4 text-xs leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80 rounded-bl-none'
                }`}
              >
                {/* Header for Assistant */}
                {msg.role === 'assistant' && (
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                      <Sparkles className="h-3 w-3" />
                      {PERSONA_CONFIGS[msg.mode || activeMode]?.title}
                    </span>
                    <span>{msg.modelUsed || 'gemini-3.8-flash'}</span>
                  </div>
                )}

                {/* Message Body */}
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {/* Expandable Reasoning Trace */}
                {msg.role === 'assistant' && msg.traceSteps && msg.traceSteps.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <button
                      onClick={() => toggleTraceVisibility(msg.id)}
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      <Layers className="h-3 w-3" />
                      <span>Agent Reasoning Trace ({msg.traceSteps.length} steps)</span>
                      {showTracesMap[msg.id] ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>

                    {showTracesMap[msg.id] && (
                      <div className="mt-2 space-y-1.5 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 font-mono text-[10px]">
                        {msg.traceSteps.map((step, sIdx) => (
                          <div key={sIdx} className="flex items-start gap-2 text-slate-600 dark:text-slate-300">
                            {step.step_type === 'thought' && <Brain className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />}
                            {step.step_type === 'tool_call' && <Wrench className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />}
                            {step.step_type === 'observation' && <Eye className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />}
                            {step.step_type === 'synthesis' && <Sparkles className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />}
                            <div>
                              <span className="font-bold text-slate-800 dark:text-slate-200">{step.title}</span>
                              {step.detail && <p className="opacity-80 mt-0.5">{step.detail}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons (Available once user starts chat with agent) */}
                {msg.role === 'assistant' && msg.id !== 'welcome' && (
                  <div className="mt-3 pt-2 flex items-center gap-2 text-[11px]">
                    <button
                      onClick={() => onInsertIntoJournal(msg.content)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 font-medium transition-all active:scale-95"
                    >
                      <FileText className="h-3 w-3 text-indigo-500" />
                      <span>Insert into Journal</span>
                    </button>

                    <button
                      onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 font-medium transition-all active:scale-95"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3 text-slate-400" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
            </div>
          );
        })}

        {/* Live Active Streaming Trace Indicator */}
        {isGenerating && currentTraces.length > 0 && (
          <div className="p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 space-y-1.5 animate-pulse">
            <div className="flex items-center gap-2 font-bold">
              <Brain className="h-4 w-4 text-indigo-500 animate-spin" />
              <span>Agent ReAct Loop Executing...</span>
            </div>
            {currentTraces.map((tr, idx) => (
              <div key={idx} className="text-[11px] font-mono pl-6 text-slate-600 dark:text-slate-300">
                • {tr.title}
              </div>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Chips & Inspiration Trigger */}
      <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-slate-400 mr-1 flex items-center gap-1 font-medium">
          <Lightbulb className="h-3 w-3 text-amber-500" />
          <span>Suggestions:</span>
        </span>
        {promptChips.map((chip, idx) => (
          <button
            key={idx}
            onClick={() => handleSendMessage(chip)}
            disabled={isGenerating}
            className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-300 hover:text-indigo-600 border border-slate-200 dark:border-slate-700 transition-all truncate max-w-[280px]"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Ask ${activePersona.shortTitle} about your reflection...`}
            disabled={isGenerating}
            className="flex-1 px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 text-xs border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isGenerating}
            className="p-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 shadow-sm transition-all active:scale-95 shrink-0"
            title="Send prompt to agent"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
