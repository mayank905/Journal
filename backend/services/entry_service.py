import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from backend.schemas.entry import (
    JournalEntryCreate,
    JournalEntryUpdate,
    JournalEntryResponse,
    FlashbackEntryItem,
    FlashbackResponse,
    recursive_sanitize,
)
from backend.config import settings

logger = logging.getLogger("mindmirror.entry_service")

# In-memory transient storage for tests/fallback when Firestore is unavailable
_dev_memory_store: Dict[str, Dict[str, Dict[str, Any]]] = {}

def _get_current_iso_time() -> str:
    return datetime.now(timezone.utc).isoformat()

def _calculate_word_and_char_count(content: str) -> tuple[int, int]:
    content = content or ""
    words = len(content.strip().split()) if content.strip() else 0
    chars = len(content)
    return words, chars

def normalize_firestore_entry_dict(raw: Dict[str, Any], doc_id: Optional[str] = None) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    d = dict(raw)
    if "id" not in d and doc_id:
        d["id"] = doc_id
    if "userId" in d and "user_id" not in d:
        d["user_id"] = d.get("userId")
    if "user_id" not in d and doc_id:
        d["user_id"] = "user"
    if "createdAt" in d and "created_at" not in d:
        d["created_at"] = d.get("createdAt")
    if "created_at" not in d:
        d["created_at"] = _get_current_iso_time()
    if "updatedAt" in d and "updated_at" not in d:
        d["updated_at"] = d.get("updatedAt")
    if "updated_at" not in d:
        d["updated_at"] = d.get("created_at") or _get_current_iso_time()
    if "isFavorite" in d and "is_favorite" not in d:
        d["is_favorite"] = bool(d.get("isFavorite", False))
    if "wordCount" in d and "word_count" not in d:
        d["word_count"] = int(d.get("wordCount", 0))
    if "charCount" in d and "char_count" not in d:
        d["char_count"] = int(d.get("charCount", 0))
    if "dialogueHistory" in d and "dialogue_history" not in d:
        d["dialogue_history"] = d.get("dialogueHistory", [])
    return recursive_sanitize(d)

