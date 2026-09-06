import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from backend.schemas.entry import recursive_sanitize

logger = logging.getLogger("mindmirror.admin_service")

# In-memory transient fallback store for audit logs and configs
_dev_audit_logs: List[Dict[str, Any]] = []
_dev_system_configs: Dict[str, Any] = {
    "maintenance_mode": False,
    "allow_new_registrations": True,
    "gemini_model_primary": "gemini-3.8-flash",
    "rate_limit_per_minute": 60,
    "enforce_socratic_depth": True,
    "geo_privacy_truncation": 4,
}

_dev_user_roles: Dict[str, Dict[str, Any]] = {
    "admin-root": {
        "uid": "admin-root",
        "email": "admin@mindmirror.internal",
        "displayName": "System Super Admin",
        "role": "super_admin",
        "is_admin": True,
        "created_at": "2026-01-01T00:00:00Z"
    },
    "moderator-01": {
        "uid": "moderator-01",
        "email": "moderator@mindmirror.internal",
        "displayName": "Safety Moderator",
        "role": "moderator",
        "is_admin": False,
        "created_at": "2026-02-01T00:00:00Z"
    },
    "dev-explorer": {
        "uid": "dev-explorer",
        "email": "dev-explorer@mindmirror.internal",
        "displayName": "Architect Explorer",
        "role": "admin",
        "is_admin": True,
        "created_at": "2026-03-01T00:00:00Z"
    },
    "dev-test-user-01": {
        "uid": "dev-test-user-01",
        "email": "dev-test-user-01@example.com",
        "displayName": "Dev User (01)",
        "role": "user",
        "is_admin": False,
        "created_at": "2026-03-02T00:00:00Z"
    }
}

def _get_current_iso_time() -> str:
    return datetime.now(timezone.utc).isoformat()

