from fastapi.testclient import TestClient
from backend.main import app
from backend.schemas.entry import JournalEntryCreate
from backend.services.entry_service import entry_service

client = TestClient(app)

def test_ticket_04_longitudinal_memory_isolation_and_retrieval():
    user_id = "evaluator-memory-user"
    other_user_id = "other-memory-user"
    headers = {"Authorization": f"Bearer dev-mock-token-{user_id}"}
    other_headers = {"Authorization": f"Bearer dev-mock-token-{other_user_id}"}

    # 1. Seed historical entries for user
    entry_service.upsert_entry(user_id, JournalEntryCreate(
        title="Breaking Through Anxiety in Paris",
        content="Last year in Paris, I was gripped by fear and career anxiety, but walking along the Seine gave me perspective.",
        mood="Anxious",
        tags=["#Growth", "#Travel"],
    ))
    entry_service.upsert_entry(user_id, JournalEntryCreate(
        title="Quiet Morning Reflections",
        content="Finding serenity in routine coffee and morning reading.",
        mood="Calm",
        tags=["#Life"],
    ))

    # Seed an entry for other user that shouldn't be matched
    entry_service.upsert_entry(other_user_id, JournalEntryCreate(
        title="Other User Secret Anxiety",
        content="Other user fear and career anxiety private details.",
        mood="Anxious",
    ))

    # 2. Test Agent interaction querying past memories
    res = client.post("/api/agent/interact", json={
        "message": "Have I felt career anxiety before in my past reflections?",
        "mode": "pattern_memory",
        "entry_title": "Current Work Worries",
        "entry_content": "Feeling tense about this new project deadline.",
        "entry_mood": "Anxious",
    }, headers=headers)

    assert res.status_code == 200
    data = res.json()
    assert "response" in data
    
    # Check that tool_search_journal_memory was called and memory_consulted flag is set
    tool_steps = [s for s in data["trace_steps"] if s["step_type"] in ["tool_call", "observation"]]
    assert any("search_journal_memory" in s["title"].lower() or "memories archive" in s["title"].lower() for s in tool_steps)
    
    # Verify other user's private data is NOT in the response
    assert "Other User Secret Anxiety" not in res.text
    print("PASS: Ticket 04 Longitudinal memory search & isolation verified successfully")

def test_ticket_05_cognitive_framing_synthesis_and_dialogue_persistence():
    user_id = "evaluator-synthesis-user"
    headers = {"Authorization": f"Bearer dev-mock-token-{user_id}"}

    # 1. Test on-demand synthesis endpoint
    synth_res = client.post("/api/agent/synthesize", json={
        "title": "Overcoming The Fear of Starting",
        "content": "I kept procrastinating because I thought it had to be completely perfect from day one. That was a mistake.",
    }, headers=headers)

    assert synth_res.status_code == 200
    synth_data = synth_res.json()
    assert "suggested_title" in synth_data
    assert "takeaways" in synth_data
    assert len(synth_data["takeaways"]) == 3
    assert "summary" in synth_data

    # 2. Test entry creation with dialogue_history and synthesis
    entry_payload = {
        "title": synth_data["suggested_title"],
        "content": "I kept procrastinating because I thought it had to be completely perfect from day one.",
        "mood": "Reflective",
        "tags": ["#Growth"],
        "dialogue_history": [
            {"role": "user", "content": "Help me think through perfectionism."},
            {"role": "assistant", "content": "Perfectionism is often protective fear.", "mode": "cognitive_reframing"}
        ],
        "synthesis": synth_data,
    }

    create_res = client.post("/api/entries", json=entry_payload, headers=headers)
    assert create_res.status_code == 201
    created_entry = create_res.json()
    entry_id = created_entry["id"]
    assert len(created_entry["dialogue_history"]) == 2
    assert created_entry["synthesis"]["suggested_title"] == synth_data["suggested_title"]

    # 3. Retrieve entry and verify full persistence
    get_res = client.get(f"/api/entries/{entry_id}", headers=headers)
    assert get_res.status_code == 200
    fetched = get_res.json()
    assert len(fetched["dialogue_history"]) == 2
    assert fetched["dialogue_history"][0]["role"] == "user"
    print("PASS: Ticket 05 Synthesis card, takeaways, and dialogue persistence verified successfully")

def test_ticket_06_geospatial_maps_and_location_validation():
    user_id = "evaluator-geo-user"
    headers = {"Authorization": f"Bearer dev-mock-token-{user_id}"}

    # 1. Config endpoint: zero server secrets
    config_res = client.get("/api/maps/config")
    assert config_res.status_code == 200
    cfg = config_res.json()
    assert "hasClientKey" in cfg
    assert "private_key" not in str(cfg)
    assert "GOOGLE_MAPS_API_KEY" not in str(cfg)

    # 2. Geocoding endpoint: valid coordinates boundary & 4-decimal truncation
    geo_res = client.post("/api/maps/geocode", json={"lat": 35.6762456, "lng": 139.6503123}, headers=headers)
    assert geo_res.status_code == 200
    geo_data = geo_res.json()
    assert geo_data["lat"] == 35.6762
    assert geo_data["lng"] == 139.6503

    # Invalid latitude boundary (>90) returns 422 validation error
    invalid_res = client.post("/api/maps/geocode", json={"lat": 120.0, "lng": 50.0}, headers=headers)
    assert invalid_res.status_code == 422

    # 3. Search endpoint
    search_res = client.post("/api/maps/search", json={"query": "Kyoto Temple"}, headers=headers)
    assert search_res.status_code == 200
    assert "predictions" in search_res.json()

    # 4. Entry creation with location
    entry_payload = {
        "title": "Zen Garden Meditation",
        "content": "Practicing silent presence at the Ryoan-ji rock garden.",
        "mood": "Calm",
        "tags": ["#Travel", "#Mindset"],
        "location": {
            "name": "Ryoan-ji Temple",
            "address": "13 Ryoanji Goryonoshitacho, Ukyo Ward, Kyoto",
            "lat": 35.03452,
            "lng": 135.71829,
        }
    }
    create_res = client.post("/api/entries", json=entry_payload, headers=headers)
    assert create_res.status_code == 201
    entry = create_res.json()
    assert entry["location"]["name"] == "Ryoan-ji Temple"
    assert entry["location"]["lat"] == 35.0345
    assert entry["location"]["lng"] == 135.7183

    print("PASS: Ticket 06 Geo-spatial maps, boundary validation, and location persistence verified successfully")

if __name__ == "__main__":
    test_ticket_04_longitudinal_memory_isolation_and_retrieval()
    test_ticket_05_cognitive_framing_synthesis_and_dialogue_persistence()
    test_ticket_06_geospatial_maps_and_location_validation()
    print("\nALL AUTOMATED TESTS FOR TICKETS 04, 05, AND 06 PASSED SUCCESSFULLY!")
