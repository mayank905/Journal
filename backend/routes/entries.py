import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status

from backend.auth import get_current_user, AuthenticatedUser
from backend.schemas.entry import (
    JournalEntryCreate,
    JournalEntryUpdate,
    JournalEntryResponse,
    FlashbackResponse,
    recursive_sanitize,
)
from backend.services.entry_service import entry_service

logger = logging.getLogger("mindmirror.routes.entries")

router = APIRouter(prefix="/api/entries", tags=["entries"])

@router.get("", response_model=List[JournalEntryResponse])
async def list_user_entries(user: AuthenticatedUser = Depends(get_current_user)):
    """
    List all journal entries for the authenticated user, ordered by updatedAt desc.
    Data is isolated strictly under /users/{userId}/entries.
    """
    return entry_service.list_entries(user.uid)

@router.post("", response_model=JournalEntryResponse, status_code=status.HTTP_201_CREATED)
async def create_or_upsert_entry(
    entry_in: JournalEntryCreate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Persist or upsert a journal entry for the authenticated user.
    All inputs undergo strict Pydantic payload sanitization stripping None/undefined values.
    """
    sanitized_entry = entry_service.upsert_entry(user.uid, entry_in)
    return sanitized_entry

@router.get("/on-this-day", response_model=FlashbackResponse)
async def get_on_this_day_flashbacks(
    target_date: Optional[str] = None,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Retrieve historical reflections created on the same month and day in strictly prior years.
    Guarantees multi-tenant user isolation under /users/{userId}/entries.
    """
    return entry_service.get_flashbacks(user.uid, target_date)

@router.get("/{entry_id}", response_model=JournalEntryResponse)
async def get_single_entry(
    entry_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Retrieve an individual reflection. Verifies ownership under /users/{userId}/entries/{entryId}.
    """
    entry = entry_service.get_entry(user.uid, entry_id)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entry with ID '{entry_id}' not found for authenticated user.",
        )
    return entry

@router.put("/{entry_id}", response_model=JournalEntryResponse)
async def update_entry(
    entry_id: str,
    update_in: JournalEntryUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Update an existing reflection with partial or full attributes.
    """
    updated = entry_service.update_entry(user.uid, entry_id, update_in)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entry with ID '{entry_id}' not found for authenticated user.",
        )
    return updated

@router.delete("/{entry_id}")
async def delete_entry(
    entry_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Delete an entry belonging to the authenticated user.
    """
    deleted = entry_service.delete_entry(user.uid, entry_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entry with ID '{entry_id}' not found for authenticated user.",
        )
    return {"status": "deleted", "entryId": entry_id}