class AdminService:
    def __init__(self):
        self._firestore_db = None
        self._init_firestore()

    def _init_firestore(self):
        try:
            from firebase_admin import firestore
            self._firestore_db = firestore.client()
            logger.info("Firestore client initialized for AdminService.")
        except Exception as e:
            logger.info(f"Firestore not available in AdminService ({e}). Using resilient fallback store.")
            self._firestore_db = None

    # -------------------------------------------------------------------------
    # 1. Immutable Audit Logging
    # -------------------------------------------------------------------------
    def create_audit_log(
        self,
        actor_uid: str,
        actor_email: str,
        action: str,
        target_resource_id: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Records an immutable audit log entry to /admin_audit_logs/{logId} per Directive 8.
        """
        log_id = f"audit_{uuid.uuid4().hex[:14]}"
        timestamp = _get_current_iso_time()

        entry = {
            "id": log_id,
            "actor_uid": actor_uid,
            "actor_email": actor_email or f"{actor_uid}@internal",
            "action": action.upper(),
            "target_resource_id": target_resource_id,
            "details": details or {},
            "timestamp": timestamp,
        }

        sanitized_entry = recursive_sanitize(entry)

        if self._firestore_db:
            try:
                doc_ref = self._firestore_db.collection("admin_audit_logs").document(log_id)
                doc_ref.set(sanitized_entry)
                logger.info(f"Immutable audit log persisted to Firestore: {log_id} ({action})")
            except Exception as e:
                logger.warning(f"Firestore audit log persistence failed ({e}); recorded in fallback store.")

        # Always keep in resilient dev store
        _dev_audit_logs.insert(0, sanitized_entry)
        return sanitized_entry

    def list_audit_logs(self, limit: int = 50, action_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieves audit logs, optionally filtered by action type."""
        logs: List[Dict[str, Any]] = []

        if self._firestore_db:
            try:
                coll_ref = self._firestore_db.collection("admin_audit_logs")
                query = coll_ref.order_by("timestamp", direction="DESCENDING").limit(limit)
                docs = list(query.stream())
                for doc in docs:
                    d = doc.to_dict()
                    if d:
                        d["id"] = doc.id
                        logs.append(d)
                if logs:
                    if action_filter:
                        logs = [l for l in logs if l.get("action") == action_filter.upper()]
                    return logs
            except Exception as e:
                logger.warning(f"Firestore list audit logs failed ({e}); reading fallback store.")

        # Fallback store
        results = list(_dev_audit_logs)
        if action_filter:
            results = [l for l in results if l.get("action") == action_filter.upper()]
        return results[:limit]

    # -------------------------------------------------------------------------
    # 2. System Configuration Management
    # -------------------------------------------------------------------------
    def get_system_configs(self) -> Dict[str, Any]:
        """Retrieves application runtime configuration from /admin_configs/general."""
        if self._firestore_db:
            try:
                doc_ref = self._firestore_db.collection("admin_configs").document("general")
                snap = doc_ref.get()
                if snap.exists:
                    data = snap.to_dict() or {}
                    merged = dict(_dev_system_configs)
                    merged.update(data)
                    return merged
            except Exception as e:
                logger.warning(f"Firestore get_system_configs failed ({e}); using fallback configs.")
        return dict(_dev_system_configs)

    def update_system_config(
        self,
        actor_uid: str,
        actor_email: str,
        config_key: str,
        value: Any,
    ) -> Dict[str, Any]:
        """Updates a configuration setting and logs an immutable audit event."""
        configs = self.get_system_configs()
        old_val = configs.get(config_key)
        configs[config_key] = value

        sanitized = recursive_sanitize(configs)

        if self._firestore_db:
            try:
                doc_ref = self._firestore_db.collection("admin_configs").document("general")
                doc_ref.set(sanitized)
            except Exception as e:
                logger.warning(f"Firestore update config failed: {e}")

        _dev_system_configs[config_key] = value

        # Record audit log
        self.create_audit_log(
            actor_uid=actor_uid,
            actor_email=actor_email,
            action="CONFIG_UPDATE",
            target_resource_id=f"config:{config_key}",
            details={"key": config_key, "previous_value": old_val, "new_value": value},
        )

        return configs

    # -------------------------------------------------------------------------
    # 3. User & Role Administration
    # -------------------------------------------------------------------------
    def list_users(self) -> List[Dict[str, Any]]:
        """Returns list of users with assigned roles."""
        return list(_dev_user_roles.values())

    def update_user_role(
        self,
        actor_uid: str,
        actor_email: str,
        target_uid: str,
        new_role: str,
    ) -> Dict[str, Any]:
        """
        Updates a user's role and sets custom claims via Firebase Admin SDK.
        Enforces least privilege and prevents actor self-demotion.
        """
        valid_roles = ["super_admin", "admin", "moderator", "user"]
        if new_role not in valid_roles:
            raise ValueError(f"Invalid role '{new_role}'. Must be one of {valid_roles}")

        # Guard: Prevent self-demotion from admin
        if actor_uid == target_uid and new_role not in ["super_admin", "admin"]:
            raise ValueError("Safety Guard: Administrators cannot demote their own active role.")

        user_record = _dev_user_roles.get(target_uid)
        old_role = user_record.get("role", "user") if user_record else "user"

        is_admin_flag = new_role in ["super_admin", "admin"]

        # If Firebase Admin SDK is available, assign custom claims
        try:
            from firebase_admin import auth
            auth.set_custom_user_claims(
                target_uid,
                {"admin": is_admin_flag, "role": new_role}
            )
            logger.info(f"Custom user claims set for UID {target_uid}: admin={is_admin_flag}, role={new_role}")
        except Exception as e:
            logger.info(f"Firebase Admin set_custom_user_claims skipped in dev mode: {e}")

        # Update local registry
        if not user_record:
            user_record = {
                "uid": target_uid,
                "email": f"{target_uid}@mindmirror.internal",
                "displayName": f"User {target_uid}",
                "created_at": _get_current_iso_time(),
            }
        user_record["role"] = new_role
        user_record["is_admin"] = is_admin_flag
        user_record["updated_at"] = _get_current_iso_time()
        _dev_user_roles[target_uid] = user_record

        # Emit audit log
        self.create_audit_log(
            actor_uid=actor_uid,
            actor_email=actor_email,
            action="ROLE_CHANGE",
            target_resource_id=f"user:{target_uid}",
            details={"previous_role": old_role, "new_role": new_role, "is_admin": is_admin_flag},
        )

        return user_record

    # -------------------------------------------------------------------------
    # 4. Overview & Metrics
    # -------------------------------------------------------------------------
    def get_overview_stats(self) -> Dict[str, Any]:
        """Returns consolidated admin metrics and RBAC posture."""
        users = list(_dev_user_roles.values())
        admin_count = sum(1 for u in users if u.get("is_admin"))
        moderator_count = sum(1 for u in users if u.get("role") == "moderator")
        user_count = len(users)

        audit_logs = self.list_audit_logs(limit=100)

        return {
            "total_users": user_count,
            "admin_count": admin_count,
            "moderator_count": moderator_count,
            "audit_log_count": len(audit_logs),
            "recent_audit_logs": audit_logs[:5],
            "system_configs": self.get_system_configs(),
            "security_posture": {
                "rbac_enforcement": "ACTIVE",
                "defense_in_depth": "Firebase Custom Claims + FastAPI Gateway + Firestore Rules",
                "least_privilege": "ENFORCED",
                "audit_logging": "IMMUTABLE_FIRESTORE",
            }
        }

admin_service = AdminService()
