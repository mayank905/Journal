import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Header, type ActiveTab } from "./components/Header";
import { LandingPage } from "./components/LandingPage";
import { JournalEditor } from "./components/JournalEditor";
import { HistoryArchive } from "./components/HistoryArchive";
import { InsightsDashboard } from "./components/InsightsDashboard";
import { AdminDashboard } from "./components/AdminDashboard";
import { FlashbackBanner } from "./components/FlashbackBanner";
import { Shield, CheckCircle2 } from "lucide-react";
import { subscribeToUserEntries } from "./lib/entriesApi";
import type { JournalEntry } from "./types/entry";


const MainContent: React.FC<{ darkMode: boolean; setDarkMode: React.Dispatch<React.SetStateAction<boolean>> }> = ({ darkMode, setDarkMode }) => {
  const { user, idToken, loading } = useAuth();
  const [backendHealth, setBackendHealth] = useState<any>(null);

  // Tab & selection state
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');
  const [selectedEntryForEditor, setSelectedEntryForEditor] = useState<JournalEntry | null>(null);
  const [activeFilterTag, setActiveFilterTag] = useState<string | null>(null);

  // Global live entries for analytics & navigation
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    fetch("/api/health")
      .then(res => res.json())
      .then(data => setBackendHealth(data))
      .catch(err => console.warn("Backend health check:", err));
  }, []);

  // Subscribe to live entries for insights calculations
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToUserEntries(user.uid, idToken, (updated) => {
      setEntries(updated);
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user, idToken]);

  // Open entry in editor
  const handleOpenEntryInEditor = (entry: JournalEntry) => {
    setSelectedEntryForEditor(entry);
    setActiveTab('editor');
  };

  // Filter History from Insights tag click
  const handleFilterByTag = (tag: string) => {
    setActiveFilterTag(tag);
    setActiveTab('history');
  };

  // Compare flashback entry with AI in editor
  const handleAskAgentToCompare = (entry: JournalEntry) => {
    setSelectedEntryForEditor(entry);
    setActiveTab('editor');
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            Initializing Secure Cognition Session...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Header 
        darkMode={darkMode} 
        setDarkMode={setDarkMode} 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <main className="flex-1">
        {!user ? (
          <LandingPage />
        ) : (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            {/* Authenticated Header Banner */}
            <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white shadow-xl relative overflow-hidden border border-indigo-800/40">
              <div className="relative z-10 max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                  <Shield className="h-3.5 w-3.5" />
                  <span>Authenticated Session Active & Partitioned</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Welcome back, {user.displayName || "Explorer"}!
                </h2>

                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
                  Your private reflection workspace is encrypted and securely isolated to your account. All agent interactions route through the hardened FastAPI security gateway.
                </p>

                {/* Gateway Status Indicators */}
                <div className="pt-1 flex flex-wrap items-center gap-2.5 text-[11px] sm:text-xs">
                  <div className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Gateway: {backendHealth?.status === "ok" ? "Connected" : "Connecting..."}</span>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Model: Gemini 3.8 Flash (Fallback Ready)</span>
                  </div>
                  <div className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Firestore Rules: Strict Owner-Bound</span>
                  </div>
                </div>
              </div>

              {/* Decorative gradient orb */}
              <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
              <div className="absolute right-10 -bottom-10 w-60 h-60 rounded-full bg-sky-500/20 blur-3xl pointer-events-none" />
            </div>

            {/* Longitudinal Flashback Banner ("On This Day" Memory Recall) */}
            <FlashbackBanner 
              onOpenEntry={handleOpenEntryInEditor}
              onAskAgentToCompare={handleAskAgentToCompare}
            />

            {/* Active Tab View */}
            <div className="pt-2">
              {activeTab === 'editor' && (
                <JournalEditor 
                  initialEntry={selectedEntryForEditor}
                  onEntrySaved={(saved) => {
                    setEntries(prev => {
                      const idx = prev.findIndex(e => e.id === saved.id);
                      if (idx >= 0) {
                        const copy = [...prev];
                        copy[idx] = saved;
                        return copy;
                      }
                      return [saved, ...prev];
                    });
                  }}
                />
              )}

              {activeTab === 'history' && (
                <HistoryArchive 
                  onOpenEntry={handleOpenEntryInEditor}
                  initialFilterTag={activeFilterTag}
                  onClearInitialTag={() => setActiveFilterTag(null)}
                />
              )}

              {activeTab === 'insights' && (
                <InsightsDashboard 
                  entries={entries}
                  onOpenEntry={handleOpenEntryInEditor}
                  onFilterByTag={handleFilterByTag}
                />
              )}

              {activeTab === 'admin' && (
                <AdminDashboard />
              )}
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© 2026 MindMirror. Built for the Hack2Skill APAC Ideathon Challenge.</p>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Python (FastAPI)</span>
            <span>•</span>
            <span>React 19 & Tailwind CSS v4</span>
            <span>•</span>
            <span>Gemini 3.8 Flash</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("mindmirror_theme");
    if (saved) return saved === "dark";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("mindmirror_theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("mindmirror_theme", "light");
    }
  }, [darkMode]);

  return (
    <AuthProvider>
      <MainContent darkMode={darkMode} setDarkMode={setDarkMode} />
    </AuthProvider>
  );
}

export default App;
