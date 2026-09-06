import logging
import json
import re
from typing import List, Dict, Any, Optional, Generator
from pydantic import BaseModel, Field

from backend.agent.tools import tool_registry
from backend.agent.fallback import (
    gemini_manager, 
    generate_content_with_fallback, 
    MODEL_FALLBACK_LADDER
)

logger = logging.getLogger("mindmirror.agent.engine")

PERSONA_PROMPTS = {
    "socratic": (
        "You are MindMirror's Socratic Reflection Mirror. Your goal is not to give quick advice, "
        "but to gently unpack underlying beliefs, examine unstated assumptions, and formulate poignant, "
        "open-ended questions that lead the user deeper into self-discovery."
    ),
    "action_momentum": (
        "You are MindMirror's Action Momentum Strategist. You specialize in converting abstract emotional processing "
        "and overwhelming thoughts into concrete, bounded micro-actions and immediate 24-hour steps."
    ),
    "pattern_memory": (
        "You are MindMirror's Longitudinal Pattern & Memory Tracker. You utilize the memory search tool to correlate "
        "the current entry with historical reflections, surfacing recurrent emotional cycles, behavioral loops, "
        "and past breakthroughs. You MUST actively cite and compare the user's past reflections whenever retrieved."
    ),
    "cognitive_reframing": (
        "You are MindMirror's Cognitive Clarity & Reframing Companion. You identify cognitive traps (all-or-nothing thinking, "
        "catastrophizing, emotional reasoning) with compassion, illuminating two alternative, grounded, empowering lenses."
    ),
    "guided_inquiry": (
        "You are MindMirror's Guided Follow-Up Inquirer. Formulate 3 thoughtful, tailored follow-up questions designed to "
        "inspire the user's subsequent writing session."
    ),
}

class AgentInteractRequest(BaseModel):
    message: str = Field(description="The user's prompt or question to the agent.")
    mode: str = Field(default="socratic", description="Cognitive persona mode.")
    entry_id: Optional[str] = Field(default=None, description="Current reflection ID.")
    entry_title: Optional[str] = Field(default="", description="Current reflection title.")
    entry_content: Optional[str] = Field(default="", description="Current reflection body text.")
    entry_mood: Optional[str] = Field(default="Reflective", description="Active mood state.")
    entry_tags: Optional[List[str]] = Field(default_factory=list, description="Active tags.")
    dialogue_history: Optional[List[Dict[str, str]]] = Field(default_factory=list, description="Past turns in session.")

class AgentTraceStep(BaseModel):
    step_type: str  # 'thought', 'tool_call', 'observation', 'synthesis'
    title: str
    detail: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class AgentInteractResponse(BaseModel):
    response: str
    mode: str
    model_used: str
    trace_steps: List[AgentTraceStep]

