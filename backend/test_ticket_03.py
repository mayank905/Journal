from fastapi.testclient import TestClient
from backend.main import app
from backend.agent.fallback import (
    MODEL_FALLBACK_LADDER,
    generate_content_with_fallback,
    is_recoverable_error,
)
from backend.agent.tools import tool_registry, ResolveLocationParams
from pydantic import ValidationError

client = TestClient(app)

def test_tool_registry_and_parameter_validation():
    # 1. Verify all 6 tools are registered
    expected_tools = [
        "tool_search_journal_memory",
        "tool_analyze_cognitive_framing",
        "tool_synthesize_entry",
        "tool_generate_actionable_milestones",
        "tool_resolve_and_anchor_location",
        "tool_generate_inspirational_prompts",
    ]
    for t_name in expected_tools:
        tool = tool_registry.get_tool(t_name)
        assert tool is not None, f"Expected {t_name} to be registered"
        decl = tool.to_gemini_declaration()
        assert decl["name"] == t_name
        assert "parameters" in decl

    # 2. Coordinate boundary validation & 4-decimal truncation
    valid_coords = {"location_name": "Kyoto Zen Garden", "coordinates": {"lat": 35.011634, "lng": 135.768029}}
    res = tool_registry.execute_tool("tool_resolve_and_anchor_location", "test-user", valid_coords)
    assert res["sanitized_coordinates"]["lat"] == 35.0116
    assert res["sanitized_coordinates"]["lng"] == 135.7680

    # Invalid latitude > 90 must raise ValidationError
    try:
        tool_registry.execute_tool(
            "tool_resolve_and_anchor_location", 
            "test-user", 
            {"location_name": "Invalid Lat", "coordinates": {"lat": 95.0, "lng": 10.0}}
        )
        assert False, "Should have raised ValidationError for latitude > 90"
    except ValidationError:
        pass

    # 3. Cognitive distortion analysis
    cog_res = tool_registry.execute_tool(
        "tool_analyze_cognitive_framing",
        "test-user",
        {"entry_text": "I will always fail and everything is completely ruined."}
    )
    assert cog_res["patterns_detected"] >= 1
    assert any("All-or-Nothing" in p["distortion"] for p in cog_res["insights"])

    print("PASS: test_tool_registry_and_parameter_validation passed")

def test_model_fallback_ladder():
    assert MODEL_FALLBACK_LADDER == [
        "gemini-3.8-flash",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
        "gemini-3.7-flash",
    ]

    # Test simulated fallback recovery: first model fails with 429, second model succeeds
    attempts = []
    def flaky_model_call(model_name: str):
        attempts.append(model_name)
        if model_name == "gemini-3.8-flash":
            raise Exception("HTTP 429 Resource Exhausted: Rate limit exceeded")
        return f"Synthesized via {model_name}"

    result, successful_model = generate_content_with_fallback(flaky_model_call)
    assert successful_model == "gemini-3.1-flash-lite"
    assert "gemini-3.8-flash" in attempts
    assert "gemini-3.1-flash-lite" in attempts
    print("PASS: test_model_fallback_ladder successfully recovered across fallback tiers")

def test_agent_endpoints():
    user_headers = {"Authorization": "Bearer dev-mock-token-agent-evaluator"}

    # 1. Unauthenticated request must return 401
    unauth_res = client.post("/api/agent/interact", json={"message": "Help me think."})
    assert unauth_res.status_code == 401

    # 2. Authenticated ReAct interaction
    req_body = {
        "message": "Have I felt this overwhelmed before?",
        "mode": "pattern_memory",
        "entry_title": "Project Pressures",
        "entry_content": "Feeling overwhelmed with all the deliverables and tasks due this week.",
        "entry_mood": "Overwhelmed",
        "entry_tags": ["#Work", "#Life"],
    }
    interact_res = client.post("/api/agent/interact", json=req_body, headers=user_headers)
    assert interact_res.status_code == 200, f"Expected 200, got {interact_res.status_code}: {interact_res.text}"
    data = interact_res.json()
    assert "response" in data
    assert data["mode"] == "pattern_memory"
    assert len(data["trace_steps"]) >= 2
    # Verify trace steps contain thought, tool_call, observation, synthesis
    step_types = [s["step_type"] for s in data["trace_steps"]]
    assert "thought" in step_types
    assert "synthesis" in step_types
    # Zero API key exposure
    assert "AIzaSy" not in str(data)
    assert "GEMINI_API_KEY" not in str(data)
    print("PASS: /api/agent/interact executed ReAct loop and returned reasoning trace")

    # 3. Prompt ideas endpoint
    ideas_res = client.post("/api/agent/prompt-ideas", json={"mood": "Anxious", "mode": "cognitive_reframing"}, headers=user_headers)
    assert ideas_res.status_code == 200
    ideas_data = ideas_res.json()
    assert len(ideas_data["prompts"]) >= 3
    print("PASS: /api/agent/prompt-ideas generated tailored prompt chips")

    # 4. SSE streaming endpoint
    stream_res = client.post("/api/agent/stream", json=req_body, headers=user_headers)
    assert stream_res.status_code == 200
    assert "text/event-stream" in stream_res.headers.get("content-type", "")
    stream_content = stream_res.text
    assert "event: trace" in stream_content
    assert "event: token" in stream_content
    assert "event: done" in stream_content
    print("PASS: /api/agent/stream produced valid SSE stream with traces and tokens")

