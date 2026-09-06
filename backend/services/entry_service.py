import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from backend.schemas.entry import (
    JournalEntryCreate,
    JournalEntryUpdate,
    JournalEntryResponse,
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

class EntryService:
    def __init__(self):
        self._firestore_db = None
        self._init_firestore()

    def _init_firestore(self):
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
            if "word_count" not in update_dict:
                update_dict["word_count"] = calc_words
            if "char_count" not in update_dict:
                update_dict["char_count"] = calc_chars

        update_dict["updated_at"] = update_in.updated_at or _get_current_iso_time()

        # Merge with existing
        existing_data = existing.model_dump()
        for k, v in update_dict.items():
            if v is not None:
                existing_data[k] = v

        sanitized_doc = recursive_sanitize(existing_data)

        # Update in Firestore if available
        if self._firestore_db:
            try:
                doc_ref = self._firestore_db.collection("users").document(user_id).collection("entries").document(entry_id)
                doc_ref.set(sanitized_doc, merge=True)
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
                    return JournalEntryResponse(**recursive_sanitize(data))
            except Exception as e:
                logger.warning(f"Firestore read error ({e}); querying fallback store.")

        # Resilient fallback memory store
        user_entries = _dev_memory_store.get(user_id, {})
        entry_data = user_entries.get(entry_id)
        if entry_data:
            return JournalEntryResponse(**recursive_sanitize(entry_data))
        return None

    def list_entries(self, user_id: str) -> List[JournalEntryResponse]:
        results: List[JournalEntryResponse] = []

        if self._firestore_db:
            try:
                entries_ref = self._firestore_db.collection("users").document(user_id).collection("entries")
                docs = entries_ref.order_by("updated_at", direction="DESCENDING").stream()
                for doc in docs:
                    results.append(JournalEntryResponse(**recursive_sanitize(doc.to_dict())))
                return results
            except Exception as e:
                logger.warning(f"Firestore list failed ({e}); falling back to in-memory store.")

        user_entries = _dev_memory_store.get(user_id, {})
        for entry_data in user_entries.values():
            results.append(JournalEntryResponse(**recursive_sanitize(entry_data)))
        
        # Sort descending by updated_at
        results.sort(key=lambda x: x.updated_at, reverse=True)
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

entry_service = EntryService()