class MindMirrorAgent:
    """
    Autonomous Cognitive Agent executing a server-side ReAct loop (Reasoning ⇄ Tool Calling ⇄ Observation ⇄ Synthesis)
    with native Gemini function calling, 4-tier model fallback ladder, and strict user data isolation.
    """

    def __init__(self):
        self.tool_registry = tool_registry

    def _determine_tools_to_invoke_heuristically(self, request: AgentInteractRequest) -> List[tuple[str, Dict[str, Any]]]:
        """Heuristic planner used in dev simulation mode or to guide ReAct tool selection."""
        message = request.message
        entry_content = request.entry_content or ""
        mode = request.mode
        msg_lower = message.lower()
        content_lower = entry_content.lower()
        invocations = []

        if mode == "pattern_memory" or any(w in msg_lower for w in ["before", "past", "history", "pattern", "always feel", "remember"]):
            from backend.agent.tools import MEMORY_STOP_WORDS
            smart_query_parts = []
            if request.entry_tags:
                smart_query_parts.extend([t.lstrip("#") for t in request.entry_tags if t])
            if request.entry_title and request.entry_title.lower() != "untitled reflection":
                smart_query_parts.append(request.entry_title)

            # Filter stop words from message and content
            msg_keywords = [w for w in re.findall(r'\b[a-zA-Z]{3,}\b', message.lower()) if w not in MEMORY_STOP_WORDS]
            if msg_keywords:
                smart_query_parts.append(" ".join(msg_keywords[:5]))
            elif entry_content:
                content_keywords = [w for w in re.findall(r'\b[a-zA-Z]{3,}\b', entry_content.lower()) if w not in MEMORY_STOP_WORDS]
                if content_keywords:
                    smart_query_parts.append(" ".join(content_keywords[:5]))

            search_query = " ".join(smart_query_parts).strip() or "reflection"

            invocations.append(("tool_search_journal_memory", {
                "query": search_query,
                "mood": request.entry_mood,
                "tags": request.entry_tags,
                "time_window": "all",
                "exclude_id": request.entry_id,
                "exclude_title": request.entry_title,
            }))

        if mode == "cognitive_reframing" or any(w in msg_lower or w in content_lower for w in ["fail", "ruined", "never", "should", "hopeless", "anxious", "stuck"]):
            invocations.append(("tool_analyze_cognitive_framing", {
                "entry_text": entry_content or message,
                "mode": mode
            }))

        if mode == "action_momentum" or any(w in msg_lower for w in ["what should i do", "action", "step", "next", "micro-action"]):
            invocations.append(("tool_generate_actionable_milestones", {
                "insights": entry_content[:200] or message
            }))

        if mode == "guided_inquiry" or any(w in msg_lower for w in ["prompt", "question", "inquiry", "next session"]):
            invocations.append(("tool_generate_inspirational_prompts", {
                "mood": request.entry_mood or "Reflective",
                "content": entry_content,
                "mode": mode
            }))

        if any(w in msg_lower for w in ["summary", "synthesize", "takeaway", "overview"]):
            invocations.append(("tool_synthesize_entry", {
                "entry_text": entry_content or message
            }))

        if not invocations:
            invocations.append(("tool_analyze_cognitive_framing", {
                "entry_text": entry_content or message,
                "mode": mode
            }))

        return invocations[:2]

    def interact(self, user_id: str, request: AgentInteractRequest) -> AgentInteractResponse:
        """Executes the full ReAct cognitive interaction loop with grounded tool execution."""
        trace_steps: List[AgentTraceStep] = []
        persona_prompt = PERSONA_PROMPTS.get(request.mode, PERSONA_PROMPTS["socratic"])

        # Step 1: Cognitive Sense & Plan
        trace_steps.append(AgentTraceStep(
            step_type="thought",
            title="Sensing Reflection Context & Planning",
            detail=f"Analyzing entry mood '{request.entry_mood}', persona '{request.mode}', and user inquiry."
        ))

        # Step 2: Resilient ReAct Execution Loop (Tool Calling & Observation FIRST)
        heuristic_tools = self._determine_tools_to_invoke_heuristically(request)

        observations: List[tuple[str, Dict[str, Any]]] = []
        memory_excerpts: List[str] = []

        for tool_name, tool_args in heuristic_tools:
            trace_steps.append(AgentTraceStep(
                step_type="tool_call",
                title=f"Invoking Server-Side Tool: {tool_name}",
                detail=f"Executing tool with user scope /users/{user_id}/entries.",
                data={"arguments": tool_args}
            ))

            try:
                obs = self.tool_registry.execute_tool(tool_name, user_id, tool_args)
                observations.append((tool_name, obs))
                is_mem = (tool_name == "tool_search_journal_memory")
                matches_count = obs.get("matches_found", 0)

                if is_mem and "results" in obs:
                    for res in obs["results"][:3]:
                        title = res.get("title") or "Untitled Reflection"
                        mood = res.get("mood") or "Reflective"
                        date_val = res.get("date") or res.get("created_at") or "Past Entry"
                        if "T" in str(date_val):
                            date_val = str(date_val).split("T")[0]
                        snippet_text = res.get("excerpt") or res.get("snippet") or "(No written snippet)"
                        memory_excerpts.append(
                            f"- Historical Past Entry [Date: {date_val}] (Title: \"{title}\", Mood: {mood}): \"{snippet_text}\""
                        )

                trace_steps.append(AgentTraceStep(
                    step_type="observation",
                    title="Consulted Past Memories Archive" if is_mem else f"Observation Received from {tool_name}",
                    detail=f"Found {matches_count} relevant historical reflections in user archive." if is_mem else "Tool execution returned structured data.",
                    data={"result": obs, "memory_consulted": is_mem, "matches_found": matches_count}
                ))
            except Exception as tool_err:
                logger.error(f"Error executing tool {tool_name}: {tool_err}")
                trace_steps.append(AgentTraceStep(
                    step_type="observation",
                    title=f"Tool Execution Note: {tool_name}",
                    detail=str(tool_err)
                ))

        # Step 3: Synthesis grounded in tool observations & memories
        client = gemini_manager.get_client()
        model_used = MODEL_FALLBACK_LADDER[0]

        if client:
            try:
                def call_gemini(selected_model: str):
                    from google.genai import types
                    import json

                    mem_section = ""
                    if memory_excerpts:
                        mem_section = (
                            "\n\n=======================================================\n"
                            "CRITICAL RETRIEVED MEMORIES FROM USER'S PAST REFLECTIONS:\n"
                            "=======================================================\n"
                            + "\n".join(memory_excerpts) +
                            "\n\n*** MANDATORY REQUIREMENT FOR PATTERN_MEMORY MODE ***\n"
                            "You MUST explicitly cite and discuss these retrieved past reflections in your reply:\n"
                            "1. Reference the past reflection by its Title and Date (e.g., 'In your reflection on [Date] titled \"[Title]\"...').\n"
                            "2. Note what the user felt or learned back then, comparing it directly to what they are experiencing today.\n"
                            "3. Surface recurring emotional patterns, coping mechanisms that helped them before, or milestones of growth.\n"
                            "Do NOT speak in vague generalities or omit these retrieved memories."
                        )
                    elif request.mode == "pattern_memory":
                        mem_section = "\n\nHistorical Memories Retrieved: (No previous matching reflections found yet in user archive; acknowledge this and invite ongoing reflection across days)."

                    obs_section = ""
                    for tname, tobs in observations:
                        if tname != "tool_search_journal_memory":
                            obs_section += f"\n\nTool Findings ({tname}):\n{json.dumps(tobs)}"

                    system_instruction = (
                        f"{persona_prompt}\n\n"
                        f"Current Entry Title: {request.entry_title or 'Untitled'}\n"
                        f"Current Mood: {request.entry_mood}\n"
                        f"Current Tags: {', '.join(request.entry_tags or [])}\n"
                        f"Current Entry Content:\n\"\"\"{request.entry_content}\"\"\"\n"
                        f"{mem_section}"
                        f"{obs_section}\n\n"
                        "Synthesize an empathetic, poignant response directly grounded in the reflection context, "
                        "incorporating any observed tool data or past journal memories."
                    )

                    config = types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.7,
                    )

                    return client.models.generate_content(
                        model=selected_model,
                        contents=request.message,
                        config=config,
                    )

                gemini_res, model_used = generate_content_with_fallback(call_gemini)
                final_text = gemini_res.text or "I have processed your reflection and remain present with you."

                trace_steps.append(AgentTraceStep(
                    step_type="synthesis",
                    title="Cognitive Synthesis Completed",
                    detail=f"Synthesized response via {model_used} grounded in tool observations."
                ))

                return AgentInteractResponse(
                    response=final_text,
                    mode=request.mode,
                    model_used=model_used,
                    trace_steps=trace_steps,
                )

            except Exception as e:
                logger.warning(f"Live Gemini API interaction stepped down to cognitive simulation engine: {e}")

        # Deterministic Heuristic Synthesis Fallback
        trace_steps.append(AgentTraceStep(
            step_type="synthesis",
            title="Synthesizing Empathetic Response",
            detail=f"Integrating observations through {request.mode} persona lens."
        ))

        synthesis_lines = []
        if request.mode == "socratic":
            synthesis_lines.append("I hear the depth behind your words in this reflection.")
            if request.entry_title:
                synthesis_lines.append(f"When you reflect on **\"{request.entry_title}\"**, what feels like the most vulnerable part of that realization?")
            synthesis_lines.append("\nConsider this:")
            synthesis_lines.append("> *What expectation are you holding yourself to in this moment that you wouldn't demand of someone you love?*")
            synthesis_lines.append("\nWhat arises in you when you give yourself permission to simply experience this without trying to solve it immediately?")

        elif request.mode == "action_momentum":
            synthesis_lines.append("Breaking down this reflection into bounded, high-leverage momentum:")
            # Use milestone tool observations if available
            ms_obs = next((obs for tname, obs in observations if tname == "tool_generate_actionable_milestones"), None)
            if ms_obs and ms_obs.get("immediate_24h_action"):
                synthesis_lines.append("### 🎯 Immediate Action Steps")
                synthesis_lines.append(f"1. **24-Hour Micro-Action**: {ms_obs['immediate_24h_action']}")
                synthesis_lines.append(f"2. **Short-Term Milestone**: {ms_obs['short_term_milestone']}")
                synthesis_lines.append(f"3. **Mindset Anchor**: {ms_obs['mindset_shift']}")
            else:
                synthesis_lines.append("### 🎯 Immediate Action Steps")
                synthesis_lines.append("1. **24-Hour Micro-Action**: Dedicate 5 quiet minutes to write down the single highest-priority decision facing you.")
                synthesis_lines.append("2. **Short-Term Milestone**: Establish one clear boundary around your time to protect mental bandwidth.")
                synthesis_lines.append("3. **Mindset Anchor**: Remind yourself that progress is built on quiet consistency, not intense bursts.")

        elif request.mode == "pattern_memory":
            synthesis_lines.append("### 🪞 Longitudinal Pattern Recognition")
            synthesis_lines.append(f"Examining your past reflections alongside your current state ({request.entry_mood}):")
            if memory_excerpts:
                synthesis_lines.append("\n**Retrieved Historical Reflections**:")
                for mem in memory_excerpts:
                    synthesis_lines.append(f"{mem}")
                synthesis_lines.append("\n**Subconscious Loop & Pattern Analysis**:")
                synthesis_lines.append("- **Recurring Pattern**: Notice how similar emotional themes surfaced in these earlier reflections when navigating uncertainty or high internal expectations.")
                synthesis_lines.append("- **Past Breakthrough**: In your previous entries, clarity returned once you named the specific feelings rather than carrying them alone.")
                synthesis_lines.append("\n> **Longitudinal Inquiry**: When you compare what you wrote in those past reflections with your words today, what growth or familiar rhythm stands out to you?")
            else:
                synthesis_lines.append("\nI searched your journal memory archive in Firestore. As you log additional reflections with shared moods or #tags, I will automatically map emotional cycles and recurrent patterns across time.")
                synthesis_lines.append("> **Pattern Anchor**: What recurring theme from today feels most connected to how you've been feeling recently?")

        elif request.mode == "cognitive_reframing":
            synthesis_lines.append("### 🔍 Cognitive Reframing & Mental Clarity")
            cf_obs = next((obs for tname, obs in observations if tname == "tool_analyze_cognitive_framing"), None)
            if cf_obs and cf_obs.get("insights"):
                synthesis_lines.append("Examining cognitive framing in your reflection:")
                for ins in cf_obs["insights"][:2]:
                    synthesis_lines.append(f"- **Pattern Detected ({ins.get('distortion', 'Framing')})**: *\"{ins.get('evidence', '')}\"*")
                    synthesis_lines.append(f"  👉 **Empowering Reframe**: {ins.get('empowering_reframe', '')}")
            else:
                synthesis_lines.append("Notice where absolute terms or harsh internal standards might be amplifying pressure:")
                synthesis_lines.append("1. **Initial Lens**: *\"I have to figure this out right now or things won't go well.\"*")
                synthesis_lines.append("2. **Empowering Reframe**: *\"I am learning in real time. It is completely natural to feel uncertain while growing.\"*")
            synthesis_lines.append("\nHow does this reframed lens feel in your body right now?")

        else: # guided_inquiry
            synthesis_lines.append("### ✍️ Guided Follow-Up Prompts")
            synthesis_lines.append("To deepen your processing during your next writing session:")
            synthesis_lines.append("1. *What feeling are you avoiding naming directly in this reflection?*")
            synthesis_lines.append("2. *If you knew everything would turn out all right, what decision would you make today?*")
            synthesis_lines.append("3. *What is one small kindness you can extend to yourself before this day ends?*")

        final_response_text = "\n".join(synthesis_lines)

        return AgentInteractResponse(
            response=final_response_text,
            mode=request.mode,
            model_used=model_used,
            trace_steps=trace_steps,
        )

    def stream_interact(self, user_id: str, request: AgentInteractRequest) -> Generator[Dict[str, Any], None, None]:
        """Streams ReAct execution trace events followed by token chunks via Server-Sent Events."""
        result = self.interact(user_id, request)

        # Emit all trace steps first
        for step in result.trace_steps:
            yield {
                "event": "trace",
                "data": step.model_dump(),
            }

        # Stream response text chunks
        words = result.response.split(" ")
        for i in range(0, len(words), 3):
            chunk = " ".join(words[i:i+3]) + " "
            yield {
                "event": "token",
                "data": {"token": chunk},
            }

        # Emit completion
        yield {
            "event": "done",
            "data": {
                "mode": result.mode,
                "model_used": result.model_used,
                "total_trace_steps": len(result.trace_steps),
            },
        }

    def synthesize_entry_direct(self, user_id: str, entry_content: str, entry_title: str = "") -> Dict[str, Any]:
        """Direct invocation of entry synthesis tool for 1-click executive summary, takeaways, and title suggestion."""
        return self.tool_registry.execute_tool(
            "tool_synthesize_entry",
            user_id,
            {"entry_text": f"{entry_title}\n{entry_content}".strip() or "Reflection"}
        )

mindmirror_agent = MindMirrorAgent()

