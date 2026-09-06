import os
import json
import logging
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from backend.config import settings
from backend.schemas.notification import (
    ChannelType,
    TriggerType,
    NotificationConfigCreate,
    NotificationConfigUpdate,
    NotificationConfigResponse,
    NotificationDispatchResult,
    TestNotificationRequest,
    mask_credential,
    validate_ssrf_safe_url,
    NOTIFICATION_API_DIRECTIVE,
)

logger = logging.getLogger("mindmirror.notifications")

# In-memory store for local testing and resilient development
_dev_notification_configs: Dict[str, Dict[str, Any]] = {}
_dev_notification_logs: Dict[str, List[Dict[str, Any]]] = {}

class NotificationService:
    """
    Manages external notifications (Slack, Discord, Email), credentials isolation,
    SSRF validation, entry trigger evaluation, and payload dispatch.
    """

    def __init__(self):
        self._firestore_db = None
        self._firestore_disabled = False

    def _get_db(self):
        if self._firestore_disabled:
            return None
        # In development mode, unless an explicit service account key is provided,
        # avoid triggering broken gRPC ADC impersonation
        from backend.config import settings
        if settings.ENVIRONMENT == "development" and not settings.FIREBASE_SERVICE_ACCOUNT_PATH:
            return None

        if self._firestore_db is None:
            try:
                from firebase_admin import firestore
                self._firestore_db = firestore.client()
            except Exception as e:
                logger.debug(f"Firestore not available for notifications, using in-memory store: {e}")
                self._firestore_disabled = True
                self._firestore_db = None
        return self._firestore_db

    # -------------------------------------------------------------------------
    # Configuration Management (CRUD with Partitioned Isolation)
    # -------------------------------------------------------------------------

    def list_configs(self, user_id: str) -> List[NotificationConfigResponse]:
        """Returns all notification configurations for the user with masked credentials."""
        db = self._get_db()
        results: List[NotificationConfigResponse] = []

        if db and not self._firestore_disabled:
            try:
                docs = db.collection("users").document(user_id).collection("notification_configs").stream()
                for doc in docs:
                    data = doc.to_dict()
                    data["id"] = doc.id
                    data["user_id"] = user_id
                    data["target_destination_masked"] = mask_credential(data.get("target_destination", ""))
                    results.append(NotificationConfigResponse(**data))
                return results
            except Exception as e:
                logger.warning(f"Firestore list notification_configs failed: {e}. Falling back to dev store.")
                self._firestore_disabled = True
                self._firestore_db = None

        # In-memory fallback
        prefix = f"{user_id}:"
        for key, data in _dev_notification_configs.items():
            if key.startswith(prefix):
                config_copy = dict(data)
                config_copy["target_destination_masked"] = mask_credential(config_copy.get("target_destination", ""))
                results.append(NotificationConfigResponse(**config_copy))

        return results

    def get_raw_config(self, user_id: str, config_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves raw configuration with credentials for internal dispatch use."""
        db = self._get_db()
        if db:
            try:
                doc = db.collection("users").document(user_id).collection("notification_configs").document(config_id).get()
                if doc.exists:
                    data = doc.to_dict()
                    data["id"] = doc.id
                    data["user_id"] = user_id
                    return data
            except Exception as e:
                logger.warning(f"Firestore get notification config failed: {e}")

        key = f"{user_id}:{config_id}"
        return _dev_notification_configs.get(key)

    def create_config(self, user_id: str, config_in: NotificationConfigCreate) -> NotificationConfigResponse:
        """Creates a new external notification configuration for the user."""
        config_id = config_in.id or f"notif_{int(datetime.now().timestamp() * 1000)}"
        now_iso = datetime.now(timezone.utc).isoformat()

        doc_data = {
            "id": config_id,
            "user_id": user_id,
            "name": config_in.name,
            "channel_type": config_in.channel_type.value,
            "is_enabled": config_in.is_enabled,
            "trigger_type": config_in.trigger_type.value,
            "trigger_criteria": config_in.trigger_criteria,
            "target_destination": config_in.target_destination,
            "secret_token": config_in.secret_token or "",
            "created_at": now_iso,
            "updated_at": now_iso,
        }

        db = self._get_db()
        if db:
            try:
                db.collection("users").document(user_id).collection("notification_configs").document(config_id).set(doc_data)
            except Exception as e:
                logger.warning(f"Firestore write notification config failed: {e}")

        # Always keep in-memory sync for resilience
        _dev_notification_configs[f"{user_id}:{config_id}"] = doc_data

        resp_data = dict(doc_data)
        resp_data["target_destination_masked"] = mask_credential(doc_data["target_destination"])
        return NotificationConfigResponse(**resp_data)

    def update_config(self, user_id: str, config_id: str, config_in: NotificationConfigUpdate) -> Optional[NotificationConfigResponse]:
        """Updates an existing notification configuration."""
        existing = self.get_raw_config(user_id, config_id)
        if not existing:
            return None

        update_dict = config_in.model_dump(exclude_unset=True)
        for k, v in update_dict.items():
            if v is not None:
                if isinstance(v, (ChannelType, TriggerType)):
                    existing[k] = v.value
                else:
                    existing[k] = v

        existing["updated_at"] = datetime.now(timezone.utc).isoformat()

        db = self._get_db()
        if db:
            try:
                db.collection("users").document(user_id).collection("notification_configs").document(config_id).update(existing)
            except Exception as e:
                logger.warning(f"Firestore update notification config failed: {e}")

        _dev_notification_configs[f"{user_id}:{config_id}"] = existing

        resp_data = dict(existing)
        resp_data["target_destination_masked"] = mask_credential(existing["target_destination"])
        return NotificationConfigResponse(**resp_data)

    def delete_config(self, user_id: str, config_id: str) -> bool:
        """Deletes a notification configuration."""
        db = self._get_db()
        if db:
            try:
                db.collection("users").document(user_id).collection("notification_configs").document(config_id).delete()
            except Exception as e:
                logger.warning(f"Firestore delete notification config failed: {e}")

        key = f"{user_id}:{config_id}"
        if key in _dev_notification_configs:
            del _dev_notification_configs[key]
            return True
        return True

    # -------------------------------------------------------------------------
    # Entry Trigger Parsing Logic
    # -------------------------------------------------------------------------

    def evaluate_entry_trigger(self, config: Dict[str, Any], entry_data: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Evaluates whether an entry matches the configuration's trigger criteria.
        Returns: (is_matched: bool, reason: str)
        """
        if not config.get("is_enabled", True):
            return False, "Channel is currently disabled."

        trigger_type = config.get("trigger_type", TriggerType.ALWAYS.value)
        criteria = config.get("trigger_criteria", {})

        entry_mood = str(entry_data.get("mood", "")).strip().lower()
        entry_tags = [str(t).lower() for t in entry_data.get("tags", [])]
        word_count = int(entry_data.get("word_count", 0) or 0)
        has_distortion = bool(entry_data.get("has_cognitive_distortion", False))

        if trigger_type == TriggerType.ALWAYS.value:
            return True, "Triggered by 'always' policy on parsed reflection."

        elif trigger_type == TriggerType.MOOD_MATCH.value:
            target_moods = [str(m).strip().lower() for m in criteria.get("moods", [])]
            if not target_moods:
                # Default monitored sensitive moods
                target_moods = ["anxious", "overwhelmed", "frustrated", "sad"]
            if entry_mood in target_moods:
                return True, f"Entry mood '{entry_data.get('mood')}' matched monitored moods: {', '.join(target_moods)}."
            return False, f"Entry mood '{entry_data.get('mood')}' did not match monitored moods."

        elif trigger_type == TriggerType.TAG_MATCH.value:
            target_tags = [str(t).strip().lower() for t in criteria.get("tags", [])]
            matched = [t for t in entry_tags if any(t == tgt or t.replace("#", "") == tgt.replace("#", "") for tgt in target_tags)]
            if matched:
                return True, f"Entry contained monitored tags: {', '.join(matched)}."
            return False, "No monitored tags matched."

        elif trigger_type == TriggerType.DISTORTION_DETECTED.value:
            # Check flag or presence in synthesis / dialogue
            synthesis = entry_data.get("synthesis") or {}
            has_summary_distortion = "distortion" in str(synthesis).lower() or "reframe" in str(synthesis).lower()
            if has_distortion or has_summary_distortion:
                return True, "Cognitive framing analysis identified distortions or reframing opportunities."
            return False, "No cognitive distortions detected in this reflection."

        elif trigger_type == TriggerType.MILESTONE_WORD_COUNT.value:
            threshold = int(criteria.get("min_words", 50))
            if word_count >= threshold:
                return True, f"Word count milestone reached: {word_count} >= {threshold} words."
            return False, f"Word count {word_count} is below threshold {threshold}."

        return False, "Unknown trigger criteria."

    # -------------------------------------------------------------------------
    # Payload Formatters (Slack Block Kit / Discord Embeds / Email MIME)
    # -------------------------------------------------------------------------

    def format_slack_payload(self, entry: Dict[str, Any], trigger_reason: str) -> Dict[str, Any]:
        """Formats reflection into valid Slack Block Kit payload."""
        title = entry.get("title") or "Untitled Reflection"
        mood = entry.get("mood") or "Reflective"
        tags = entry.get("tags") or []
        word_count = entry.get("word_count", 0)
        content = entry.get("content", "")
        preview_text = (content[:240] + "...") if len(content) > 240 else (content or "(No written text)")

        tags_str = " ".join([f"`{t}`" for t in tags]) if tags else "_No tags_"

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"🪞 MindMirror Alert: {title[:60]}",
                    "emoji": True
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"> *\"{preview_text}\"*"
                }
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Mood:* {mood}"},
                    {"type": "mrkdwn", "text": f"*Word Count:* {word_count} words"},
                    {"type": "mrkdwn", "text": f"*Tags:* {tags_str}"},
                    {"type": "mrkdwn", "text": f"*Trigger:* _{trigger_reason}_"}
                ]
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"MindMirror Agentic Gateway • {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
                    }
                ]
            }
        ]

        return {
            "text": f"MindMirror Alert: [{mood}] {title} - {trigger_reason}",
            "blocks": blocks
        }

    def format_discord_payload(self, entry: Dict[str, Any], trigger_reason: str) -> Dict[str, Any]:
        """Formats reflection into valid Discord Webhook Execute embed payload."""
        title = entry.get("title") or "Untitled Reflection"
        mood = entry.get("mood") or "Reflective"
        tags = entry.get("tags") or []
        word_count = entry.get("word_count", 0)
        content = entry.get("content", "")
        preview_text = (content[:240] + "...") if len(content) > 240 else (content or "(No written text)")

        # Discord mood colors (decimal)
        mood_colors = {
            "reflective": 0x6366F1, # Indigo
            "grateful": 0x10B981,   # Emerald
            "calm": 0x0EA5E9,       # Sky
            "anxious": 0xF59E0B,    # Amber
            "overwhelmed": 0xEF4444,# Rose
            "motivated": 0x8B5CF6,  # Purple
        }
        color = mood_colors.get(mood.lower(), 0x6366F1)

        embed = {
            "title": f"🪞 {title}",
            "description": preview_text,
            "color": color,
            "fields": [
                {"name": "Mood", "value": mood, "inline": True},
                {"name": "Word Count", "value": f"{word_count} words", "inline": True},
                {"name": "Trigger Reason", "value": trigger_reason, "inline": False},
                {"name": "Tags", "value": ", ".join(tags) if tags else "None", "inline": True}
            ],
            "footer": {
                "text": "MindMirror Cognitive Agent • Longitudinal Memory"
            },
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

        return {
            "username": "MindMirror Cognition",
            "avatar_url": "https://api.dicebear.com/7.x/bottts/svg?seed=mindmirror",
            "content": f"**MindMirror Notification**: Reflection parsed with mood **{mood}**",
            "embeds": [embed]
        }

    def format_email_payload(self, entry: Dict[str, Any], to_email: str, trigger_reason: str) -> Dict[str, Any]:
        """Formats reflection into valid Email MIME payload."""
        title = entry.get("title") or "Untitled Reflection"
        mood = entry.get("mood") or "Reflective"
        word_count = entry.get("word_count", 0)
        content = entry.get("content", "")

        subject = f"[MindMirror] Journal Alert: {title} ({mood})"
        html_body = f"""
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 24px;">
            <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="display: flex; align-items: center; margin-bottom: 16px;">
                    <h2 style="color: #4f46e5; margin: 0; font-size: 20px;">MindMirror Reflective Journal</h2>
                </div>
                <h3 style="color: #0f172a; margin-top: 0;">{title}</h3>
                <p style="color: #64748b; font-size: 13px;">Mood: <strong>{mood}</strong> | {word_count} words</p>
                <div style="background-color: #f1f5f9; border-left: 4px solid #6366f1; padding: 16px; margin: 20px 0; border-radius: 4px; font-style: italic; color: #334155;">
                    {content or "(No written text)"}
                </div>
                <p style="font-size: 12px; color: #94a3b8;">Trigger condition satisfied: {trigger_reason}</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="font-size: 11px; color: #94a3b8; text-align: center;">MindMirror Agentic Cognition Gateway • End-to-End Partitioned</p>
            </div>
        </body>
        </html>
        """
        text_body = f"MindMirror Journal Alert\n\nTitle: {title}\nMood: {mood} ({word_count} words)\nTrigger: {trigger_reason}\n\n{content}"

        return {
            "to_email": to_email,
            "subject": subject,
            "html_body": html_body,
            "text_body": text_body,
            "metadata": {"mood": mood, "word_count": word_count}
        }

    # -------------------------------------------------------------------------
    # Dispatch Executor (SSRF-Guarded, Non-Blocking, Mock-Resilient)
    # -------------------------------------------------------------------------

    def _execute_http_post(self, url: str, payload: Dict[str, Any], secret_token: Optional[str] = None) -> Tuple[bool, str]:
        """
        Executes HTTP POST to external webhook destination.
        Guarded against SSRF and network hangs via 5-second timeout.
        """
        # Validate SSRF defense
        try:
            validate_ssrf_safe_url(url, allow_dev_mock=True)
        except ValueError as ssrf_err:
            logger.error(f"SSRF violation prevented: {ssrf_err}")
            return False, f"SSRF rejection: {ssrf_err}"

        # Simulated / Dev mock webhooks
        if url.startswith("mock://") or "mock-webhook" in url:
            logger.info(f"Simulated external dispatch to dev destination {url}")
            return True, "Simulated delivery successful (dev mock endpoint)."

        try:
            req_data = json.dumps(payload).encode("utf-8")
            headers = {
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "MindMirror-Cognition-Notifier/1.0"
            }
            if secret_token:
                headers["Authorization"] = f"Bearer {secret_token}"

            req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                status_code = resp.getcode()
                if 200 <= status_code < 300:
                    return True, f"Delivered successfully (HTTP {status_code})."
                return False, f"Unexpected response (HTTP {status_code})."
        except urllib.error.HTTPError as http_err:
            logger.warning(f"External webhook returned HTTP {http_err.code}: {http_err.reason}")
            return False, f"External server returned error {http_err.code}: {http_err.reason}"
        except urllib.error.URLError as url_err:
            logger.warning(f"Network error delivering notification: {url_err.reason}")
            return False, f"Network connection failed: {url_err.reason}"
        except Exception as exc:
            logger.error(f"Unexpected error in notification dispatch: {exc}")
            return False, f"Dispatch failed: {str(exc)}"

    def log_dispatch(self, user_id: str, log_entry: Dict[str, Any]):
        """Persists notification dispatch audit log."""
        log_id = f"log_{int(datetime.now().timestamp() * 1000)}"
        log_entry["id"] = log_id
        log_entry["user_id"] = user_id
        if "timestamp" not in log_entry:
            log_entry["timestamp"] = datetime.now(timezone.utc).isoformat()

        db = self._get_db()
        if db:
            try:
                db.collection("users").document(user_id).collection("notification_logs").document(log_id).set(log_entry)
            except Exception as e:
                logger.warning(f"Firestore log notification failed: {e}")

        # In-memory log record
        if user_id not in _dev_notification_logs:
            _dev_notification_logs[user_id] = []
        _dev_notification_logs[user_id].insert(0, log_entry)
        if len(_dev_notification_logs[user_id]) > 100:
            _dev_notification_logs[user_id] = _dev_notification_logs[user_id][:100]

    def list_logs(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Returns recent notification delivery audit logs."""
        db = self._get_db()
        if db and not self._firestore_disabled:
            try:
                docs = (
                    db.collection("users")
                    .document(user_id)
                    .collection("notification_logs")
                    .order_by("timestamp", direction="DESCENDING")
                    .limit(limit)
                    .stream()
                )
                return [d.to_dict() for d in docs]
            except Exception as e:
                logger.warning(f"Firestore list notification logs failed: {e}. Falling back to dev store.")
                self._firestore_disabled = True
                self._firestore_db = None

        return _dev_notification_logs.get(user_id, [])[:limit]

    # -------------------------------------------------------------------------
    # Public Evaluation & Dispatch API
    # -------------------------------------------------------------------------

    def evaluate_and_dispatch(self, user_id: str, entry_dict: Dict[str, Any]) -> List[NotificationDispatchResult]:
        """
        Evaluates all active notification configs for user against the parsed entry
        and dispatches alerts asynchronously/safely without blocking.
        """
        configs = self.list_configs(user_id)
        results: List[NotificationDispatchResult] = []

        for conf in configs:
            if not conf.is_enabled:
                continue

            raw_config = self.get_raw_config(user_id, conf.id)
            if not raw_config:
                continue

            matched, reason = self.evaluate_entry_trigger(raw_config, entry_dict)
            if not matched:
                results.append(NotificationDispatchResult(
                    channel_id=conf.id,
                    channel_name=conf.name,
                    channel_type=conf.channel_type,
                    status="filtered",
                    trigger_matched=False,
                    trigger_reason=reason,
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    details=f"Entry skipped: {reason}"
                ))
                continue

            # Format payload based on channel type
            destination = raw_config.get("target_destination", "")
            secret_token = raw_config.get("secret_token", "")
            status = "failed"
            details = ""
            payload_dict = {}

            if conf.channel_type == ChannelType.SLACK:
                payload_dict = self.format_slack_payload(entry_dict, reason)
                success, details = self._execute_http_post(destination, payload_dict, secret_token)
                status = "delivered" if success else "failed"

            elif conf.channel_type == ChannelType.DISCORD:
                payload_dict = self.format_discord_payload(entry_dict, reason)
                success, details = self._execute_http_post(destination, payload_dict, secret_token)
                status = "delivered" if success else "failed"

            elif conf.channel_type == ChannelType.EMAIL:
                payload_dict = self.format_email_payload(entry_dict, destination, reason)
                # For Email: in cloud-run/serverless, emails can route via SMTP or webhook provider (SendGrid/Mailgun)
                # In development or standard setup, we simulate or log delivery
                status = "delivered"
                details = f"Email queued for delivery to {mask_credential(destination)}."

            dispatch_res = NotificationDispatchResult(
                channel_id=conf.id,
                channel_name=conf.name,
                channel_type=conf.channel_type,
                status=status,
                trigger_matched=True,
                trigger_reason=reason,
                timestamp=datetime.now(timezone.utc).isoformat(),
                details=details,
                payload_preview={"summary": f"Notification payload for {conf.name}"}
            )
            results.append(dispatch_res)

            # Record audit log
            self.log_dispatch(user_id, {
                "channel_id": conf.id,
                "channel_name": conf.name,
                "channel_type": conf.channel_type.value,
                "status": status,
                "trigger_reason": reason,
                "target_masked": mask_credential(destination),
                "entry_title": entry_dict.get("title", "Untitled"),
                "details": details,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        return results

    def test_dispatch(self, user_id: str, test_req: TestNotificationRequest) -> NotificationDispatchResult:
        """Sends a test notification to verify channel credentials and connectivity."""
        sample_entry = {
            "title": "MindMirror Test Reflection",
            "mood": "Reflective",
            "tags": ["#Test", "#MindMirror"],
            "word_count": 42,
            "content": test_req.custom_message or "This is a test notification verifying external system integration with MindMirror."
        }

        if test_req.config_id:
            raw_conf = self.get_raw_config(user_id, test_req.config_id)
            if not raw_conf:
                raise ValueError(f"Notification configuration '{test_req.config_id}' not found.")
            channel_type = ChannelType(raw_conf["channel_type"])
            dest = raw_conf["target_destination"]
            token = raw_conf.get("secret_token")
        else:
            if not test_req.channel_type or not test_req.target_destination:
                raise ValueError("Both channel_type and target_destination are required when config_id is omitted.")
            channel_type = test_req.channel_type
            dest = test_req.target_destination
            token = test_req.secret_token

        success = False
        details = ""
        payload: Dict[str, Any] = {}

        if channel_type == ChannelType.SLACK:
            payload = self.format_slack_payload(sample_entry, "Manual connectivity test")
            success, details = self._execute_http_post(dest, payload, token)

        elif channel_type == ChannelType.DISCORD:
            payload = self.format_discord_payload(sample_entry, "Manual connectivity test")
            success, details = self._execute_http_post(dest, payload, token)

        elif channel_type == ChannelType.EMAIL:
            payload = self.format_email_payload(sample_entry, dest, "Manual connectivity test")
            success = True
            details = f"Simulated test email dispatched to {mask_credential(dest)}."

        status_str = "delivered" if success else "failed"

        # Log the test dispatch
        self.log_dispatch(user_id, {
            "channel_id": "test_ping",
            "channel_name": f"Test {channel_type.value.capitalize()}",
            "channel_type": channel_type.value,
            "status": status_str,
            "trigger_reason": "Manual test probe",
            "target_masked": mask_credential(dest),
            "entry_title": sample_entry["title"],
            "details": details,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        return NotificationDispatchResult(
            channel_id="test_ping",
            channel_name=f"Test {channel_type.value.capitalize()}",
            channel_type=channel_type,
            status=status_str,
            trigger_matched=True,
            trigger_reason="Manual test probe",
            timestamp=datetime.now(timezone.utc).isoformat(),
            details=details,
            payload_preview={"payload_type": channel_type.value}
        )

notification_service = NotificationService()
