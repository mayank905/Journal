export type ChannelType = 'slack' | 'discord' | 'email';

export type TriggerType = 
  | 'mood_match' 
  | 'tag_match' 
  | 'distortion_detected' 
  | 'milestone_word_count' 
  | 'always';

export interface NotificationConfig {
  id: string;
  name: string;
  channel_type: ChannelType;
  is_enabled: boolean;
  trigger_type: TriggerType;
  trigger_criteria: {
    moods?: string[];
    tags?: string[];
    min_words?: number;
    [key: string]: any;
  };
  target_destination_masked?: string;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationConfigCreateInput {
  name: string;
  channel_type: ChannelType;
  is_enabled: boolean;
  trigger_type: TriggerType;
  trigger_criteria: {
    moods?: string[];
    tags?: string[];
    min_words?: number;
    [key: string]: any;
  };
  target_destination: string;
  secret_token?: string;
}

export interface NotificationDispatchResult {
  channel_id: string;
  channel_name: string;
  channel_type: ChannelType;
  status: 'delivered' | 'simulated' | 'filtered' | 'failed';
  trigger_matched: boolean;
  trigger_reason: string;
  timestamp: string;
  details?: string;
  payload_preview?: any;
}

export interface NotificationLog {
  id: string;
  channel_id: string;
  channel_name: string;
  channel_type: string;
  status: string;
  trigger_reason: string;
  target_masked: string;
  entry_title: string;
  details: string;
  timestamp: string;
}

export interface NotificationDirectiveResponse {
  directive: string;
  supported_channels: string[];
  supported_triggers: string[];
  security_controls: {
    ssrf_protection: string;
    credential_masking: string;
    partitioning: string;
  };
}
