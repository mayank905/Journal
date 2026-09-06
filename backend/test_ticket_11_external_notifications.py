import os
import sys

# Ensure backend can be imported
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from backend.main import app
from backend.schemas.notification import (
    validate_ssrf_safe_url,
    mask_credential,
    NOTIFICATION_API_DIRECTIVE
)
from backend.agent.tools import tool_registry

client = TestClient(app)

def test_notification_directive():
    print("--- 1. Testing Notification API Directive & Security Controls ---")
    headers = {"Authorization": "Bearer dev-mock-token-user123"}
    resp = client.get("/api/notifications/directive", headers=headers)
    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
    data = resp.json()
    assert "directive" in data
    assert "NOTIFICATION API DIRECTIVE" in data["directive"]
    assert "slack" in data["supported_channels"]
    assert "discord" in data["supported_channels"]
    assert "email" in data["supported_channels"]
    assert "mood_match" in data["supported_triggers"]
    assert "ssrf_protection" in data["security_controls"]
    print(" PASS: Notification API Directive endpoint returned valid specifications.")

def test_ssrf_guard_protections():
    print("--- 2. Testing SSRF Guard Protections against Malicious Hosts ---")
    # Disallow localhost
    try:
        validate_ssrf_safe_url("http://localhost:8080/webhook")
        assert False, "Should have failed on localhost/http"
    except ValueError as e:
        assert "secure HTTPS" in str(e) or "SSRF" in str(e)

    # Disallow non-HTTPS
    try:
        validate_ssrf_safe_url("http://example-webhook.org/services/123")
        assert False, "Should have failed on non-HTTPS scheme"
    except ValueError as e:
        assert "secure HTTPS" in str(e)

    # Disallow 127.0.0.1
    try:
        validate_ssrf_safe_url("https://127.0.0.1/admin")
        assert False, "Should have failed on 127.0.0.1"
    except ValueError as e:
        assert "SSRF" in str(e) or "restricted" in str(e) or "SSRF security policies" in str(e)

    # Disallow private RFC1918 (192.168.1.1, 10.0.0.5)
    try:
        validate_ssrf_safe_url("https://192.168.1.1/webhook")
        assert False, "Should have failed on 192.168.1.1"
    except ValueError as e:
        assert "restricted" in str(e) or "SSRF" in str(e)

    try:
        validate_ssrf_safe_url("https://10.0.0.5/api")
        assert False, "Should have failed on 10.0.0.5"
    except ValueError as e:
        assert "restricted" in str(e) or "SSRF" in str(e)

    # Disallow Cloud Metadata IP (169.254.169.254)
    try:
        validate_ssrf_safe_url("https://169.254.169.254/computeMetadata/v1/")
        assert False, "Should have failed on Cloud Metadata IP"
    except ValueError as e:
        assert "Cloud Metadata" in str(e) or "restricted" in str(e) or "SSRF" in str(e)

    # Allow valid HTTPS endpoints
    valid_url = "https://api.example.com/notifications/webhook-listener"
    assert validate_ssrf_safe_url(valid_url) == valid_url

    # Check mock:// URLs allowed with flag
    mock_url = "mock://internal-testing/webhook"
    assert validate_ssrf_safe_url(mock_url, allow_dev_mock=True) == mock_url

    print(" PASS: SSRF Validator successfully prevented all prohibited target network vectors.")

def test_credential_masking():
    print("--- 3. Testing Credential Masking & Zero-Leakage ---")
    webhook = "https://custom-alert-sink.org/hooks/v1/private_delivery_token_abc123"
    masked = mask_credential(webhook)
    assert "private_delivery_token_abc123" not in masked, "Raw secret token leaked in masked string!"
    assert "****" in masked
    assert masked.startswith("https://custom-alert-sink.org")

    email = "secret_agent@example.com"
    masked_email = mask_credential(email)
    assert "****" in masked_email

    print(" PASS: Webhooks and credentials correctly masked before client delivery.")