def test_dynamic_and_fallback_tool_execution():
    from backend.agent import tools

    # 1. Verify fallback coverage for all 8 canonical moods
    canonical_moods = ["Calm", "Anxious", "Grateful", "Motivated", "Sad", "Angry", "Overwhelmed", "Hopeful"]
    for mood in canonical_moods:
        res = tool_registry.execute_tool(
            "tool_generate_inspirational_prompts",
            "test-user",
            {"mood": mood}
        )
        assert res["mood"] == mood
        assert len(res["prompts"]) >= 3, f"Expected prompts for mood {mood}"

    # 2. Verify milestone structure (works dynamically or in fallback)
    stress_res = tool_registry.execute_tool(
        "tool_generate_actionable_milestones",
        "test-user",
        {"insights": "Feeling extreme work stress and constant overwhelm with deadlines."}
    )
    assert len(stress_res["immediate_24h_action"]) > 5
    assert len(stress_res["short_term_milestone"]) > 5
    assert len(stress_res["mindset_shift"]) > 5

    # 3. Explicitly verify deterministic fallback when LLM is unavailable
    original_invoke = tools._invoke_gemini_json
    try:
        tools._invoke_gemini_json = lambda *args, **kwargs: None
        fallback_milestones = tool_registry.execute_tool(
            "tool_generate_actionable_milestones",
            "test-user",
            {"insights": "Feeling extreme work stress and constant overwhelm with deadlines."}
        )
        assert "sanctuary" in fallback_milestones["immediate_24h_action"].lower()

        fallback_prompts = tool_registry.execute_tool(
            "tool_generate_inspirational_prompts",
            "test-user",
            {"mood": "Overwhelmed"}
        )
        assert len(fallback_prompts["prompts"]) == 4
        assert "noise" in fallback_prompts["prompts"][1].lower() or "task" in fallback_prompts["prompts"][0].lower()
    finally:
        tools._invoke_gemini_json = original_invoke

    # 4. Verify memory search with tags and time_window
    mem_res = tool_registry.execute_tool(
        "tool_search_journal_memory",
        "test-user",
        {"query": "reflection", "tags": ["#Work"], "time_window": "recent"}
    )
    assert "results" in mem_res
    assert "total_past_entries" in mem_res

    # 5. Verify simulated dynamic LLM JSON path
    try:
        tools._invoke_gemini_json = lambda prompt, system_instruction=None: {
            "analysis_mode": "socratic",
            "patterns_detected": 1,
            "insights": [{
                "distortion": "Fortune Telling",
                "evidence": "Assuming the worst will happen tomorrow",
                "empowering_reframe": "The future is unwritten; focus on what is true right now."
            }]
        }

        dyn_res = tool_registry.execute_tool(
            "tool_analyze_cognitive_framing",
            "test-user",
            {"entry_text": "Everything tomorrow will go wrong.", "mode": "socratic"}
        )
        assert dyn_res["patterns_detected"] == 1
        assert dyn_res["insights"][0]["distortion"] == "Fortune Telling"
    finally:
        tools._invoke_gemini_json = original_invoke

    print("PASS: test_dynamic_and_fallback_tool_execution passed for all 8 moods and dynamic paths")

if __name__ == "__main__":
    test_tool_registry_and_parameter_validation()
    test_model_fallback_ladder()
    test_agent_endpoints()
    test_dynamic_and_fallback_tool_execution()
    print("\nALL AUTOMATED TESTS FOR TICKET 03 PASSED SUCCESSFULLY!")

