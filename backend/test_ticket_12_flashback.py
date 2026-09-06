import os
from datetime import datetime, timezone
from fastapi.testclient import TestClient

from backend.main import app
from backend.services.entry_service import entry_service, _dev_memory_store

client = TestClient(app)

def test_flashback_unauthenticated():
    print("\n--- 1. Testing Flashback Unauthenticated Access ---")
    res = client.get("/api/entries/on-this-day")
    assert res.status_code == 401, f"Expected 401 for unauthenticated request, got {res.status_code}"
    print("PASS: Unauthenticated access rejected with 401.")

def test_flashback_temporal_engine():
    print("\n--- 2. Testing Longitudinal Flashback Matching & Prior-Year Exclusion ---")
    user_id = "test-flashback-user"
    token = f"dev-mock-token-{user_id}"
    headers = {"Authorization": f"Bearer {token}"}

    # Clear test store for this user
    _dev_memory_store[user_id] = {}

    # 1. Create an entry written TODAY in current year (2026-09-06)
    res_today = client.post(
        "/api/entries",
        headers=headers,
        json={
            "title": "Reflecting on Today",
            "content": "Today I started working on a new challenge.",
            "mood": "Motivated",
            "created_at": "2026-09-06T10:00:00Z",
            "updated_at": "2026-09-06T10:00:00Z",
        }
    )
    assert res_today.status_code == 201

    # 2. Query flashbacks for 2026-09-06 -> Must NOT return today's entry
    res_fb_empty = client.get("/api/entries/on-this-day?target_date=2026-09-06", headers=headers)
    assert res_fb_empty.status_code == 200
    data_empty = res_fb_empty.json()
    assert len(data_empty["flashbacks"]) == 0, "Current year reflections must not be returned as historical flashbacks"
    print("PASS: Strict prior-year exclusion verified (entries from current year are excluded).")

    # 3. Create historical entries: 1 year ago (2025-09-06) and 2 years ago (2024-09-06)
    client.post(
        "/api/entries",
        headers=headers,
        json={
            "title": "One Year Ago Reflection",
            "content": "Reflecting on my habits and milestones from last year.",
            "mood": "Reflective",
            "created_at": "2025-09-06T14:30:00Z",
            "updated_at": "2025-09-06T14:30:00Z",
        }
    )

    client.post(
        "/api/entries",
        headers=headers,
        json={
            "title": "Two Years Ago Reflection",
            "content": "Two years ago, beginning my journey in AI development.",
            "mood": "Grateful",
            "created_at": "2024-09-06T09:15:00Z",
            "updated_at": "2024-09-06T09:15:00Z",
        }
    )

    # 4. Create an entry on a DIFFERENT date (2025-08-15) -> Should NOT match 09-06
    client.post(
        "/api/entries",
        headers=headers,
        json={
            "title": "August Summer Reflection",
            "content": "Summer vibes in August.",
            "mood": "Calm",
            "created_at": "2025-08-15T12:00:00Z",
            "updated_at": "2025-08-15T12:00:00Z",
        }
    )

    # 5. Query flashbacks for 2026-09-06
    res_fb = client.get("/api/entries/on-this-day?target_date=2026-09-06", headers=headers)
    assert res_fb.status_code == 200
    data = res_fb.json()

    assert data["target_date"] == "2026-09-06"
    assert data["month_day"] == "09-06"
    assert len(data["flashbacks"]) == 2, f"Expected 2 flashbacks, got {len(data['flashbacks'])}"
    
    # Check ordering: 1 year ago should be first, then 2 years ago
    first_fb = data["flashbacks"][0]
    second_fb = data["flashbacks"][1]

    assert first_fb["years_ago"] == 1
    assert first_fb["formatted_anniversary"] == "1 year ago today"
    assert first_fb["entry"]["title"] == "One Year Ago Reflection"
    assert first_fb["entry"]["mood"] == "Reflective"

    assert second_fb["years_ago"] == 2
    assert second_fb["formatted_anniversary"] == "2 years ago today"
    assert second_fb["entry"]["title"] == "Two Years Ago Reflection"
    assert second_fb["entry"]["mood"] == "Grateful"

    assert data["prompt"] is not None
    assert "One Year Ago Reflection" in data["prompt"]
    print(f"PASS: Flashbacks correctly returned and sorted by anniversary: {data['prompt']}")

def test_flashback_user_isolation():
    print("\n--- 3. Testing Flashback Multi-Tenant Isolation ---")
    user_a = "user-alpha"
    user_b = "user-beta"

    headers_a = {"Authorization": f"Bearer dev-mock-token-{user_a}"}
    headers_b = {"Authorization": f"Bearer dev-mock-token-{user_b}"}

    # User B creates an entry 1 year ago
    client.post(
        "/api/entries",
        headers=headers_b,
        json={
            "title": "User B Secret Reflection",
            "content": "This belongs only to User B.",
            "mood": "Calm",
            "created_at": "2025-09-06T11:00:00Z",
            "updated_at": "2025-09-06T11:00:00Z",
        }
    )

    # User A queries flashbacks -> Must NOT see User B's reflection
    res_a = client.get("/api/entries/on-this-day?target_date=2026-09-06", headers=headers_a)
    assert res_a.status_code == 200
    data_a = res_a.json()
    for fb in data_a["flashbacks"]:
        assert fb["entry"]["title"] != "User B Secret Reflection", "Cross-tenant data leakage detected!"
    print("PASS: Multi-tenant sandbox maintained; User A cannot access User B flashbacks.")

def test_flashback_leap_year_handling():
    print("\n--- 4. Testing Leap Year & Feb 29 Handling ---")
    user_id = "test-leap-user"
    headers = {"Authorization": f"Bearer dev-mock-token-{user_id}"}
    _dev_memory_store[user_id] = {}

    # Entry written on Leap Day 2024 (2024-02-29)
    client.post(
        "/api/entries",
        headers=headers,
        json={
            "title": "Leap Day Special",
            "content": "Once every 4 years reflection.",
            "mood": "Curious",
            "created_at": "2024-02-29T12:00:00Z",
            "updated_at": "2024-02-29T12:00:00Z",
        }
    )

    # Query in non-leap year 2025 on Feb 28
    res_leap = client.get("/api/entries/on-this-day?target_date=2025-02-28", headers=headers)
    assert res_leap.status_code == 200
    data = res_leap.json()
    assert len(data["flashbacks"]) >= 1, "Leap day reflection should match on Feb 28 of non-leap year"
    assert data["flashbacks"][0]["entry"]["title"] == "Leap Day Special"
    print("PASS: Leap year boundary handling verified (2024-02-29 matches Feb 28 in non-leap year).")

def test_flashback_malformed_date():
    print("\n--- 5. Testing Malformed Date Input Graceful Fallback ---")
    user_id = "test-malformed-date-user"
    headers = {"Authorization": f"Bearer dev-mock-token-{user_id}"}

    # Query with garbage date string
    res = client.get("/api/entries/on-this-day?target_date=not-a-valid-date", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "target_date" in data
    assert "flashbacks" in data
    print("PASS: Malformed date string handled gracefully with zero 500 crashes.")

if __name__ == "__main__":
    test_flashback_unauthenticated()
    test_flashback_temporal_engine()
    test_flashback_user_isolation()
    test_flashback_leap_year_handling()
    test_flashback_malformed_date()
    print("\n=== ALL FLASHBACK TICKET 12 TESTS PASSED! ===")