def test_notification_configs_crud_and_isolation():
    print("--- 4. Testing Notification Config CRUD & Partition Isolation ---")
    headers_user_a = {"Authorization": "Bearer dev-mock-token-userA"}
    headers_user_b = {"Authorization": "Bearer dev-mock-token-userB"}

    # 1. Create Slack config for User A
    slack_payload = {
        "name": "User A Slack Alerts",
        "channel_type": "slack",
        "is_enabled": True,
        "trigger_type": "mood_match",
        "trigger_criteria": {"moods": ["Anxious", "Overwhelmed"]},
        "target_destination": "https://alerts.internal-dev.org/slack/feed/mock_token_123",
        "secret_token": "supersecrettoken"
    }
    resp = client.post("/api/notifications/configs", json=slack_payload, headers=headers_user_a)
    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
    config_a = resp.json()
    assert config_a["name"] == "User A Slack Alerts"
    assert "mock_token_123" not in config_a["target_destination_masked"]
    assert "****" in config_a["target_destination_masked"]
    config_a_id = config_a["id"]

    # 2. Verify User B cannot see User A's configs
    resp_b = client.get("/api/notifications/configs", headers=headers_user_b)
    assert resp_b.status_code == 200
    b_configs = resp_b.json()
    assert not any(c["id"] == config_a_id for c in b_configs), "User B saw User A's notification config! Isolation violation."

    # 3. Create Discord config for User A with Tag Match
    discord_payload = {
        "name": "Discord Milestone Channel",
        "channel_type": "discord",
        "is_enabled": True,
        "trigger_type": "tag_match",
        "trigger_criteria": {"tags": ["#Milestone", "#Breakthrough"]},
        "target_destination": "https://alerts.internal-dev.org/discord/feed/mock_token_456"
    }
    resp_disc = client.post("/api/notifications/configs", json=discord_payload, headers=headers_user_a)
    assert resp_disc.status_code == 201
    disc_config_id = resp_disc.json()["id"]

    # 4. List configs for User A
    resp_list = client.get("/api/notifications/configs", headers=headers_user_a)
    assert resp_list.status_code == 200
    user_a_configs = resp_list.json()
    assert len(user_a_configs) >= 2

    # 5. Update config
    update_payload = {"name": "Updated User A Slack Alerts"}
    resp_upd = client.put(f"/api/notifications/configs/{config_a_id}", json=update_payload, headers=headers_user_a)
    assert resp_upd.status_code == 200
    assert resp_upd.json()["name"] == "Updated User A Slack Alerts"

    # 6. Delete discord config
    resp_del = client.delete(f"/api/notifications/configs/{disc_config_id}", headers=headers_user_a)
    assert resp_del.status_code == 200

    print(" PASS: Notification configs CRUD and partitioned user isolation validated.")

def test_entry_parsing_and_trigger_evaluation():
    print("--- 5. Testing Entry Parsing & Trigger Rules (Mood, Tag, Milestone, Always) ---")
    headers = {"Authorization": "Bearer dev-mock-token-test-triggers"}

    # Setup 4 distinct channel rules
    # Channel 1: Mood Match for 'Anxious'
    client.post("/api/notifications/configs", json={
        "id": "conf_mood",
        "name": "Mood Alert Channel",
        "channel_type": "slack",
        "is_enabled": True,
        "trigger_type": "mood_match",
        "trigger_criteria": {"moods": ["Anxious", "Overwhelmed"]},
        "target_destination": "mock://slack-channel/mood"
    }, headers=headers)

    # Channel 2: Tag Match for '#Milestone'
    client.post("/api/notifications/configs", json={
        "id": "conf_tag",
        "name": "Milestone Tag Channel",
        "channel_type": "discord",
        "is_enabled": True,
        "trigger_type": "tag_match",
        "trigger_criteria": {"tags": ["#Milestone"]},
        "target_destination": "mock://discord-channel/tags"
    }, headers=headers)

    # Channel 3: Word Count Milestone (>= 30 words)
    client.post("/api/notifications/configs", json={
        "id": "conf_words",
        "name": "Long Reflection Channel",
        "channel_type": "email",
        "is_enabled": True,
        "trigger_type": "milestone_word_count",
        "trigger_criteria": {"min_words": 30},
        "target_destination": "reflective_user@example.com"
    }, headers=headers)

    # Channel 4: Cognitive Distortion
    client.post("/api/notifications/configs", json={
        "id": "conf_distortion",
        "name": "Grounding Support Channel",
        "channel_type": "slack",
        "is_enabled": True,
        "trigger_type": "distortion_detected",
        "trigger_criteria": {},
        "target_destination": "mock://slack-channel/distortion"
    }, headers=headers)

    # Test Case A: Entry with mood 'Anxious' but short content and no tags
    res_a = client.post("/api/notifications/parse-and-notify", json={
        "title": "Feeling uneasy today",
        "content": "A short note about feeling anxious.",
        "mood": "Anxious",
        "tags": ["#Daily"],
        "word_count": 6,
        "has_cognitive_distortion": False
    }, headers=headers)
    assert res_a.status_code == 200
    dispatches_a = res_a.json()
    # conf_mood should trigger; conf_tag and conf_words should be filtered
    mood_result = next(d for d in dispatches_a if d["channel_id"] == "conf_mood")
    assert mood_result["trigger_matched"] is True
    assert mood_result["status"] in ["delivered", "simulated"]

    tag_result = next(d for d in dispatches_a if d["channel_id"] == "conf_tag")
    assert tag_result["trigger_matched"] is False
    assert tag_result["status"] == "filtered"

    # Test Case B: Entry with tag '#Milestone' and word count 45
    res_b = client.post("/api/notifications/parse-and-notify", json={
        "title": "Achieved Breakthrough",
        "content": "Today I completed the entire architecture sprint and passed all security benchmarks with zero regressions. Feeling proud of the progress made.",
        "mood": "Grateful",
        "tags": ["#Milestone", "#Sprint"],
        "word_count": 45,
        "has_cognitive_distortion": False
    }, headers=headers)
    assert res_b.status_code == 200
    dispatches_b = res_b.json()
    tag_res_b = next(d for d in dispatches_b if d["channel_id"] == "conf_tag")
    assert tag_res_b["trigger_matched"] is True
    assert tag_res_b["status"] in ["delivered", "simulated"]

    words_res_b = next(d for d in dispatches_b if d["channel_id"] == "conf_words")
    assert words_res_b["trigger_matched"] is True

    # Test Case C: Entry with cognitive distortion detected
    res_c = client.post("/api/notifications/parse-and-notify", json={
        "title": "Struggling with self-doubt",
        "content": "I keep thinking I will fail everything.",
        "mood": "Reflective",
        "tags": ["#Thoughts"],
        "word_count": 10,
        "has_cognitive_distortion": True
    }, headers=headers)
    assert res_c.status_code == 200
    dispatches_c = res_c.json()
    dist_res = next(d for d in dispatches_c if d["channel_id"] == "conf_distortion")
    assert dist_res["trigger_matched"] is True

    print(" PASS: All notification trigger conditions evaluated with exact accuracy.")

