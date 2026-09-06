from fastapi.testclient import TestClient
from backend.main import app
from backend.schemas.entry import (
    recursive_sanitize,
    JournalEntryCreate,
    JournalEntryUpdate,
    JournalEntryResponse,
    VALID_MOODS,
)

client = TestClient(app)

def test_recursive_sanitizer():
    dirty_payload = {
        "title": "Evening Reflection",
        "content": "Today was productive.",
        "none_field": None,
        "undefined_field": "undefined",
        "nested": {
            "valid": True,
            "zero": 0,
            "empty": "",
            "sub_none": None,
            "sub_undef": "undefined",
            "list": [1, None, "undefined", {"inner": "valid", "bad": None}]
        }
    }
    cleaned = recursive_sanitize(dirty_payload)
    assert "none_field" not in cleaned
    assert "undefined_field" not in cleaned
    assert cleaned["nested"]["valid"] is True
    assert cleaned["nested"]["zero"] == 0
    assert cleaned["nested"]["empty"] == ""
    assert "sub_none" not in cleaned["nested"]
    assert "sub_undef" not in cleaned["nested"]
    assert cleaned["nested"]["list"] == [1, {"inner": "valid"}]
    print("PASS: test_recursive_sanitizer stripped None and undefined values thoroughly")

def test_pydantic_schema_validation():
    entry_in = JournalEntryCreate(
        title="  My Deep Thoughts  ",
        content="One two three four five.",
        mood="grateful",
        tags=["Gratitude", "#Mindset", " Gratitude ", "#life"],
        is_favorite=False,
    )
    assert entry_in.mood == "Grateful"
    assert entry_in.tags == ["#Gratitude", "#Mindset", "#life"]
    assert "Grateful" in VALID_MOODS
    print("PASS: test_pydantic_schema_validation properly normalized mood and tags")

def test_entries_unauthorized():
    res = client.get("/api/entries")
    assert res.status_code == 401
    
    res = client.post("/api/entries", json={"title": "Unauthorized"})
    assert res.status_code == 401
    print("PASS: test_entries_unauthorized correctly rejected with 401")

def test_entries_crud_and_user_isolation():
    user1_headers = {"Authorization": "Bearer dev-mock-token-user-alpha"}
    user2_headers = {"Authorization": "Bearer dev-mock-token-user-beta"}

    # 1. Create Entry for User Alpha
    create_payload = {
        "title": "MindMirror Journey Begins",
        "content": "Writing my first reflection with MindMirror autonomous agent canvas. Finding peace in structured thoughts.",
        "mood": "Calm",
        "tags": ["Growth", "Mindset"],
        "is_favorite": False,
        "word_count": 0,
        "char_count": 0,
    }
    create_res = client.post("/api/entries", json=create_payload, headers=user1_headers)
    assert create_res.status_code == 201, f"Expected 201, got {create_res.status_code}: {create_res.text}"
    entry = create_res.json()
    entry_id = entry["id"]
    assert entry["user_id"] == "user-alpha"
    assert entry["title"] == "MindMirror Journey Begins"
    assert entry["mood"] == "Calm"
    assert entry["word_count"] > 0
    assert entry["char_count"] > 0
    assert entry["is_favorite"] is False
    print(f"PASS: Created entry {entry_id} for user-alpha")

    # 2. Retrieve Entry by User Alpha
    get_res = client.get(f"/api/entries/{entry_id}", headers=user1_headers)
    assert get_res.status_code == 200
    assert get_res.json()["id"] == entry_id

    # 3. User Isolation Check: User Beta CANNOT read User Alpha's entry
    cross_user_res = client.get(f"/api/entries/{entry_id}", headers=user2_headers)
    assert cross_user_res.status_code == 404, f"Expected 404 isolation for cross-user read, got {cross_user_res.status_code}"
    print("PASS: User isolation strictly verified (cross-user read rejected with 404)")

    # 4. Update Entry: Toggle Favorite & Update Content
    update_payload = {
        "title": "MindMirror Journey Begins (Updated)",
        "is_favorite": True,
        "content": "Expanded reflection reaching a new breakthrough milestone today.",
    }
    put_res = client.put(f"/api/entries/{entry_id}", json=update_payload, headers=user1_headers)
    assert put_res.status_code == 200
    updated_data = put_res.json()
    assert updated_data["is_favorite"] is True
    assert updated_data["title"] == "MindMirror Journey Begins (Updated)"
    print("PASS: Successfully updated entry and toggled favorite star state")

    # 5. List entries
    list_res = client.get("/api/entries", headers=user1_headers)
    assert list_res.status_code == 200
    entries = list_res.json()
    assert len(entries) >= 1
    assert any(e["id"] == entry_id for e in entries)

    # 6. Delete Entry
    del_res = client.delete(f"/api/entries/{entry_id}", headers=user1_headers)
    assert del_res.status_code == 200

    # 7. Verify deletion
    verify_del = client.get(f"/api/entries/{entry_id}", headers=user1_headers)
    assert verify_del.status_code == 404
    print("PASS: Entry deleted cleanly and confirmed 404 on subsequent get")

if __name__ == "__main__":
    test_recursive_sanitizer()
    test_pydantic_schema_validation()
    test_entries_unauthorized()
    test_entries_crud_and_user_isolation()
    print("\nALL AUTOMATED TESTS FOR TICKET 02 PASSED SUCCESSFULLY!")
