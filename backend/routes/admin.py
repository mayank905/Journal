import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.auth import AuthenticatedUser, require_admin
from backend.services.admin_service import admin_service
from backend.agent.engine import mindmirror_agent

logger = logging.getLogger("mindmirror.routes.admin")

router = APIRouter(prefix="/api/admin", tags=["admin"])

class UpdateRoleRequest(BaseModel):
    new_role: str = Field(description="Role to assign: 'super_admin', 'admin', 'moderator', 'user'")

class UpdateConfigRequest(BaseModel):
    key: str = Field(description="Configuration key to update")
    value: Any = Field(description="New value for configuration")

class SecurityCheckRequest(BaseModel):
    action_requested: str = Field(description="Administrative action being evaluated")
    target_resource: str = Field(description="Target resource being accessed or modified")
    actor_role: Optional[str] = Field(default="admin", description="Claimed role of the actor")
    context_details: Optional[str] = Field(default="", description="Contextual details or rationale")

@router.get("/overview")
async def get_admin_overview(
    admin: AuthenticatedUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Returns platform overview, user counts, and RBAC defense-in-depth posture."""
    stats = admin_service.get_overview_stats()
    stats["current_admin"] = {
        "uid": admin.uid,
        "email": admin.email,
        "role": admin.role,
        "is_admin": admin.is_admin,
    }
    return stats

@router.get("/audit-logs")
async def get_audit_logs(
    limit: int = 50,
    action: Optional[str] = None,
    admin: AuthenticatedUser = Depends(require_admin)
) -> List[Dict[str, Any]]:
    """Retrieves immutable audit logs from /admin_audit_logs/."""
    return admin_service.list_audit_logs(limit=limit, action_filter=action)

@router.get("/configs")
async def get_system_configs(
    admin: AuthenticatedUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Retrieves current system configuration parameters."""
    return admin_service.get_system_configs()

@router.post("/configs")
async def update_system_config(
    payload: UpdateConfigRequest,
    admin: AuthenticatedUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Updates a system configuration setting and emits an immutable audit log."""
    updated = admin_service.update_system_config(
        actor_uid=admin.uid,
        actor_email=admin.email,
        config_key=payload.key,
        value=payload.value
    )
    return {"status": "success", "configs": updated}

@router.get("/users")
async def list_users(
    admin: AuthenticatedUser = Depends(require_admin)
) -> List[Dict[str, Any]]:
    """Lists registered users and their RBAC status."""
    return admin_service.list_users()

@router.post("/users/{user_id}/role")
async def update_user_role(
    user_id: str,
    payload: UpdateRoleRequest,
    admin: AuthenticatedUser = Depends(require_admin)
) -> Dict[str, Any]:
    """Updates a user's role, updates Firebase custom claims, and records audit trail."""
    try:
        updated_user = admin_service.update_user_role(
            actor_uid=admin.uid,
            actor_email=admin.email,
            target_uid=user_id,
            new_role=payload.new_role
        )
        return {"status": "success", "user": updated_user}
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err)
        )

@router.post("/security-check")
async def run_admin_security_check(
    payload: SecurityCheckRequest,
    admin: AuthenticatedUser = Depends(require_admin)
) -> Dict[str, Any]:
    """
    Evaluates an elevated administrative operation against the Admin Roles Directive.
    Returns structured security evaluation, risk levels, and mitigations.
    """
    evaluation = mindmirror_agent.evaluate_admin_security_check(
        user_id=admin.uid,
        action_requested=payload.action_requested,
        target_resource=payload.target_resource,
        actor_role=payload.actor_role or admin.role,
        context_details=payload.context_details or "",
    )

    # Automatically record audit log for any security check that yields CRITICAL risk or SUSPICIOUS_INJECTION
    if evaluation.get("verdict") == "SUSPICIOUS_INJECTION" or evaluation.get("risk_level") == "CRITICAL":
        admin_service.create_audit_log(
            actor_uid=admin.uid,
            actor_email=admin.email,
            action="SECURITY_CHECK_ALERT",
            target_resource_id=payload.target_resource,
            details={
                "action": payload.action_requested,
                "verdict": evaluation.get("verdict"),
                "risk_level": evaluation.get("risk_level"),
                "reasoning": evaluation.get("reasoning"),
            }
        )

    return evaluation
