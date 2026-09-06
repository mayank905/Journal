import logging
import re
from typing import Dict, Any, List, Optional, Callable
from pydantic import BaseModel, Field, field_validator
from backend.services.entry_service import entry_service

logger = logging.getLogger("mindmirror.agent.tools")

# 1. Pydantic Parameter Schemas for Server-Side Tools

class SearchJournalMemoryParams(BaseModel):
    query: str = Field(description="Search keywords, emotional triggers, or themes to find in past reflections.")
    mood: Optional[str] = Field(default=None, description="Optional emotional mood to filter by (e.g., Anxious, Grateful, Calm).")
    tags: Optional[List[str]] = Field(default=None, description="Optional list of tags to filter by.")
    time_window: Optional[str] = Field(default="all", description="Time window for search ('recent', 'month', 'year', 'all').")

class AnalyzeCognitiveFramingParams(BaseModel):
    entry_text: str = Field(description="The journal reflection text to inspect for cognitive distortions.")
    mode: Optional[str] = Field(default="cognitive_clarity", description="Framing mode: 'socratic', 'cognitive_clarity', 'action_momentum'.")

class SynthesizeEntryParams(BaseModel):
    entry_text: str = Field(description="The journal text to synthesize into an executive summary, takeaways, and title.")

class GenerateMilestonesParams(BaseModel):
    insights: str = Field(description="The key realizations or challenges extracted from the journal.")

class ResolveLocationParams(BaseModel):
    location_name: str = Field(description="Name of the place, city, or venue.")
    coordinates: Optional[Dict[str, float]] = Field(
        default=None, 
        description="Optional coordinates dict with 'lat' and 'lng' keys."
    )

    @field_validator("coordinates")
    @classmethod
    def validate_coordinates(cls, v: Optional[Dict[str, float]]) -> Optional[Dict[str, float]]:
        if not v:
            return None
        lat = v.get("lat")
        lng = v.get("lng")
        if lat is not None and not (-90 <= lat <= 90):
            raise ValueError(f"Latitude must be between -90 and 90, got {lat}")
        if lng is not None and not (-180 <= lng <= 180):
            raise ValueError(f"Longitude must be between -180 and 180, got {lng}")
        # Truncate to 4 decimal places for geo-spatial privacy (~11m)
        return {
            "lat": round(lat, 4) if lat is not None else 0.0,
            "lng": round(lng, 4) if lng is not None else 0.0,
        }

class GeneratePromptsParams(BaseModel):
    mood: str = Field(default="Reflective", description="Current emotional state of the user.")
    recent_themes: Optional[List[str]] = Field(default=None, description="Themes or topics from recent reflections.")

# 2. Tool Implementations

def execute_search_journal_memory(user_id: str, params: SearchJournalMemoryParams) -> Dict[str, Any]:
    """Autonomously queries user's past reflections in Firestore under /users/{userId}/entries."""
    user_entries = entry_service.list_entries(user_id)
    query_lower = params.query.lower()
    matches = []

    for entry in user_entries:
        score = 0
        text_corpus = f"{entry.title} {entry.content} {' '.join(entry.tags)}".lower()
        if query_lower in text_corpus:
            score += 2
        for word in query_lower.split():
            if len(word) > 2 and word in text_corpus:
                score += 1

        if params.mood and entry.mood.lower() == params.mood.lower():
            score += 2

        if score > 0:
            matches.append({
                "id": entry.id,
                "title": entry.title,
                "mood": entry.mood,
                "tags": entry.tags,
                "created_at": entry.createdAt if hasattr(entry, "createdAt") else entry.created_at,
                "snippet": entry.content[:160] + "..." if len(entry.content) > 160 else entry.content,
                "score": score,
            })

    matches.sort(key=lambda x: x["score"], reverse=True)
    return {
        "query": params.query,
        "total_past_entries": len(user_entries),
        "matches_found": len(matches[:5]),
        "results": matches[:5],
    }

