import React, { useState, useEffect } from 'react';
import { 
  X, 
  Bell, 
  Send, 
  Trash2, 
  ShieldCheck, 
  CheckCircle2, 
  AlertTriangle, 
  MessageSquare,
  Mail,
  Plus,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  fetchUserConfigs,
  createNotificationConfig,
  deleteNotificationConfig,
  testNotificationChannel,
  fetchNotificationLogs,
  fetchNotificationDirective
} from '../lib/notificationsApi';
import type { 
  NotificationConfig, 
  NotificationConfigCreateInput, 
  NotificationLog, 
  ChannelType, 
  TriggerType 
} from '../types/notification';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({ isOpen, onClose }) => {
  const { idToken } = useAuth();
  const [activeTab, setActiveTab] = useState<'channels' | 'add' | 'logs' | 'directive'>('channels');

  // Data states
  const [configs, setConfigs] = useState<NotificationConfig[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [directiveText, setDirectiveText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for Add Integration
  const [newChannelType, setNewChannelType] = useState<ChannelType>('slack');
  const [newName, setNewName] = useState<string>('');
  const [newDestination, setNewDestination] = useState<string>('');
  const [newSecretToken, setNewSecretToken] = useState<string>('');
  const [newTriggerType, setNewTriggerType] = useState<TriggerType>('mood_match');
  const [selectedMoods, setSelectedMoods] = useState<string[]>(['Anxious', 'Overwhelmed']);
  const [targetTagsInput, setTargetTagsInput] = useState<string>('#Milestone, #Breakthrough');
  const [minWords, setMinWords] = useState<number>(50);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const refreshData = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const [cfgs, lgs, dir] = await Promise.all([
        fetchUserConfigs(idToken),
        fetchNotificationLogs(idToken),
        fetchNotificationDirective(idToken)
      ]);
      setConfigs(cfgs);
      setLogs(lgs);
      setDirectiveText(dir.directive);
    } catch (err: any) {
      console.warn("Failed to load notifications data:", err);
      setStatusMessage({ type: 'error', text: err.message || 'Error fetching notification settings.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshData();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestChannel = async (
    channelType?: ChannelType, 
    destination?: string, 
    secret?: string,
    configId?: string
  ) => {
    setTestResult('Sending test payload...');
    try {
      const res = await testNotificationChannel(channelType, destination, secret, undefined, idToken, configId);
      setTestResult(`Success: ${res.details || 'Dispatched successfully'}`);
      refreshData();
    } catch (err: any) {
      setTestResult(`Test failed: ${err.message}`);
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!window.confirm('Delete this notification destination?')) return;
    try {
      await deleteNotificationConfig(configId, idToken);
      setConfigs(prev => prev.filter(c => c.id !== configId));
      setStatusMessage({ type: 'success', text: 'Notification channel deleted.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to delete channel.' });
    }
  };

  const handleCreateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatusMessage(null);
    setTestResult(null);

    const triggerCriteria: Record<string, any> = {};
    if (newTriggerType === 'mood_match') {
      triggerCriteria.moods = selectedMoods;
    } else if (newTriggerType === 'tag_match') {
      triggerCriteria.tags = targetTagsInput.split(',').map(s => s.trim()).filter(Boolean);
    } else if (newTriggerType === 'milestone_word_count') {
      triggerCriteria.min_words = minWords;
    }

    const payload: NotificationConfigCreateInput = {
      name: newName.trim() || `${newChannelType.toUpperCase()} Alerts`,
      channel_type: newChannelType,
      is_enabled: true,
      trigger_type: newTriggerType,
      trigger_criteria: triggerCriteria,
      target_destination: newDestination.trim(),
      secret_token: newSecretToken.trim() || undefined,
    };

    try {
      const created = await createNotificationConfig(payload, idToken);
      setConfigs(prev => [...prev, created]);
      setStatusMessage({ type: 'success', text: `Successfully registered ${created.name}!` });
      // Reset form
      setNewName('');
      setNewDestination('');
      setNewSecretToken('');
      setActiveTab('channels');
      refreshData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Validation or SSRF guard rejection.' });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMoodSelection = (m: string) => {
    setSelectedMoods(prev => 
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-indigo-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-200 dark:border-indigo-800/60">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>External Notifications & Alerts</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  SSRF Guard Active
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Notify Slack, Discord, or Email when specific reflections & cognitive patterns are parsed.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 gap-2 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('channels')}
            className={`py-3 px-3 border-b-2 transition-all ${
              activeTab === 'channels'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Active Channels ({configs.length})
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'add'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Integration</span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-3 border-b-2 transition-all ${
              activeTab === 'logs'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Delivery Logs ({logs.length})
          </button>
          <button
            onClick={() => setActiveTab('directive')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1 ${
              activeTab === 'directive'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>API Directive</span>
          </button>
        </div>

        {/* Status Alerts */}
        {statusMessage && (
          <div className={`mx-6 mt-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
            statusMessage.type === 'success' 
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB 1: ACTIVE CHANNELS */}
          {activeTab === 'channels' && (
            <div className="space-y-4">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
                  <span className="text-xs">Loading channels...</span>
                </div>
              ) : configs.length === 0 ? (
                <div className="py-12 text-center space-y-3">
                  <div className="h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 mx-auto flex items-center justify-center">
                    <Bell className="h-6 w-6 opacity-60" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">No external channels connected yet</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Configure a Slack Incoming Webhook, Discord Webhook, or Email to receive real-time reflections when specific moods or tags are parsed.
                  </p>
                  <button
                    onClick={() => setActiveTab('add')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-all shadow-sm"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Connect First Channel</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {configs.map(cfg => (
                    <div 
                      key={cfg.id}
                      className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            cfg.channel_type === 'slack'
                              ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300'
                              : cfg.channel_type === 'discord'
                              ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300'
                              : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300'
                          }`}>
                            {cfg.channel_type}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                            {cfg.name}
                          </h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            Trigger: {cfg.trigger_type}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400">
                          Destination: {cfg.target_destination_masked}
                        </p>
                        {cfg.trigger_criteria && Object.keys(cfg.trigger_criteria).length > 0 && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Criteria: {JSON.stringify(cfg.trigger_criteria)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleTestChannel(cfg.channel_type, undefined, undefined, cfg.id)}
                          className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors flex items-center gap-1.5"
                          title="Send test alert"
                        >
                          <Send className="h-3 w-3 text-indigo-500" />
                          <span>Test</span>
                        </button>
                        <button
                          onClick={() => handleDeleteConfig(cfg.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Delete configuration"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ADD INTEGRATION */}
          {activeTab === 'add' && (
            <form onSubmit={handleCreateConfig} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setNewChannelType('slack')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    newChannelType === 'slack'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <MessageSquare className="h-5 w-5 text-amber-500 mb-1" />
                  <div className="font-bold text-xs text-slate-900 dark:text-white">Slack Webhook</div>
                  <div className="text-[10px] text-slate-500">Incoming webhook integration</div>
                </button>

                <button
                  type="button"
                  onClick={() => setNewChannelType('discord')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    newChannelType === 'discord'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <MessageSquare className="h-5 w-5 text-indigo-500 mb-1" />
                  <div className="font-bold text-xs text-slate-900 dark:text-white">Discord Webhook</div>
                  <div className="text-[10px] text-slate-500">Rich embeds & channel alerts</div>
                </button>

                <button
                  type="button"
                  onClick={() => setNewChannelType('email')}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    newChannelType === 'email'
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <Mail className="h-5 w-5 text-emerald-500 mb-1" />
                  <div className="font-bold text-xs text-slate-900 dark:text-white">Email Digest</div>
                  <div className="text-[10px] text-slate-500">MIME HTML / text alerts</div>
                </button>
              </div>

              {/* Name & Destination */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Channel Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="e.g. My Personal Journal Alerts"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {newChannelType === 'email' ? 'Recipient Email Address' : 'Target Webhook URL (HTTPS Required)'}
                  </label>
                  <input
                    type={newChannelType === 'email' ? 'email' : 'url'}
                    required
                    value={newDestination}
                    onChange={e => setNewDestination(e.target.value)}
                    placeholder={
                      newChannelType === 'slack'
                        ? 'https://hooks.slack.com/services/...'
                        : newChannelType === 'discord'
                        ? 'https://discord.com/api/webhooks/...'
                        : 'user@example.com'
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Protected by SSRF Validator: internal IPs, localhost, and cloud metadata (169.254.169.254) are rejected.
                  </p>
                </div>

                {newChannelType !== 'email' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Optional Secret Bearer Token
                    </label>
                    <input
                      type="password"
                      value={newSecretToken}
                      onChange={e => setNewSecretToken(e.target.value)}
                      placeholder="Optional Authorization Bearer token..."
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Trigger Configuration */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 dark:text-white">
                    When should MindMirror notify you?
                  </label>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                    Parsed Entry Evaluation
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'mood_match', label: 'Mood Match' },
                    { id: 'tag_match', label: 'Tag Match' },
                    { id: 'distortion_detected', label: 'Distortion Detected' },
                    { id: 'milestone_word_count', label: 'Word Count (50+)' },
                    { id: 'always', label: 'Every Parsed Entry' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setNewTriggerType(item.id as TriggerType)}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        newTriggerType === item.id
                          ? 'border-indigo-600 bg-indigo-600 text-white font-semibold'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {/* Sub-Criteria: Mood Selection */}
                {newTriggerType === 'mood_match' && (
                  <div className="pt-2 space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Select monitored emotional states:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {['Anxious', 'Overwhelmed', 'Reflective', 'Grateful', 'Calm', 'Motivated'].map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleMoodSelection(m)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                            selectedMoods.includes(m)
                              ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800'
                              : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-Criteria: Tag Input */}
                {newTriggerType === 'tag_match' && (
                  <div className="pt-2 space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Comma-separated monitored hashtags:
                    </p>
                    <input
                      type="text"
                      value={targetTagsInput}
                      onChange={e => setTargetTagsInput(e.target.value)}
                      placeholder="#Milestone, #Breakthrough, #Urgent"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                  </div>
                )}

                {/* Sub-Criteria: Word Count Milestone */}
                {newTriggerType === 'milestone_word_count' && (
                  <div className="pt-2 space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Minimum words to trigger celebration alert:
                    </p>
                    <input
                      type="number"
                      min={10}
                      max={1000}
                      value={minWords}
                      onChange={e => setMinWords(parseInt(e.target.value) || 50)}
                      className="w-32 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                    />
                  </div>
                )}
              </div>

              {testResult && (
                <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300">
                  {testResult}
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleTestChannel(newChannelType, newDestination, newSecretToken)}
                  disabled={!newDestination || submitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                >
                  Test Connection
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newDestination}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
                >
                  {submitting ? 'Saving Channel...' : 'Save Channel'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: DELIVERY LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              {logs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  No notifications dispatched yet. As you write and save reflections matching your triggers, delivery audit logs will appear here.
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((lg, idx) => (
                    <div 
                      key={idx}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            lg.status === 'delivered' 
                              ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                              : lg.status === 'filtered'
                              ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                              : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                          }`}>
                            {lg.status}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {lg.channel_name || lg.channel_type}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(lg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        <strong>Reason:</strong> {lg.trigger_reason} | <strong>Entry:</strong> "{lg.entry_title}"
                      </p>
                      {lg.details && (
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {lg.details}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: API DIRECTIVE SPECIFICATION */}
          {activeTab === 'directive' && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-900 dark:text-indigo-200">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  <span>Notification API Directive & Security Standards</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                  MindMirror enforces strict zero-leakage credential masking, SSRF filtering, and owner-partitioned storage across all external systems.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 text-slate-100 font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-80 border border-slate-800">
                {directiveText || 'Loading directive specifications...'}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-1.5 text-[11px]">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Partitioned to /users/{'{userId}'}/notification_configs/</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