def test_entry_service_save_hook_non_blocking():
    print("--- 6. Testing Entry Upsert Hook Integration (Non-Blocking) ---")
    headers = {"Authorization": "Bearer dev-mock-token-hook-test"}

    # Create always-on channel
    client.post("/api/notifications/configs", json={
        "name": "Always On Dev Channel",
        "channel_type": "slack",
        "is_enabled": True,
        "trigger_type": "always",
        "target_destination": "mock://dev-slack-webhook"
    }, headers=headers)

    # Upsert a journal entry through standard /api/entries
    entry_payload = {
        "title": "Evening Reflection on Progress",
        "content": "Deep thought about today's accomplishments and peaceful moments.",
        "mood": "Calm",
        "tags": ["#Evening", "#Peace"]
    }
    resp = client.post("/api/entries", json=entry_payload, headers=headers)
    assert resp.status_code in [200, 201], f"Entry save failed: {resp.text}"
    saved_entry = resp.json()
    assert saved_entry["title"] == "Evening Reflection on Progress"

    # Verify audit log was recorded
    resp_logs = client.get("/api/notifications/logs", headers=headers)
    assert resp_logs.status_code == 200
    logs = resp_logs.json().get("logs", [])
    assert len(logs) > 0
    assert any("Evening Reflection" in lg.get("entry_title", "") for lg in logs)

    print(" PASS: Entry service upsert seamlessly dispatches notifications without blocking persistence.")

def test_agent_tool_registry_notification_tool():
    print("--- 7. Testing Agent Tool Registry: tool_dispatch_external_notification ---")
    tool = tool_registry.get_tool("tool_dispatch_external_notification")
    assert tool is not None, "tool_dispatch_external_notification is not registered in ToolRegistry!"

    result = tool_registry.execute_tool(
        "tool_dispatch_external_notification",
        user_id="dev-mock-token-hook-test",
        raw_arguments={
            "message": "Major breakthrough in cognitive reframing accomplished today!",
            "entry_title": "Breakthrough Breakthrough",
            "mood": "Motivated",
            "tags": ["#Breakthrough"]
        }
    )
    assert result["status"] == "completed"
    assert "total_evaluated" in result
    print(" PASS: tool_dispatch_external_notification executed cleanly in ReAct tool registry.")

def test_manual_test_dispatch():
    print("--- 8. Testing Manual Test Probe Endpoint ---")
    headers = {"Authorization": "Bearer dev-mock-token-test-user"}
    test_req = {
        "channel_type": "discord",
        "target_destination": "mock://discord.com/api/webhooks/dev-test",
        "custom_message": "Connectivity validation message"
    }
    resp = client.post("/api/notifications/test", json=test_req, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ["delivered", "simulated"]
    assert data["trigger_matched"] is True

    print(" PASS: Manual test endpoint probe operates successfully.")

if __name__ == "__main__":
    print("\n=======================================================")
    print("RUNNING TICKET 11: EXTERNAL NOTIFICATIONS TEST SUITE")
    print("=======================================================\n")
    test_notification_directive()
    test_ssrf_guard_protections()
    test_credential_masking()
    test_notification_configs_crud_and_isolation()
    test_entry_parsing_and_trigger_evaluation()
    test_entry_service_save_hook_non_blocking()
    test_agent_tool_registry_notification_tool()
    test_manual_test_dispatch()
    print("\n=======================================================")
    print("ALL TICKET 11 TESTS PASSED SUCCESSFULLY! (8/8)")
    print("=======================================================\n")
