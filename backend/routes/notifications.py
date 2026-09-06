import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status

from backend.auth import get_current_user, AuthenticatedUser
from backend.schemas.notification import (
    NotificationConfigCreate,
    NotificationConfigUpdate,
    NotificationConfigResponse,
    NotificationDispatchResult,
    TestNotificationRequest,
    ParseAndNotifyRequest,
    NOTIFICATION_API_DIRECTIVE,
)
from backend.services.notification_service import notification_service

logger = logging.getLogger("mindmirror.routes.notifications")

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

@router.get("/directive")
async def get_notification_directive(user: AuthenticatedUser = Depends(get_current_user)):
    """
    Returns the official Notification API Directive & External Integration Specification.
    Defines credential lifecycle, zero-leakage masking, SSRF rules, and payload schemas.
    """
    return {
        "directive": NOTIFICATION_API_DIRECTIVE,
        "supported_channels": ["slack", "discord", "email"],
        "supported_triggers": ["mood_match", "tag_match", "distortion_detected", "milestone_word_count", "always"],
        "security_controls": {
            "ssrf_protection": "Enforces HTTPS; denies loopback (127.0.0.0/8), RFC1918 private IPs, and cloud metadata (169.254.169.254).",
            "credential_masking": "All read responses mask secret webhook URLs and bearer tokens.",
            "partitioning": "Strict owner-bound isolation under /users/{userId}/notification_configs/."
        }
    }

@router.get("/configs", response_model=List[NotificationConfigResponse])
async def list_user_notification_configs(user: AuthenticatedUser = Depends(get_current_user)):
    """Lists all external notification configurations for the authenticated user."""
    return notification_service.list_configs(user.uid)

@router.post("/configs", response_model=NotificationConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_user_notification_config(
    config_in: NotificationConfigCreate,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Creates a new external notification channel configuration.
    Validates destination against SSRF and isolates under user namespace.
    """
    try:
        return notification_service.create_config(user.uid, config_in)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        logger.error(f"Failed to create notification config: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save notification configuration.")

@router.put("/configs/{config_id}", response_model=NotificationConfigResponse)
async def update_user_notification_config(
    config_id: str,
    config_in: NotificationConfigUpdate,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Updates an existing external notification configuration."""
    try:
        updated = notification_service.update_config(user.uid, config_id, config_in)
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification configuration not found.")
        return updated
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))

@router.delete("/configs/{config_id}")
async def delete_user_notification_config(
    config_id: str,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Deletes an external notification configuration."""
    deleted = notification_service.delete_config(user.uid, config_id)
    return {"success": True, "deleted_id": config_id}

@router.post("/test", response_model=NotificationDispatchResult)
async def test_notification_channel(
    test_req: TestNotificationRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """Sends a sample notification to verify webhook/email delivery without persisting."""
    try:
        return notification_service.test_dispatch(user.uid, test_req)
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as exc:
        logger.error(f"Test notification dispatch error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Test failed: {str(exc)}")

@router.post("/parse-and-notify", response_model=List[NotificationDispatchResult])
async def parse_and_notify_entry(
    req: ParseAndNotifyRequest,
    user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Evaluates a parsed journal entry against the user's active notification rules
    and triggers external dispatches (Slack, Discord, Email) when matching criteria are met.
    """
    entry_dict = {
        "id": req.entry_id,
        "title": req.title,
        "content": req.content,
        "mood": req.mood,
        "tags": req.tags,
        "word_count": req.word_count,
        "has_cognitive_distortion": req.has_cognitive_distortion,
        "distortion_summary": req.distortion_summary,
    }
    return notification_service.evaluate_and_dispatch(user.uid, entry_dict)

@router.get("/logs")
async def get_notification_logs(user: AuthenticatedUser = Depends(get_current_user)):
    """Retrieves recent external notification delivery audit logs."""
    logs = notification_service.list_logs(user.uid)
    return {"logs": logs, "total": len(logs)}
