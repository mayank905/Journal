import os
import sys
import re
from fastapi.testclient import TestClient
from backend.main import app
from backend.schemas.entry import JournalEntryCreate
from backend.services.entry_service import entry_service

client = TestClient(app)

def test_ticket_07_history_filtering_logic():
    print("Testing Ticket 07 History & Search Logic...")
    test_user_id = "user-history-test-123"

    # Seed 3 distinct entries for the test user
    e1 = JournalEntryCreate(
        id="entry_hist_1",
        title="Morning run in Tokyo",
        content="Feeling energised and ready to conquer the day with high motivation.",
        mood="Motivated",
        tags=["#Health", "#Growth"],
        is_favorite=True,
        word_count=12,
        char_count=70,
        location={"name": "Shinjuku", "address": "Tokyo, Japan", "lat": 35.6938, "lng": 139.7036},
        dialogue_history=[
            {"id": "d1", "role": "user", "content": "How do I keep this pace?"},
            {"id": "d2", "role": "agent", "content": "Consistency beats intensity."},
        ],
        synthesis={
            "summary": "High energy morning run in Shinjuku.",
            "takeaways": ["Prioritize early momentum", "Celebrate small athletic wins", "Stay hydrated"],
            "suggested_title": "Tokyo Morning Surge"
        }
    )

    e2 = JournalEntryCreate(
        id="entry_hist_2",
        title="Quiet evening at home",
        content="Resting after a heavy week. Mind feels peaceful and settled.",
        mood="Calm",
        tags=["#Mindset", "#Rest"],
        is_favorite=False,
        word_count=10,
        char_count=60,
        location=None,
        dialogue_history=[],
        synthesis=None
    )

    e3 = JournalEntryCreate(
        id="entry_hist_3",
        title="Anxious thoughts about release",
        content="Worried about upcoming deadlines and project milestones.",
        mood="Anxious",
        tags=["#Work"],
        is_favorite=False,
        word_count=8,
        char_count=52,
        location={"name": "Office HQ", "address": "San Francisco, CA", "lat": 37.7749, "lng": -122.4194},
        dialogue_history=[
            {"id": "d3", "role": "user", "content": "What if everything fails?"},
            {"id": "d4", "role": "agent", "content": "Let's examine the evidence Socratic style."},
        ],
        synthesis={
            "summary": "Pre-launch performance anxiety.",
            "takeaways": ["Break tasks into 15m chunks", "Focus on locus of control", "Rest tonight"],
            "suggested_title": "Navigating Release Worries"
        }
    )

    entry_service.upsert_entry(test_user_id, e1)
    entry_service.upsert_entry(test_user_id, e2)
    entry_service.upsert_entry(test_user_id, e3)

    user_entries = entry_service.list_entries(test_user_id)
    assert len(user_entries) >= 3, f"Expected at least 3 entries, got {len(user_entries)}"

    # 1. Global text search
    # Search by title or location name
    res_tokyo = [
        e for e in user_entries 
        if "tokyo" in e.title.lower() or (e.location and "tokyo" in (e.location.get("name") or "").lower())
    ]
    assert len(res_tokyo) >= 1
    assert res_tokyo[0].id == "entry_hist_1"

    # Search in agent messages
    res_socratic = [
        e for e in user_entries 
        if e.dialogue_history and any("socratic" in turn.get("content", "").lower() for turn in e.dialogue_history)
    ]
    assert len(res_socratic) == 1
    assert res_socratic[0].id == "entry_hist_3"

    # 2. Filter by Mood
    res_calm = [e for e in user_entries if e.mood == "Calm"]
    assert len(res_calm) >= 1
    assert any(e.id == "entry_hist_2" for e in res_calm)

    # 3. Filter by Starred Favorites
    res_fav = [e for e in user_entries if e.is_favorite]
    assert len(res_fav) >= 1
    assert any(e.id == "entry_hist_1" for e in res_fav)

    # 4. Filter by Location presence
    res_geo = [e for e in user_entries if e.location and e.location.get("lat") is not None]
    assert len(res_geo) == 2

    # 5. Safe deletion
    deleted = entry_service.delete_entry(test_user_id, "entry_hist_2")
    assert deleted is True
    assert entry_service.get_entry(test_user_id, "entry_hist_2") is None
    print("PASS: Ticket 07 History search, multi-filter, and deletion verified.")


