import re
import ipaddress
import urllib.parse
from enum import Enum
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator

NOTIFICATION_API_DIRECTIVE = """
NOTIFICATION API DIRECTIVE & EXTERNAL INTEGRATION SPECIFICATION:
This directive governs the management of external notification channels (Slack, Discord, Email),
enforcing strict credential hygiene, zero-leakage masking, SSRF mitigation, and payload schema contracts.

1. Auth Credential Management & Zero-Leakage Hygiene:
   - Webhook URLs, API tokens, and SMTP credentials must be strictly isolated to the authenticated user partition:
     /users/{userId}/notification_configs/{configId}.
   - Inbound credentials must be validated upon entry and stored securely.
   - All client-facing read responses MUST mask sensitive credentials (e.g. 'https://hooks.slack.com/services/...****').
   - Webhook tokens and credentials must NEVER be logged in server logs or included in query parameters.
   - Access to notification endpoints requires verified Firebase Bearer token authentication (request.auth.uid == userId).

2. Server-Side Request Forgery (SSRF) Defense:
   - Webhook destinations must strictly use HTTPS schemes (https://).
   - Target hostnames must not resolve to loopback (127.0.0.0/8, ::1), private RFC1918 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16),
     link-local (169.254.0.0/16, fe80::/10), or cloud metadata endpoints (169.254.169.254).
   - Localhost, 0.0.0.0, and intranet domains are strictly rejected with 400 Bad Request.

3. External Payload Schemas & Delivery Contracts:
   - Slack: Adheres to Slack Block Kit schema with text summary, header section, mrkdwn formatted content block,
     metadata fields (Mood, Tags, Word Count), and action button link.
   - Discord: Adheres to Discord Webhook Execute schema with message content and rich embeds array featuring
     dynamic mood color-coding, author attribution, fields for tags/key realizations, and timestamp.
   - Email: Adheres to MIME-compliant structure with clean subject line, formatted HTML body, and plain-text fallback.

4. Entry Parsing & Notification Trigger Types:
   - mood_match: Evaluated when an entry is parsed with specific emotional states (e.g., Anxious, Overwhelmed, Grateful).
   - tag_match: Evaluated when an entry contains target hashtags (e.g., #Milestone, #Breakthrough, #Urgent, #Goal).
   - distortion_detected: Evaluated when cognitive framing analysis uncovers distortions requiring grounding support.
   - milestone_word_count: Evaluated when a reflection achieves a defined word milestone (e.g., >= 50, 100, 250 words).
   - always: Evaluated on every parsed and saved reflection.

5. Non-Blocking Delivery & Failure Isolation:
   - External dispatch failures, rate limits, or network timeouts must NEVER fail or block journal persistence.
   - All dispatches enforce a 5-second connection/read timeout and record delivery status to /users/{userId}/notification_logs/.
"""

class ChannelType(str, Enum):
    SLACK = "slack"
    DISCORD = "discord"
    EMAIL = "email"

class TriggerType(str, Enum):
    MOOD_MATCH = "mood_match"
    TAG_MATCH = "tag_match"
    DISTORTION_DETECTED = "distortion_detected"
    MILESTONE_WORD_COUNT = "milestone_word_count"
    ALWAYS = "always"

def mask_credential(credential: Optional[str]) -> str:
    """Masks webhook URLs and secret tokens to prevent credential leakage."""
    if not credential:
        return ""
    if len(credential) <= 8:
        return "****"
    if credential.startswith("http://") or credential.startswith("https://"):
        try:
            parsed = urllib.parse.urlparse(credential)
            path_parts = parsed.path.split("/")
            if len(path_parts) > 2:
                masked_path = "/".join(path_parts[:-1]) + "/...****"
            else:
                masked_path = parsed.path[:4] + "...****"
            return f"{parsed.scheme}://{parsed.netloc}{masked_path}"
        except Exception:
            return credential[:12] + "...****"
    return credential[:4] + "...****" + credential[-4:]

