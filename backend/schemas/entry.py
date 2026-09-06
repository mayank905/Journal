from datetime import datetime
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field, field_validator

VALID_MOODS = [
    "Calm",
    "Reflective",
    "Grateful",
    "Motivated",
    "Anxious",
    "Overwhelmed",
    "Curious",
    "Neutral",
]

def recursive_sanitize(obj: Any) -> Any:
    """
    Recursively strips None, null, and 'undefined' values from dictionaries and lists
    to ensure clean, zero-crash Firestore payloads.
    """
    if isinstance(obj, dict):
        cleaned = {}
        for k, v in obj.items():
            if v is None or v == "undefined":
                continue
            cleaned_val = recursive_sanitize(v)
            if cleaned_val is not None:
                cleaned[k] = cleaned_val
        return cleaned
    elif isinstance(obj, list):
        return [recursive_sanitize(item) for item in obj if item is not None and item != "undefined"]
    return obj

def sanitize_location_coordinates(loc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Validates location coordinates boundary [-90..90, -180..180] and truncates to 4 decimals (~11m privacy)."""
    if not loc or not isinstance(loc, dict):
        return None
    cleaned = dict(loc)
    lat = cleaned.get("lat")
    lng = cleaned.get("lng")
    if lat is not None:
        try:
            lat_f = float(lat)
            if not (-90 <= lat_f <= 90):
                raise ValueError(f"Latitude must be between -90 and 90, got {lat_f}")
            cleaned["lat"] = round(lat_f, 4)
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid latitude: {e}")
    if lng is not None:
        try:
            lng_f = float(lng)
            if not (-180 <= lng_f <= 180):
                raise ValueError(f"Longitude must be between -180 and 180, got {lng_f}")
            cleaned["lng"] = round(lng_f, 4)
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid longitude: {e}")
    return cleaned

class JournalEntryBase(BaseModel):
    title: str = Field(default="", max_length=500)
    content: str = Field(default="", max_length=50000)
    mood: str = Field(default="Reflective")
    tags: List[str] = Field(default_factory=list)
    is_favorite: bool = Field(default=False)
    word_count: int = Field(default=0, ge=0)
    char_count: int = Field(default=0, ge=0)
    location: Optional[Dict[str, Any]] = None
    dialogue_history: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    synthesis: Optional[Dict[str, Any]] = None

    @field_validator("location")
    @classmethod
    def validate_location(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return sanitize_location_coordinates(v)

    @field_validator("mood")
    @classmethod
    def validate_mood(cls, v: str) -> str:
        v_title = v.capitalize() if v else "Reflective"
        if v_title not in VALID_MOODS:
            return "Reflective"
        return v_title

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: List[str]) -> List[str]:
        cleaned_tags = []
        for tag in v:
            if not tag or not isinstance(tag, str):
                continue
            clean = tag.strip()
            if not clean:
                continue
            if not clean.startswith("#"):
                clean = f"#{clean}"
            if clean not in cleaned_tags:
                cleaned_tags.append(clean)
        return cleaned_tags[:20]

class JournalEntryCreate(JournalEntryBase):
    id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class JournalEntryUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=500)
    content: Optional[str] = Field(default=None, max_length=50000)
    mood: Optional[str] = None
    tags: Optional[List[str]] = None
    is_favorite: Optional[bool] = None
    word_count: Optional[int] = None
    char_count: Optional[int] = None
    location: Optional[Dict[str, Any]] = None
    dialogue_history: Optional[List[Dict[str, Any]]] = None
    synthesis: Optional[Dict[str, Any]] = None
    updated_at: Optional[str] = None

    @field_validator("location")
    @classmethod
    def validate_location(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return sanitize_location_coordinates(v)

    @field_validator("mood")
    @classmethod
    def validate_mood(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v_title = v.capitalize()
        return v_title if v_title in VALID_MOODS else "Reflective"

class JournalEntryResponse(JournalEntryBase):
    id: str
    user_id: str
    created_at: str
    updated_at: str

    def to_sanitized_firestore_dict(self) -> Dict[str, Any]:
        raw_dict = self.model_dump()
        return recursive_sanitize(raw_dict)

class FlashbackEntryItem(BaseModel):
    entry: JournalEntryResponse
    years_ago: int
    formatted_anniversary: str

class FlashbackResponse(BaseModel):
    target_date: str
    month_day: str
    flashbacks: List[FlashbackEntryItem] = Field(default_factory=list)
    prompt: Optional[str] = None