class EntryService:
    def __init__(self):
        self._firestore_db = None
        self._init_firestore()

    def _init_firestore(self):
        from backend.config import settings
        if settings.ENVIRONMENT == "development" and not settings.FIREBASE_SERVICE_ACCOUNT_PATH:
            logger.info("Dev environment active without explicit service account key. Using resilient in-memory store for EntryService.")
            self._firestore_db = None
            return
        try:
            from firebase_admin import firestore
            self._firestore_db = firestore.client()
            logger.info("Firestore client initialized for EntryService.")
        except Exception as e:
            logger.info(f"Firestore not available in current environment ({e}). Using resilient fallback store.")
            self._firestore_db = None

    def upsert_entry(self, user_id: str, entry_in: JournalEntryCreate) -> JournalEntryResponse:
        entry_id = entry_in.id or f"entry_{uuid.uuid4().hex[:12]}"
        now = _get_current_iso_time()
        created_at = entry_in.created_at or now
        updated_at = entry_in.updated_at or now

        # Calculate word and char count dynamically if not provided or to ensure accuracy
        calc_words, calc_chars = _calculate_word_and_char_count(entry_in.content)
        word_count = entry_in.word_count if entry_in.word_count > 0 else calc_words
        char_count = entry_in.char_count if entry_in.char_count > 0 else calc_chars

        response_obj = JournalEntryResponse(
            id=entry_id,
            user_id=user_id,
            title=entry_in.title or "Untitled Reflection",
            content=entry_in.content or "",
            mood=entry_in.mood,
            tags=entry_in.tags,
            is_favorite=entry_in.is_favorite,
            word_count=word_count,
            char_count=char_count,
            location=entry_in.location,
            dialogue_history=entry_in.dialogue_history or [],
            synthesis=entry_in.synthesis,
            created_at=created_at,
            updated_at=updated_at,
        )


        # Strictly sanitize payload to eliminate None or undefined values before persistence
        sanitized_doc = response_obj.to_sanitized_firestore_dict()

        # Try persisting to Cloud Firestore under /users/{userId}/entries/{entryId}
        persisted_to_firestore = False
        if self._firestore_db:
            try:
                doc_ref = self._firestore_db.collection("users").document(user_id).collection("entries").document(entry_id)
                doc_ref.set(sanitized_doc)
                persisted_to_firestore = True
                logger.info(f"Persisted entry {entry_id} to Firestore for user {user_id}")
            except Exception as e:
                logger.warning(f"Firestore write failed ({e}); backing up to resilient fallback memory store.")

        # Always sync with in-memory store for instant fallback & fast dev tests
        if user_id not in _dev_memory_store:
            _dev_memory_store[user_id] = {}
        _dev_memory_store[user_id][entry_id] = sanitized_doc

        # Safely evaluate external notifications (Slack, Discord, Email) without blocking persistence
        try:
            from backend.services.notification_service import notification_service
            notification_service.evaluate_and_dispatch(user_id, sanitized_doc)
        except Exception as notif_err:
            logger.debug(f"External notification evaluation note: {notif_err}")

        return response_obj

    def update_entry(self, user_id: str, entry_id: str, update_in: JournalEntryUpdate) -> Optional[JournalEntryResponse]:
        existing = self.get_entry(user_id, entry_id)
        if not existing:
            return None

        update_dict = update_in.model_dump(exclude_unset=True)
        # Recalculate word/char count if content is updated
        if "content" in update_dict:
            new_content = update_dict["content"] or ""
            calc_words, calc_chars = _calculate_word_and_char_count(new_content)
            update_dict["word_count"] = calc_words
            update_dict["char_count"] = calc_chars

        update_dict["updated_at"] = _get_current_iso_time()

        merged_data = existing.model_dump()
        merged_data.update(update_dict)
        sanitized_doc = recursive_sanitize(merged_data)

        if self._firestore_db:
            try:
                doc_ref = self._firestore_db.collection("users").document(user_id).collection("entries").document(entry_id)
                doc_ref.update(sanitized_doc)
            except Exception as e:
                logger.warning(f"Firestore update failed ({e}); updating fallback store.")

        if user_id not in _dev_memory_store:
            _dev_memory_store[user_id] = {}
        _dev_memory_store[user_id][entry_id] = sanitized_doc

        return JournalEntryResponse(**sanitized_doc)

    def get_entry(self, user_id: str, entry_id: str) -> Optional[JournalEntryResponse]:
        # Check Firestore first
        if self._firestore_db:
            try:
                doc_ref = self._firestore_db.collection("users").document(user_id).collection("entries").document(entry_id)
                snapshot = doc_ref.get()
                if snapshot.exists:
                    data = snapshot.to_dict()
                    return JournalEntryResponse(**normalize_firestore_entry_dict(data, entry_id))
            except Exception as e:
                logger.warning(f"Firestore read error ({e}); querying fallback store.")

        # Resilient fallback memory store
        user_entries = _dev_memory_store.get(user_id, {})
        entry_data = user_entries.get(entry_id)
        if entry_data:
            return JournalEntryResponse(**normalize_firestore_entry_dict(entry_data, entry_id))
        return None

    def list_entries(self, user_id: str) -> List[JournalEntryResponse]:
        results: List[JournalEntryResponse] = []

        if self._firestore_db:
            try:
                entries_ref = self._firestore_db.collection("users").document(user_id).collection("entries")
                docs = list(entries_ref.stream())
                for doc in docs:
                    raw_dict = doc.to_dict()
                    if not raw_dict:
                        continue
                    normalized = normalize_firestore_entry_dict(raw_dict, doc.id)
                    try:
                        results.append(JournalEntryResponse(**normalized))
                    except Exception as parse_err:
                        logger.warning(f"Error parsing entry {doc.id}: {parse_err}")
                
                results.sort(
                    key=lambda x: str(getattr(x, "updated_at", "") or getattr(x, "created_at", "") or ""),
                    reverse=True
                )
                return results
            except Exception as e:
                logger.warning(f"Firestore list failed ({e}); falling back to in-memory store.")

        user_entries = _dev_memory_store.get(user_id, {})
        for eid, entry_data in user_entries.items():
            results.append(JournalEntryResponse(**normalize_firestore_entry_dict(entry_data, eid)))
        
        # Sort descending by updated_at or created_at
        results.sort(
            key=lambda x: str(getattr(x, "updated_at", "") or getattr(x, "created_at", "") or ""),
            reverse=True
        )
        return results

    def delete_entry(self, user_id: str, entry_id: str) -> bool:
        deleted = False
        if self._firestore_db:
            try:
                doc_ref = self._firestore_db.collection("users").document(user_id).collection("entries").document(entry_id)
                doc_ref.delete()
                deleted = True
            except Exception as e:
                logger.warning(f"Firestore delete failed: {e}")

        user_entries = _dev_memory_store.get(user_id, {})
        if entry_id in user_entries:
            del user_entries[entry_id]
            deleted = True

        return deleted

    def get_flashbacks(self, user_id: str, target_date_str: Optional[str] = None) -> FlashbackResponse:
        """
        Longitudinal Flashback Engine ('On This Day' Temporal Recall).
        Matches reflections written on the same calendar month and day in strictly prior years.
        Handles leap-year Feb 29 conversions and returns entries sorted by years_ago ascending.
        """
        now_utc = datetime.now(timezone.utc)
        target_year = now_utc.year
        target_month = now_utc.month
        target_day = now_utc.day

        if target_date_str:
            clean_date = target_date_str.strip()
            # If formatted YYYY-MM-DD
            if len(clean_date) == 10 and clean_date[4] == '-' and clean_date[7] == '-':
                try:
                    parsed = datetime.strptime(clean_date, "%Y-%m-%d")
                    target_year = parsed.year
                    target_month = parsed.month
                    target_day = parsed.day
                except ValueError:
                    pass
            # If formatted MM-DD
            elif len(clean_date) == 5 and clean_date[2] == '-':
                try:
                    parsed = datetime.strptime(clean_date, "%m-%d")
                    target_month = parsed.month
                    target_day = parsed.day
                except ValueError:
                    pass

        is_leap_day = (target_month == 2 and target_day == 29)
        month_day_key = f"{target_month:02d}-{target_day:02d}"
        iso_target = f"{target_year:04d}-{target_month:02d}-{target_day:02d}"

        entries = self.list_entries(user_id)
        flashback_items: List[FlashbackEntryItem] = []

        for entry in entries:
            created_at_str = entry.created_at
            if not created_at_str:
                continue
            try:
                entry_date_part = created_at_str[:10]
                entry_dt = datetime.strptime(entry_date_part, "%Y-%m-%d")
            except Exception:
                continue

            entry_year = entry_dt.year
            # Directive: Must be strictly prior calendar year (year < target_year)
            if entry_year >= target_year:
                continue

            # Check if month and day match
            matches = False
            if entry_dt.month == target_month and entry_dt.day == target_day:
                matches = True
            elif is_leap_day and not ((entry_year % 4 == 0 and entry_year % 100 != 0) or (entry_year % 400 == 0)):
                # If target is Feb 29, but entry is in a non-leap year, match Feb 28
                if entry_dt.month == 2 and entry_dt.day == 28:
                    matches = True
            elif target_month == 2 and target_day == 28 and not ((target_year % 4 == 0 and target_year % 100 != 0) or (target_year % 400 == 0)):
                # If target is Feb 28 on a non-leap year, also include past Feb 29 leap year reflections
                if entry_dt.month == 2 and entry_dt.day == 29:
                    matches = True

            if matches:
                years_ago = target_year - entry_year
                anniversary_text = f"{years_ago} year{'s' if years_ago > 1 else ''} ago today"
                flashback_items.append(
                    FlashbackEntryItem(
                        entry=entry,
                        years_ago=years_ago,
                        formatted_anniversary=anniversary_text,
                    )
                )

        flashback_items.sort(key=lambda x: x.years_ago)

        prompt = None
        if flashback_items:
            first_item = flashback_items[0]
            prompt = (
                f"On this day {first_item.formatted_anniversary}, you felt '{first_item.entry.mood}' "
                f"and wrote '{first_item.entry.title or 'Untitled Reflection'}'. "
                "How has your perspective or personal growth evolved since then?"
            )

        return FlashbackResponse(
            target_date=iso_target,
            month_day=month_day_key,
            flashbacks=flashback_items,
            prompt=prompt,
        )

entry_service = EntryService()

