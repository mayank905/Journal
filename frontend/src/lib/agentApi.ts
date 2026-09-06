import type { 
  AgentPersonaMode, 
  AgentTraceStep 
} from '../types/agent';

export interface AgentRequestPayload {
  message: string;
  mode: AgentPersonaMode;
  entry_id?: string;
  entry_title?: string;
  entry_content?: string;
  entry_mood?: string;
  entry_tags?: string[];
  dialogue_history?: Array<{ role: string; content: string }>;
}

function getAuthHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function interactWithAgent(
  payload: AgentRequestPayload,
  token: string | null
): Promise<{
  response: string;
  mode: AgentPersonaMode;
  modelUsed: string;
  traceSteps: AgentTraceStep[];
}> {
  const res = await fetch('/api/agent/interact', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Agent interaction failed with status ${res.status}`);
  }

  const data = await res.json();
  return {
    response: data.response,
    mode: data.mode,
    modelUsed: data.model_used,
    traceSteps: data.trace_steps || [],
  };
}

export async function streamAgentInteraction(
  payload: AgentRequestPayload,
  token: string | null,
  callbacks: {
    onTrace: (trace: AgentTraceStep) => void;
    onToken: (tokenText: string) => void;
    onDone: (data: { mode: string; modelUsed: string }) => void;
    onError: (err: string) => void;
  }
): Promise<void> {
  try {
    const res = await fetch('/api/agent/stream', {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      callbacks.onError(err.detail || `Stream connection failed with status ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      callbacks.onError('ReadableStream body not supported');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const block of lines) {
        if (!block.trim()) continue;

        let eventType = 'message';
        let eventDataStr = '';

        const eventLines = block.split('\n');
        for (const line of eventLines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            eventDataStr = line.slice(6).trim();
          }
        }

        if (!eventDataStr) continue;

        try {
          const parsed = JSON.parse(eventDataStr);
          if (eventType === 'trace') {
            callbacks.onTrace(parsed as AgentTraceStep);
          } else if (eventType === 'token') {
            callbacks.onToken(parsed.token || '');
          } else if (eventType === 'done') {
            callbacks.onDone({
              mode: parsed.mode || payload.mode,
              modelUsed: parsed.model_used || 'gemini-3.8-flash',
            });
          } else if (eventType === 'error') {
            callbacks.onError(parsed.error || 'Agent stream reported an error');
          }
        } catch {
          // Ignore JSON parse anomalies in stream fragments
        }
      }
    }
  } catch (err: any) {
    callbacks.onError(err.message || 'Stream connection interrupted');
  }
}

export async function fetchPromptIdeas(
  mood: string,
  mode: AgentPersonaMode,
  token: string | null,
  content?: string,
  title?: string
): Promise<string[]> {
  try {
    const res = await fetch('/api/agent/prompt-ideas', {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify({ mood, mode, content, title }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.prompts || [];
    }
  } catch (err) {
    console.warn('Could not fetch prompt ideas:', err);
  }
  return [];
}

export async function synthesizeReflection(
  content: string,
  title: string,
  token: string | null
): Promise<{

  suggested_title: string;
  summary: string;
  takeaways: string[];
  word_count: number;
}> {
  const res = await fetch('/api/agent/synthesize', {
    method: 'POST',
    headers: getAuthHeaders(token),
    body: JSON.stringify({ content, title }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Synthesis failed: ${res.status}`);
  }

  return await res.json();
}

