import logging
import json
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.auth import get_current_user, AuthenticatedUser
from backend.agent.engine import (
    mindmirror_agent,
    AgentInteractRequest,
    AgentInteractResponse,
)
from backend.agent.tools import tool_registry

logger = logging.getLogger("mindmirror.routes.agent")

router = APIRouter(prefix="/api/agent", tags=["agent"])

class PromptIdeasRequest(BaseModel):
    mood: str = Field(default="Reflective")
    mode: str = Field(default="socratic")

class PromptIdeasResponse(BaseModel):
    mood: str
    mode: str
    prompts: List[str]

@router.post("/interact", response_model=AgentInteractResponse)
async def interact_with_agent(
    request: AgentInteractRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Executes the ReAct Cognitive Agent loop with tool calling and returns
    both the synthesized guidance and the full execution trace.
    Zero API keys are exposed to the client.
    """
    try:
        response = mindmirror_agent.interact(user.uid, request)
        return response
    except Exception as e:
        logger.error(f"Error during agent interaction for user {user.uid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cognitive Agent processing error: {str(e)}",
        )

@router.post("/stream")
async def stream_agent_interaction(
    request: AgentInteractRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Server-Sent Events (SSE) endpoint streaming reasoning steps,
    tool execution trace tokens, and generated text chunks in real-time.
    """
    def event_generator():
        try:
            for event_dict in mindmirror_agent.stream_interact(user.uid, request):
                event_name = event_dict.get("event", "message")
                data_str = json.dumps(event_dict.get("data", {}))
                yield f"event: {event_name}\ndata: {data_str}\n\n"
        except Exception as e:
            logger.error(f"Error streaming agent response: {e}")
            err_data = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {err_data}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/prompt-ideas", response_model=PromptIdeasResponse)
async def get_prompt_ideas(
    request: PromptIdeasRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Generates mode- and mood-tailored prompt chips to inspire user writing.
    """
    prompts_result = tool_registry.execute_tool(
        "tool_generate_inspirational_prompts",
        user.uid,
        {"mood": request.mood}
    )
    return PromptIdeasResponse(
        mood=request.mood,
        mode=request.mode,
        prompts=prompts_result.get("prompts", []),
    )

class SynthesizeRequest(BaseModel):
    title: Optional[str] = Field(default="")
    content: str = Field(default="")

@router.post("/synthesize")
async def synthesize_entry_endpoint(
    request: SynthesizeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Executes tool_synthesize_entry on demand, returning executive summary,
    3 takeaways, and an evocative suggested title.
    """
    res = mindmirror_agent.synthesize_entry_direct(
        user_id=user.uid,
        entry_content=request.content,
        entry_title=request.title or ""
    )
    return res

