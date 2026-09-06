# MindMirror Domain Model & Glossary

This document formalizes the domain entities, ubiquitous language, and conceptual boundaries of the MindMirror AI Reflective Journaling platform.

---

## 1. Domain Entities & Core Concepts

### ReAct Agent Loop
An autonomous cognitive loop interleaving **Reasoning (Thought)**, **Action (Tool Calling)**, **Observation (Tool Output)**, and **Synthesis (Empathetic Response)**. Powered by Gemini 3.8 Flash, it grounds reflections in longitudinal personal context without pre-scripted conversational trees.

### Server-Side Tool Registry
The centralized, typed execution registry (`ToolRegistry`) managing all tools callable by the ReAct agent. It enforces:
1. Pydantic input schema validation.
2. User data boundary isolation (`user_id` partition).
3. Gemini `FunctionDeclaration` schema translation.
4. Two-layer hybrid execution (LLM primary, heuristic secondary).

### Cognitive Framing & Cognitive Distortions
The psychological process of identifying unhelpful, biased thought patterns in the user's reflection (based on Aaron Beck's Cognitive Behavioral Therapy framework) and offering balanced, constructive reframing:
- **All-or-Nothing Thinking / Catastrophizing**: Seeing circumstances in extreme absolutes ("never", "always", "ruined").
- **Emotional Reasoning**: Assuming negative feelings reflect objective reality ("I feel like a failure, so I am one").
- **'Should' Statements**: Rigid, guilt-inducing self-imposed demands ("I should have", "I must").
- **Overgeneralization**: Drawing sweeping negative conclusions from a single event.
- **Mental Filter**: Dwelling exclusively on negatives while ignoring positives.
- **Mind Reading / Fortune Telling**: Assuming negative intentions in others or predicting hopeless outcomes.

### Socratic Reflection
A non-judgmental inquiry mode where the agent avoids prescriptive advice, instead posing deep, targeted open-ended questions that prompt the user to examine their assumptions.

### Action Momentum
The cognitive transition from contemplation to bounded execution. It translates amorphous realizations into:
1. **Immediate 24-Hour Micro-Action**: A friction-free step executable within 24 hours.
2. **Short-Term Milestone**: A 48-to-72 hour tangible checkpoint.
3. **Mindset Shift**: A gentle cognitive anchor replacing judgment with curiosity.

### Longitudinal Reflection Memory
The chronological archive of user reflections stored under `/users/{userId}/entries`. Memory search evaluates:
- **Semantic & Lexical Relevance**: Matching thematic keywords and emotional triggers.
- **Mood Correlation**: Filtering by one of the 8 canonical emotional states.
- **Tag Clusters**: Categorical boundaries (e.g., `#Work`, `#Growth`, `#Relationships`).
- **Temporal Windows**: Recency bounds (`recent` = 7 days, `month` = 30 days, `year` = 365 days, `all`).

### 4-Decimal Geo-Privacy Boundary
To prevent high-precision telemetry and physical surveillance risks while enabling meaningful spatial journaling, all coordinate data (`lat`, `lng`) is sanitized server-side and truncated to 4 decimal places (~11 meters ground resolution). EXIF metadata and precision sub-meter tracking are discarded.

### Model Fallback Ladder
A 4-tier resilient failover hierarchy that transparently catches recoverable exceptions (HTTP 429 rate limits, 503 service unavailable, quota exhaustion):
1. Tier 1: `gemini-3.8-flash` (Primary agent model)
2. Tier 2: `gemini-3.1-flash-lite` (Low-latency backup)
3. Tier 3: `gemini-flash-latest` (Dynamic general availability alias)
4. Tier 4: `gemini-3.7-flash` (Extended reasoning tier)

---

## 2. Canonical Emotional States (8 Moods)

MindMirror categorizes reflections across 8 distinct emotional states:
1. **Calm**: Centered, serene, reflective peace.
2. **Anxious**: Nervous tension, uncertainty, anticipated threats.
3. **Grateful**: Appreciation, connection, acknowledged abundance.
4. **Motivated**: Energized, determined, forward-moving agency.
5. **Sad**: Mourning, melancholy, low emotional energy.
6. **Angry**: Frustration, perceived injustice, boundary violation.
7. **Overwhelmed**: Excessive cognitive load, diffused attention.
8. **Hopeful**: Cautious optimism, renewal, open anticipation.

---

## 3. Cognitive Personas

MindMirror's agent operates across 5 interchangeable cognitive modes:
- `socratic`: Deep inquiry and assumption questioning.
- `action_momentum`: Concrete micro-actions and immediate 24h momentum.
- `pattern_memory`: Longitudinal theme correlation across past reflections.
- `cognitive_reframing`: Cognitive distortion detection and empowering reframed perspectives.
- `guided_inquiry`: Tailored prompt generation for future writing sessions.