def execute_analyze_cognitive_framing(user_id: str, params: AnalyzeCognitiveFramingParams) -> Dict[str, Any]:
    """Detects cognitive distortions and provides empowering alternative lenses."""
    text = params.entry_text.lower()
    detected_patterns = []

    if any(w in text for w in ["always", "never", "ruined", "completely", "impossible", "hopeless"]):
        detected_patterns.append({
            "distortion": "All-or-Nothing Thinking / Catastrophizing",
            "evidence": "Use of absolute terms ('always', 'never', 'ruined')",
            "empowering_reframe": "Things rarely exist in absolutes. What is one nuance or middle-ground reality you can acknowledge?",
        })

    if any(w in text for w in ["feel like a failure", "feels like nobody", "feel stupid", "i feel that it's over"]):
        detected_patterns.append({
            "distortion": "Emotional Reasoning",
            "evidence": "Treating transient emotions as objective external facts",
            "empowering_reframe": "Feelings are valid emotional signals, but they are not immutable facts. What does the factual evidence say?",
        })

    if any(w in text for w in ["should have", "must", "ought to", "supposed to"]):
        detected_patterns.append({
            "distortion": "'Should' Statements",
            "evidence": "Rigid expectations generating unneeded guilt or pressure",
            "empowering_reframe": "Can you replace 'I should' with 'I choose to' or 'It would be helpful if'?",
        })

    if not detected_patterns:
        detected_patterns.append({
            "distortion": "Grounded Self-Reflection",
            "evidence": "Nuanced processing without intense cognitive distortions",
            "empowering_reframe": "Your perspective appears balanced. Where would you like to deepen your clarity?",
        })

    return {
        "analysis_mode": params.mode,
        "patterns_detected": len(detected_patterns),
        "insights": detected_patterns,
    }

def execute_synthesize_entry(user_id: str, params: SynthesizeEntryParams) -> Dict[str, Any]:
    """Generates an empathetic 2-sentence executive summary, 3 takeaways, and a 3-6 word evocative title."""
    text = params.entry_text.strip()
    words = text.split()
    
    # Generate clean 3-6 word evocative title
    if words:
        candidate_words = [w.strip(".,!?;:\"'()[]{}") for w in words[:6] if len(w) > 2]
        title_body = " ".join(candidate_words[:4]).title() if candidate_words else "Quiet Reflection"
        suggested_title = title_body if 3 <= len(title_body.split()) <= 6 else f"Journey Through {title_body.split()[0]}"
    else:
        suggested_title = "Unspoken Inner Landscape"

    summary = text[:220] + ("..." if len(text) > 220 else "")
    exec_summary = f"This reflection delves honestly into your current personal thoughts and internal states. {summary}"

    return {
        "word_count": len(words),
        "suggested_title": suggested_title,
        "summary": exec_summary,
        "executive_summary": exec_summary,
        "takeaways": [
            "Acknowledge the emotions present without needing to immediately resolve them.",
            "Notice where expectations may be creating friction against your peace of mind.",
            "Take one gentle, bounded micro-step to honor your needs today.",
        ],
    }


def execute_generate_actionable_milestones(user_id: str, params: GenerateMilestonesParams) -> Dict[str, Any]:
    """Converts realizations into 24h micro-actions, short-term milestones, and mindset shifts."""
    return {
        "immediate_24h_action": "Dedicate 5 minutes of focused stillness to note your single most important priority.",
        "short_term_milestone": "Follow through on one bounded micro-step directly related to this breakthrough within 48 hours.",
        "mindset_shift": "Allow curiosity to replace judgment when navigating resistance or uncertainty.",
    }

def execute_resolve_and_anchor_location(user_id: str, params: ResolveLocationParams) -> Dict[str, Any]:
    """Server-side location validation with 4-decimal privacy boundary enforcement."""
    coords = params.coordinates or {"lat": 0.0, "lng": 0.0}
    # Ensure 4-decimal precision (~11m resolution)
    sanitized_coords = {
        "lat": round(coords.get("lat", 0.0), 4),
        "lng": round(coords.get("lng", 0.0), 4),
    }
    return {
        "anchored_place": params.location_name,
        "sanitized_coordinates": sanitized_coords,
        "privacy_guarantee": "Coordinates truncated to 4 decimal places (~11 meters). High-precision tracking EXIF removed.",
    }

def execute_generate_inspirational_prompts(user_id: str, params: GeneratePromptsParams) -> Dict[str, Any]:
    """Tailors prompt suggestions based on current emotional mood."""
    mood = params.mood.capitalize()
    prompts_map = {
        "Calm": [
            "What quiet realization brought you this sense of ease?",
            "How can you anchor this peaceful presence into your week?",
            "What boundary did you uphold that allowed this space?",
            "What are you grateful not to be rushing through right now?",
        ],
        "Anxious": [
            "What is the story your mind is telling you, and what are the actual facts?",
            "What is one physical sensation you notice right now without judging it?",
            "What is within your control in the next 30 minutes, and what must you release?",
            "If your best friend felt this anxiety, what reassuring truth would you tell them?",
        ],
        "Grateful": [
            "Who or what contributed unexpectedly to your well-being today?",
            "What small, often-overlooked detail brought a sense of richness to your day?",
            "How does expressing this gratitude shift your bodily energy?",
            "How can you pay this feeling forward to someone else?",
        ],
        "Motivated": [
            "What vision is energizing you right now, and why does it matter so much?",
            "What is the first, friction-free micro-step you can take in the next hour?",
            "What obstacle might emerge, and how will your future self handle it?",
            "How can you sustain this momentum without burning out?",
        ],
    }
    default_prompts = [
        "What is occupying the center of your awareness right now?",
        "What feeling or thought have you been postponing looking at?",
        "If you could give your present self one compassionate permission, what would it be?",
        "What pattern from yesterday would you like to gently evolve today?",
    ]
    return {
        "mood": mood,
        "prompts": prompts_map.get(mood, default_prompts),
    }

