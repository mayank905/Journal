import type { 
  NotificationConfig, 
  NotificationConfigCreateInput, 
  NotificationDispatchResult, 
  NotificationLog, 
  NotificationDirectiveResponse 
} from '../types/notification';

const API_BASE = '/api/notifications';

function getAuthHeaders(idToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  let token = idToken;
  if (!token) {
    try {
      const saved = localStorage.getItem("mindmirror_dev_user");
      if (saved) {
        const u = JSON.parse(saved);
        if (u?.uid) {
          token = `dev-mock-token-${u.uid}`;
        }
      }
    } catch {}
  }
  if (!token) {
    token = "dev-mock-token-evaluator-01";
  }
  headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function fetchNotificationDirective(idToken: string | null): Promise<NotificationDirectiveResponse> {
  const res = await fetch(`${API_BASE}/directive`, {
    headers: getAuthHeaders(idToken),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch notification directive: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchUserConfigs(idToken: string | null): Promise<NotificationConfig[]> {
  const res = await fetch(`${API_BASE}/configs`, {
    headers: getAuthHeaders(idToken),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch notification configs: ${res.statusText}`);
  }
  return res.json();
}

export async function createNotificationConfig(
  input: NotificationConfigCreateInput,
  idToken: string | null
): Promise<NotificationConfig> {
  const res = await fetch(`${API_BASE}/configs`, {
    method: 'POST',
    headers: getAuthHeaders(idToken),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || 'Failed to create notification channel.');
  }
  return res.json();
}

export async function deleteNotificationConfig(
  configId: string,
  idToken: string | null
): Promise<void> {
  const res = await fetch(`${API_BASE}/configs/${configId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(idToken),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete notification config: ${res.statusText}`);
  }
}

export async function testNotificationChannel(
  channelType?: string,
  targetDestination?: string,
  secretToken?: string,
  customMessage?: string,
  idToken?: string | null,
  configId?: string
): Promise<NotificationDispatchResult> {
  const payload: Record<string, any> = {
    custom_message: customMessage || 'MindMirror external integration connectivity test',
  };
  if (configId) {
    payload.config_id = configId;
  }
  if (channelType) {
    payload.channel_type = channelType;
  }
  if (targetDestination) {
    payload.target_destination = targetDestination;
  }
  if (secretToken) {
    payload.secret_token = secretToken;
  }

  const res = await fetch(`${API_BASE}/test`, {
    method: 'POST',
    headers: getAuthHeaders(idToken || null),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || 'Test notification failed.');
  }
  return res.json();
}

export async function fetchNotificationLogs(idToken: string | null): Promise<NotificationLog[]> {
  const res = await fetch(`${API_BASE}/logs`, {
    headers: getAuthHeaders(idToken),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch notification logs: ${res.statusText}`);
  }
  const data = await res.json();
  return data.logs || [];
}