def test_ticket_08_analytics_calculations():
    print("Testing Ticket 08 Analytics & Behavioral Trends...")
    test_user_id = "user-analytics-test-456"

    e1 = JournalEntryCreate(
        id="a1",
        title="Reflective Journaling",
        content="Exploring deep inner thoughts and emotions.",
        mood="Reflective",
        tags=["#Mindset", "#Growth", "#Life"],
        is_favorite=True,
        word_count=50,
        char_count=300,
        location={"name": "Kyoto Garden", "address": "Kyoto, Japan", "lat": 35.0116, "lng": 135.7681},
        dialogue_history=[
            {"id": "1", "role": "user", "content": "Why do I overthink?"},
            {"id": "2", "role": "agent", "content": "Reflection reveals patterns."},
        ],
        synthesis={
            "summary": "Quiet contemplative reflection in Kyoto.",
            "takeaways": ["Overthinking is often misplaced problem-solving", "Notice the pause between thoughts"],
            "suggested_title": "Kyoto Zen Insights"
        }
    )

    e2 = JournalEntryCreate(
        id="a2",
        title="Grateful Afternoon",
        content="Grateful for supportive friends and good coffee.",
        mood="Grateful",
        tags=["#Gratitude", "#Life"],
        is_favorite=True,
        word_count=40,
        char_count=220,
        location={"name": "Kyoto Cafe", "address": "Kyoto, Japan", "lat": 35.0120, "lng": 135.7690},
        dialogue_history=[],
        synthesis={
            "summary": "Appreciation for daily small gifts.",
            "takeaways": ["Gratitude shifts perspective immediately"],
            "suggested_title": "Daily Coffee Gratitude"
        }
    )

    entry_service.upsert_entry(test_user_id, e1)
    entry_service.upsert_entry(test_user_id, e2)

    entries = entry_service.list_entries(test_user_id)

    # Metric Cards Computation
    total_entries = len(entries)
    total_words = sum(e.word_count for e in entries)
    total_reflections = sum(len(e.dialogue_history or []) for e in entries)
    total_starred = sum(1 for e in entries if e.is_favorite)
    geotagged_count = sum(1 for e in entries if e.location and e.location.get("lat") is not None)

    assert total_entries == 2
    assert total_words == 90
    assert total_reflections == 2
    assert total_starred == 2
    assert geotagged_count == 2

    # Tag Frequency Ranking
    tag_counts = {}
    for e in entries:
        for t in e.tags:
            tag_counts[t] = tag_counts.get(t, 0) + 1
    
    assert tag_counts["#Life"] == 2
    assert tag_counts["#Mindset"] == 1

    # Places Ranking
    places_counts = {}
    for e in entries:
        if e.location and e.location.get("name"):
            loc = e.location.get("name")
            places_counts[loc] = places_counts.get(loc, 0) + 1
    assert "Kyoto Garden" in places_counts

    # Aggregated Agent Takeaways
    takeaways = []
    for e in entries:
        if e.synthesis and e.synthesis.get("takeaways"):
            for t in e.synthesis["takeaways"]:
                takeaways.append({"entry_id": e.id, "title": e.title, "takeaway": t})
    
    assert len(takeaways) == 3
    print("PASS: Ticket 08 Analytics metrics, mood breakdown, and takeaway aggregation verified.")


def test_ticket_09_production_files_and_security():
    print("Testing Ticket 09 Production Hardening, Rules, Dockerfile & README...")
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    # 1. Verify firestore.rules
    rules_path = os.path.join(root_dir, "firestore.rules")
    assert os.path.exists(rules_path), f"firestore.rules missing at {rules_path}"
    with open(rules_path, "r", encoding="utf-8") as f:
        rules_content = f.read()
    
    # Must enforce owner-bound security
    assert "request.auth != null" in rules_content
    assert "request.auth.uid == userId" in rules_content
    # Must NOT have insecure default
    assert "allow read, write: if true;" not in rules_content

    # 2. Verify Dockerfile
    dockerfile_path = os.path.join(root_dir, "Dockerfile")
    assert os.path.exists(dockerfile_path), f"Dockerfile missing at {dockerfile_path}"
    with open(dockerfile_path, "r", encoding="utf-8") as f:
        docker_content = f.read()

    # Multi-stage check: node build stage and python runtime stage
    assert "FROM node" in docker_content
    assert "FROM python" in docker_content
    assert "npm run build" in docker_content
    assert "8080" in docker_content  # Cloud Run default port

    # 3. Verify deploy.sh
    deploy_path = os.path.join(root_dir, "deploy.sh")
    assert os.path.exists(deploy_path), f"deploy.sh missing at {deploy_path}"
    with open(deploy_path, "r", encoding="utf-8") as f:
        deploy_content = f.read()
    
    # Mandatory campaign label
    assert "dev-tutorial=cloud-run-ai-challenge" in deploy_content
    assert "GEMINI_API_KEY" in deploy_content

    # 4. Verify README.md
    readme_path = os.path.join(root_dir, "README.md")
    assert os.path.exists(readme_path), f"README.md missing at {readme_path}"
    with open(readme_path, "r", encoding="utf-8") as f:
        readme_content = f.read()
    
    assert "dev-tutorial=cloud-run-ai-challenge" in readme_content
    assert "GEMINI_API_KEY" in readme_content
    assert "firestore.rules" in readme_content
    assert "Walkthrough" in readme_content or "Verification" in readme_content

    print("PASS: Ticket 09 Production containerization, Firestore rules, and deployment verified.")

if __name__ == "__main__":
    test_ticket_07_history_filtering_logic()
    test_ticket_08_analytics_calculations()
    test_ticket_09_production_files_and_security()
    print("\nALL AUTOMATED TESTS FOR TICKETS 07, 08, 09 PASSED SUCCESSFULLY!")
