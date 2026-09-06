import logging
from typing import Optional
from fastapi import Header, HTTPException, status, Depends
try:
    import firebase_admin
    from firebase_admin import auth, credentials
except ImportError:
    firebase_admin = None
    auth = None
    credentials = None

from backend.config import settings

logger = logging.getLogger("mindmirror.auth")

# Initialize Firebase Admin SDK safely
_firebase_initialized = False

def init_firebase():
    global _firebase_initialized
    if _firebase_initialized or not firebase_admin:
        return

    try:
        if settings.FIREBASE_SERVICE_ACCOUNT_PATH:
            cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin initialized with service account certificate.")
        else:
            # Initialize with Application Default Credentials or default options
            firebase_admin.initialize_app(options={"projectId": settings.FIREBASE_PROJECT_ID})
            logger.info(f"Firebase Admin initialized with projectId: {settings.FIREBASE_PROJECT_ID}")
        _firebase_initialized = True
    except ValueError:
        # Already initialized
        _firebase_initialized = True
    except Exception as e:
        logger.warning(f"Firebase Admin initialization warning: {e}. Resilient dev mode active.")

class AuthenticatedUser:
    def __init__(
        self, 
        uid: str, 
        email: Optional[str] = None, 
        name: Optional[str] = None, 
        picture: Optional[str] = None,
        role: str = "user",
        is_admin: bool = False,
        claims: Optional[dict] = None
    ):
        self.uid = uid
        self.email = email or ""
        self.name = name or (email.split("@")[0] if email else "Journaler")
        self.picture = picture or ""
        self.role = role
        self.is_admin = is_admin
        self.claims = claims or {}

    def to_dict(self):
        return {
            "uid": self.uid,
            "email": self.email,
            "name": self.name,
            "picture": self.picture,
            "role": self.role,
            "is_admin": self.is_admin,
            "claims": self.claims,
        }

async def get_current_user(authorization: Optional[str] = Header(None)) -> AuthenticatedUser:
    """
    Validates Firebase ID token in the Authorization header.
    Format: Bearer <firebase_id_token>
    Enforces that every authenticated request has a valid UID.
    Extracts custom claims (admin, role) for multi-layered RBAC.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header. Bearer token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = authorization.split(" ")[1].strip()
    if not token or token in ["null", "undefined"]:
        if settings.ENVIRONMENT == "development":
            return AuthenticatedUser(
                uid="dev-explorer",
                email="dev-explorer@mindmirror.internal",
                name="Architect Explorer (Dev)",
                picture="https://api.dicebear.com/7.x/bottts/svg?seed=dev-explorer",
                role="user",
                is_admin=False,
                claims={"admin": False, "role": "user"}
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Empty bearer token provided.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Resilient Development Mode: Allow verified development mock tokens
    if settings.ENVIRONMENT == "development" and token.startswith("dev-mock-token-"):
        uid = token.replace("dev-mock-token-", "").strip() or "dev-test-user-01"
        is_admin = bool("admin" in uid.lower() or token.endswith("-admin") or uid in ["admin-root", "dev-explorer"])
        role = "super_admin" if "root" in uid else ("admin" if is_admin else "user")
        return AuthenticatedUser(
            uid=uid,
            email=f"{uid}@example.com",
            name=f"Dev User ({uid})",
            picture="https://api.dicebear.com/7.x/bottts/svg?seed=" + uid,
            role=role,
            is_admin=is_admin,
            claims={"admin": is_admin, "role": role},
        )

    init_firebase()

    try:
        decoded_token = auth.verify_id_token(token)
        uid = decoded_token.get("uid")
        if not uid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing uid claim.",
            )
        is_admin = bool(decoded_token.get("admin") is True or decoded_token.get("role") in ["admin", "super_admin"])
        role = decoded_token.get("role") or ("admin" if is_admin else "user")
        return AuthenticatedUser(
            uid=uid,
            email=decoded_token.get("email"),
            name=decoded_token.get("name"),
            picture=decoded_token.get("picture"),
            role=role,
            is_admin=is_admin,
            claims=decoded_token,
        )
    except Exception as e:
        logger.warning(f"Failed to verify Firebase ID token: {e}")
        # In development mode, decode the JWT unverified if Firebase Admin credentials are not locally configured
        if settings.ENVIRONMENT == "development":
            try:
                import jwt
                unverified = jwt.decode(token, options={"verify_signature": False})
                uid = unverified.get("user_id") or unverified.get("sub") or unverified.get("uid")
                if uid:
                    is_admin = bool(unverified.get("admin") is True or unverified.get("role") in ["admin", "super_admin"] or "admin" in uid)
                    role = unverified.get("role") or ("admin" if is_admin else "user")
                    return AuthenticatedUser(
                        uid=uid,
                        email=unverified.get("email"),
                        name=unverified.get("name"),
                        picture=unverified.get("picture"),
                        role=role,
                        is_admin=is_admin,
                        claims=unverified,
                    )
            except Exception:
                pass
            return AuthenticatedUser(
                uid="dev-explorer",
                email="dev-explorer@mindmirror.internal",
                name="Architect Explorer (Dev)",
                picture="https://api.dicebear.com/7.x/bottts/svg?seed=dev-explorer",
                role="user",
                is_admin=False,
                claims={"admin": False, "role": "user"}
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired authentication token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def require_admin(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
    """
    Dependency guard enforcing Role-Based Access Control (RBAC).
    Rejects non-administrative users with 403 Forbidden.
    """
    if not user.is_admin:
        logger.warning(f"Access denied for user {user.uid}: elevated admin permissions required.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Elevated administrative privileges required.",
        )
    return user

