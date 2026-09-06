import logging
import os
from typing import List, Optional, Any, Dict, Callable
from backend.config import settings

logger = logging.getLogger("mindmirror.agent.fallback")

# Official 4-tier resilient model fallback ladder ordered by availability and latency
MODEL_FALLBACK_LADDER: List[str] = [
    "gemini-3.8-flash",       # Primary high-efficiency agent model
    "gemini-3.1-flash-lite",   # Fast, low-latency fallback
    "gemini-flash-latest",     # General availability dynamic alias
    "gemini-3.7-flash",        # Extended deep reasoning tier
]

RECOVERABLE_STATUS_CODES = [429, 503, 500, 404]
RECOVERABLE_ERROR_KEYWORDS = [
    "rate limit",
    "resource exhausted",
    "unavailable",
    "quota",
    "overloaded",
    "not found",
    "internal error",
    "503",
    "429",
    "500",
]

class GeminiClientManager:
    """Manages the official google-genai client with lazy initialization."""
    def __init__(self):
        self._client = None

    def get_client(self):
        if self._client is not None:
            return self._client

        api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY", "")
        if not api_key:
            logger.info("No GEMINI_API_KEY configured. Development simulation mode active.")
            return None

        try:
            from google import genai
            self._client = genai.Client(api_key=api_key)
            logger.info("google-genai Client successfully initialized.")
            return self._client
        except Exception as e:
            logger.warning(f"Could not initialize google-genai client: {e}")
            return None

gemini_manager = GeminiClientManager()

def is_recoverable_error(exc: Exception) -> bool:
    """Checks if an exception qualifies for fallback to the next model in the ladder."""
    msg = str(exc).lower()
    for keyword in RECOVERABLE_ERROR_KEYWORDS:
        if keyword in msg:
            return True
    # Check for HTTP status code attributes if available
    status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status_code in RECOVERABLE_STATUS_CODES:
        return True
    return False

def generate_content_with_fallback(
    execute_call_fn: Callable[[str], Any],
    model_ladder: Optional[List[str]] = None,
) -> tuple[Any, str]:
    """
    Executes a generation call through the 4-tier model fallback ladder.
    Returns (result, successful_model_name).
    """
    ladder = model_ladder or MODEL_FALLBACK_LADDER
    last_exception = None

    for idx, model_name in enumerate(ladder):
        try:
            logger.info(f"Attempting model generation with tier [{idx + 1}/{len(ladder)}]: {model_name}")
            result = execute_call_fn(model_name)
            return result, model_name
        except Exception as exc:
            last_exception = exc
            recoverable = is_recoverable_error(exc)
            logger.warning(
                f"Model generation failed with {model_name} (recoverable={recoverable}): {exc}"
            )
            if not recoverable and idx == 0:
                # If it's a fatal validation issue rather than transient API error, log and try next
                logger.info(f"Stepping down fallback ladder despite non-transient status: {exc}")

    raise RuntimeError(
        f"All models in fallback ladder exhausted: {[m for m in ladder]}. Last error: {last_exception}"
    )