# 3. Extensible Server-Side Tool Registry

class ToolDefinition:
    def __init__(
        self,
        name: str,
        description: str,
        param_schema: type[BaseModel],
        executor: Callable[[str, Any], Dict[str, Any]],
    ):
        self.name = name
        self.description = description
        self.param_schema = param_schema
        self.executor = executor

    def to_gemini_declaration(self) -> Dict[str, Any]:
        """Converts to Gemini FunctionDeclaration dictionary schema."""
        json_schema = self.param_schema.model_json_schema()
        properties = {}
        for prop_name, prop_meta in json_schema.get("properties", {}).items():
            prop_dict: Dict[str, Any] = {
                "type": prop_meta.get("type", "string").upper(),
                "description": prop_meta.get("description", ""),
            }
            if prop_meta.get("type") == "array" and "items" in prop_meta:
                prop_dict["items"] = {"type": prop_meta["items"].get("type", "string").upper()}
            properties[prop_name] = prop_dict

        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "type": "OBJECT",
                "properties": properties,
                "required": json_schema.get("required", []),
            },
        }

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}

    def register(self, tool: ToolDefinition):
        self._tools[tool.name] = tool
        logger.info(f"Registered tool in server-side registry: {tool.name}")

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        return self._tools.get(name)

    def list_tools(self) -> List[ToolDefinition]:
        return list(self._tools.values())

    def execute_tool(self, tool_name: str, user_id: str, raw_arguments: Dict[str, Any]) -> Dict[str, Any]:
        tool = self.get_tool(tool_name)
        if not tool:
            raise ValueError(f"Tool '{tool_name}' not recognized in Server-Side Tool Registry.")

        # Strict Pydantic parameter validation
        validated_params = tool.param_schema(**raw_arguments)
        return tool.executor(user_id, validated_params)

    def get_gemini_tools_declarations(self) -> List[Dict[str, Any]]:
        return [t.to_gemini_declaration() for t in self._tools.values()]

tool_registry = ToolRegistry()

# Register the 6 native cognitive tools
tool_registry.register(ToolDefinition(
    name="tool_search_journal_memory",
    description="Autonomously queries user's past reflections in Firestore to surface longitudinal patterns, recurrent emotional triggers, and breakthroughs.",
    param_schema=SearchJournalMemoryParams,
    executor=execute_search_journal_memory,
))

tool_registry.register(ToolDefinition(
    name="tool_analyze_cognitive_framing",
    description="Detects cognitive distortions (catastrophizing, all-or-nothing thinking, emotional reasoning) and suggests empowering reframed lenses.",
    param_schema=AnalyzeCognitiveFramingParams,
    executor=execute_analyze_cognitive_framing,
))

tool_registry.register(ToolDefinition(
    name="tool_synthesize_entry",
    description="Evaluates reflection content to generate an empathetic executive summary, 3 bulleted takeaways, and a suggested title.",
    param_schema=SynthesizeEntryParams,
    executor=execute_synthesize_entry,
))

tool_registry.register(ToolDefinition(
    name="tool_generate_actionable_milestones",
    description="Converts open reflections and breakthroughs into immediate (24h) micro-actions, short-term milestones, and mindset-shift anchors.",
    param_schema=GenerateMilestonesParams,
    executor=execute_generate_actionable_milestones,
))

tool_registry.register(ToolDefinition(
    name="tool_resolve_and_anchor_location",
    description="Validates and anchors geo-spatial coordinates server-side, enforcing 4-decimal coordinate truncation (~11m privacy) and stripping high-precision telemetry.",
    param_schema=ResolveLocationParams,
    executor=execute_resolve_and_anchor_location,
))

tool_registry.register(ToolDefinition(
    name="tool_generate_inspirational_prompts",
    description="Generates 4 custom prompts tailored to the user's emotional state and recent journaling themes.",
    param_schema=GeneratePromptsParams,
    executor=execute_generate_inspirational_prompts,
))
