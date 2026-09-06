import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { 
  Sparkles, 
  ShieldCheck, 
  Lock, 
  BrainCircuit, 
  Compass, 
  ArrowRight, 
  KeyRound, 
  Terminal
} from "lucide-react";

export const LandingPage: React.FC = () => {
  const { signInWithGoogle, signInDevMock, loading, error, clearError } = useAuth();
  const [activeTab, setActiveTab] = useState<"socratic" | "action" | "pattern">("socratic");

  const previews = {
    socratic: {
      title: "Socratic Cognitive Mirror",
      subtitle: "Gently uncovers unexamined beliefs and challenges cognitive traps.",
      agentThoughts: [
        "Analyzing entry tone: Detected anxiety and high self-criticism.",
        "Tool invocation: tool_analyze_cognitive_framing(mode='socratic')",
        "Identified cognitive pattern: All-or-nothing thinking ('If I don't nail this demo, my career is stalled').",
      ],
      response:
        "“Notice the high standard you are holding yourself to: *'If I don't nail this, everything is stalled.'* What would it feel like to redefine success today not by perfection, but by whether you clearly communicated your core insight?”",
    },
    action: {
      title: "Action Steps & Momentum Strategist",
      subtitle: "Translates abstract emotional overwhelm into concrete micro-actions.",
      agentThoughts: [
        "Parsing emotional valence: 'Overwhelmed' state logged.",
        "Tool invocation: tool_generate_actionable_milestones(window='24h')",
        "Synthesizing 3 bounded steps with lowest cognitive friction.",
      ],
      response:
        "“Let's break this paralysis into three immediate steps:\n1. **Next 10 minutes**: Write down the single most critical slide.\n2. **Before 5 PM**: Do one dry run without pausing.\n3. **Mindset Shift**: Give yourself permission to be 80% ready today.”",
    },
    pattern: {
      title: "Longitudinal Pattern Discovery",
      subtitle: "Correlates current reflections with episodic memories across time.",
      agentThoughts: [
        "Calling tool: tool_search_journal_memory(query='public speaking anxiety')",
        "Matched 3 past reflections from October and January across your private journal memory",
        "Correlating mood progression: High anxiety preceding positive outcomes.",
      ],
      response:
        "“I noticed a recurring pattern: on October 14th before your company all-hands, you logged a nearly identical feeling of self-doubt. The next day, you wrote that the discussion flowed naturally. You have navigated this exact sensation before.”",
    },
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-6 pt-4">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold shadow-sm">
          <BrainCircuit className="h-4 w-4" />
          <span>Powered by Autonomous Gemini 3.8 Flash Agents</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-950 dark:text-white">
          A Mirror for Your Thoughts.{" "}
          <span className="bg-gradient-to-r from-indigo-600 via-sky-500 to-emerald-500 bg-clip-text text-transparent">
            An Agent for Your Growth.
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
          MindMirror pairs distraction-free personal journaling with an autonomous cognitive agent that remembers your past reflections, analyzes cognitive distortions, and uncovers longitudinal behavioral patterns.
        </p>

        {/* Error notification banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-rose-700 dark:text-rose-300 text-sm flex items-start justify-between gap-3 text-left">
            <p>{error}</p>
            <button onClick={clearError} className="font-bold hover:opacity-80">×</button>
          </div>
        )}

        {/* Action Triggers */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          <button
            onClick={() => signInWithGoogle()}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-base shadow-lg shadow-indigo-600/25 hover:shadow-indigo-600/40 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? (
              <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.4 8.9 5 12 5z" />
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
                <path fill="#FBBC05" d="M5.3 14.7c-.2-.7-.4-1.5-.4-2.4 0-.8.1-1.6.4-2.4L1.6 7c-.8 1.6-1.3 3.4-1.3 5.3s.5 3.7 1.3 5.3l3.7-2.9z" />
                <path fill="#34A853" d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.4-6.7-5.3L1.6 16C3.5 19.8 7.4 23 12 23z" />
              </svg>
            )}
            <span>Continue with Google</span>
            <ArrowRight className="h-4 w-4" />
          </button>

          {/* Instant Dev Mode Explorer */}
          <button
            onClick={() => signInDevMock("evaluator-01")}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium text-sm border border-slate-300 dark:border-slate-700 transition-colors"
          >
            <KeyRound className="h-4 w-4 text-indigo-500" />
            <span>Instant Demo Explorer</span>
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          No credit card required. Private Firestore encryption. Zero prompt training on personal entries.
        </p>
      </div>

      {/* Interactive Agent Previews */}
      <div className="my-16 max-w-4xl mx-auto w-full">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Experience the Autonomous Cognitive Modes
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Switch tabs to see how the agent reasons, calls tools, and synthesizes perspective:
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex justify-center p-1.5 rounded-2xl bg-slate-200/80 dark:bg-slate-800/80 max-w-xl mx-auto mb-6 backdrop-blur-sm">
          {(["socratic", "action", "pattern"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === tab
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {tab === "socratic" && "Socratic Mirror"}
              {tab === "action" && "Action Momentum"}
              {tab === "pattern" && "Memory & Patterns"}
            </button>
          ))}
        </div>

        {/* Preview Card */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {previews[activeTab].title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {previews[activeTab].subtitle}
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Live Simulation
            </span>
          </div>

          <div className="p-6 space-y-4">
            {/* Agent Internal Thought / Tool Execution Trace */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-200 text-xs font-mono space-y-2 border border-slate-800 shadow-inner">
              <div className="flex items-center gap-2 text-slate-400 border-b border-slate-800 pb-2">
                <Terminal className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-semibold text-[11px] text-emerald-400">Agent ReAct Reasoning Trace (Server-Side)</span>
              </div>
              {previews[activeTab].agentThoughts.map((thought, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-indigo-400 select-none">❯</span>
                  <span className={thought.includes("Tool invocation") ? "text-sky-300 font-semibold" : "text-slate-300"}>
                    {thought}
                  </span>
                </div>
              ))}
            </div>

            {/* Agent Response */}
            <div className="p-5 rounded-xl bg-indigo-50/50 dark:bg-slate-800/50 border border-indigo-100 dark:border-slate-700/60">
              <div className="flex items-center gap-2 mb-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                <BrainCircuit className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Agent Reflection</span>
              </div>
              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed italic">
                {previews[activeTab].response}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Value Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto w-full mb-16">
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-200 dark:border-emerald-800">
            <KeyRound className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">Zero Client Secret Exposure</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            All AI interactions and Maps lookups route strictly through an authenticated Python (FastAPI) gateway. No private keys ever touch the browser bundle.
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800">
            <Lock className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">Owner-Only Firestore Isolation</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Entries and agent chat turns are strictly partitioned per user account with verified authentication enforcing owner-only access.
          </p>
        </div>

        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
          <div className="h-10 w-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-200 dark:border-sky-800">
            <Compass className="h-5 w-5" />
          </div>
          <h3 className="font-bold text-base text-slate-900 dark:text-white">Geo-Spatial Privacy Shield</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Coordinates are validated and automatically truncated to 4 decimal places (~11m precision), stripping extraneous tracking telemetry before persistence.
          </p>
        </div>
      </div>

      {/* Threat Model Transparency */}
      <div className="max-w-4xl mx-auto w-full p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Agentic Threat Model Transparency (The 5 Threat Zones)
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-900 dark:text-slate-200">1. Input Surfaces</p>
            <p className="text-[11px] mt-1">Pydantic schemas enforce type bounds & null-safe parsing.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-900 dark:text-slate-200">2. Planning / Prompt</p>
            <p className="text-[11px] mt-1">Context isolation ensures journal text never overrides system instructions.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-900 dark:text-slate-200">3. Tool Execution</p>
            <p className="text-[11px] mt-1">Server-side execution only with model fallback ladder.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-900 dark:text-slate-200">4. Memory & State</p>
            <p className="text-[11px] mt-1">Firestore rules isolate users. Undefined values sanitized.</p>
          </div>
          <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-900 dark:text-slate-200">5. Inter-System</p>
            <p className="text-[11px] mt-1">Firebase JWT token verification at every boundary.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