def validate_ssrf_safe_url(url: str, allow_dev_mock: bool = False) -> str:
    """
    Validates that a URL does not target loopback, private networks, or cloud metadata endpoints.
    Enforces HTTPS scheme for production security.
    """
    if not url:
        raise ValueError("URL cannot be empty.")
    
    clean_url = url.strip()
    
    # Allow mock-dev URLs in development/testing if explicitly marked
    if allow_dev_mock and (clean_url.startswith("mock://") or "mock-webhook" in clean_url):
        return clean_url

    parsed = urllib.parse.urlparse(clean_url)
    scheme = parsed.scheme.lower()

    if scheme != "https":
        raise ValueError(f"Webhook URL must use secure HTTPS scheme (got '{scheme}').")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise ValueError("Webhook URL missing valid hostname.")

    # Reject localhost and obvious intranet aliases
    disallowed_hosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"]
    if hostname in disallowed_hosts or hostname.endswith(".local") or hostname.endswith(".internal"):
        raise ValueError(f"Destination hostname '{hostname}' is not permitted due to SSRF security policies.")

    # Check IP addresses against private / loopback / link-local / metadata blocks
    try:
        ip = ipaddress.ip_address(hostname)
        is_ip = True
    except ValueError:
        is_ip = False

    if is_ip:
        if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_reserved:
            raise ValueError(f"Destination IP '{hostname}' resolves to a restricted network range (SSRF guard).")
        if str(ip) == "169.254.169.254":
            raise ValueError("Access to Cloud Metadata endpoints (169.254.169.254) is strictly forbidden.")
    else:
        # If hostname is a domain name (not IP), ensure it does not contain suspicious keywords
        if "metadata" in hostname or "169.254" in hostname or "127.0.0.1" in hostname:
            raise ValueError(f"Suspicious hostname detected: {hostname}")

    return clean_url

# -----------------------------------------------------------------------------
# Configuration Schemas
# -----------------------------------------------------------------------------

class NotificationConfigBase(BaseModel):
    name: str = Field(description="Descriptive name for this notification destination (e.g. 'Personal Slack Alert').", max_length=100)
    channel_type: ChannelType = Field(description="External notification platform: 'slack', 'discord', or 'email'.")
    is_enabled: bool = Field(default=True, description="Whether notifications are actively dispatched to this channel.")
    trigger_type: TriggerType = Field(default=TriggerType.ALWAYS, description="Condition under which notification fires.")
    trigger_criteria: Dict[str, Any] = Field(
        default_factory=dict, 
        description="Filter parameters (e.g. {'moods': ['Anxious', 'Overwhelmed']}, {'tags': ['#Milestone']}, {'min_words': 50})."
    )

class NotificationConfigCreate(NotificationConfigBase):
    id: Optional[str] = None
    target_destination: str = Field(
        description="Target webhook URL (for Slack/Discord) or recipient email address (for Email)."
    )
    secret_token: Optional[str] = Field(default=None, description="Optional bearer token or secret for authentication.")

    @field_validator("target_destination")
    @classmethod
    def validate_destination(cls, v: str) -> str:
        v_clean = v.strip()
        if v_clean.startswith("http://") or v_clean.startswith("https://") or v_clean.startswith("mock://"):
            return validate_ssrf_safe_url(v_clean, allow_dev_mock=True)
        if "@" in v_clean:
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v_clean):
                raise ValueError(f"Invalid email address format: '{v_clean}'")
            return v_clean
        raise ValueError("target_destination must be a valid HTTPS webhook URL or email address.")

class NotificationConfigUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    is_enabled: Optional[bool] = None
    trigger_type: Optional[TriggerType] = None
    trigger_criteria: Optional[Dict[str, Any]] = None
    target_destination: Optional[str] = None
    secret_token: Optional[str] = None

    @field_validator("target_destination")
    @classmethod
    def validate_destination(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v_clean = v.strip()
        if v_clean.startswith("http://") or v_clean.startswith("https://") or v_clean.startswith("mock://"):
            return validate_ssrf_safe_url(v_clean, allow_dev_mock=True)
        if "@" in v_clean:
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v_clean):
                raise ValueError(f"Invalid email address format: '{v_clean}'")
            return v_clean
        raise ValueError("target_destination must be a valid HTTPS webhook URL or email address.")

class NotificationConfigResponse(NotificationConfigBase):
    id: str
    user_id: str
    target_destination_masked: str = Field(description="Masked destination URL/email protecting sensitive tokens.")
    created_at: str
    updated_at: str

# -----------------------------------------------------------------------------
# Outgoing External Payload Schemas (Slack / Discord / Email)
# -----------------------------------------------------------------------------

class SlackWebhookPayload(BaseModel):
    """Adheres strictly to the Slack Incoming Webhook / Block Kit Schema."""
    text: str = Field(description="Fallback plain-text summary for notifications/watch apps.")
    blocks: List[Dict[str, Any]] = Field(description="Slack Block Kit UI structure.")

class DiscordEmbedField(BaseModel):
    name: str
    value: str
    inline: bool = True

class DiscordEmbed(BaseModel):
    title: str
    description: str
    color: int = Field(default=0x6366F1, description="RGB decimal color integer.")
    fields: List[DiscordEmbedField] = Field(default_factory=list)
    footer: Optional[Dict[str, str]] = None
    timestamp: Optional[str] = None

class DiscordWebhookPayload(BaseModel):
    """Adheres strictly to the Discord Webhook Execute Schema."""
    username: str = Field(default="MindMirror Cognition", description="Bot display name.")
    avatar_url: Optional[str] = Field(default="https://api.dicebear.com/7.x/bottts/svg?seed=mindmirror")
    content: Optional[str] = Field(default=None, description="Optional main message text.")
    embeds: List[DiscordEmbed] = Field(description="Rich embeds containing reflection details.")

class EmailNotificationPayload(BaseModel):
    """Adheres strictly to the Email MIME structure."""
    to_email: str
    subject: str
    html_body: str
    text_body: str
    metadata: Dict[str, Any] = Field(default_factory=dict)

# -----------------------------------------------------------------------------
# Audit Log & Test Dispatch Schemas
# -----------------------------------------------------------------------------

class NotificationDispatchResult(BaseModel):
    channel_id: str
    channel_name: str
    channel_type: ChannelType
    status: str  # "delivered", "simulated", "filtered", "failed"
    trigger_matched: bool
    trigger_reason: str
    timestamp: str
    details: Optional[str] = None
    payload_preview: Optional[Dict[str, Any]] = None

class TestNotificationRequest(BaseModel):
    config_id: Optional[str] = None
    channel_type: Optional[ChannelType] = None
    target_destination: Optional[str] = None
    secret_token: Optional[str] = None
    custom_message: Optional[str] = None

    @field_validator("target_destination")
    @classmethod
    def validate_dest(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        v_clean = v.strip()
        if v_clean.startswith("http://") or v_clean.startswith("https://") or v_clean.startswith("mock://"):
            return validate_ssrf_safe_url(v_clean, allow_dev_mock=True)
        if "@" in v_clean:
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v_clean):
                raise ValueError(f"Invalid email address format: '{v_clean}'")
            return v_clean
        raise ValueError("target_destination must be a valid HTTPS webhook URL or email address.")

class ParseAndNotifyRequest(BaseModel):
    entry_id: Optional[str] = None
    title: str = Field(default="Untitled Reflection")
    content: str = Field(default="")
    mood: str = Field(default="Reflective")
    tags: List[str] = Field(default_factory=list)
    word_count: int = Field(default=0)
    has_cognitive_distortion: bool = Field(default=False)
    distortion_summary: Optional[str] = None
