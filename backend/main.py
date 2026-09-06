import os
import logging
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from backend.config import settings
from backend.auth import get_current_user, AuthenticatedUser

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("mindmirror.main")

app = FastAPI(
    title="MindMirror Agentic Cognition Gateway",
    version="1.0.0",
    description="Secure FastAPI Gateway for MindMirror Autonomous Journaling Agent",
)

# 1. Top-Level CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production or allow dev origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Defensive Request Deserialization Guard
@app.middleware("http")
async def defensive_request_middleware(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as exc:
        logger.error(f"Unhandled request exception at {request.url.path}: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": "Internal Server Error", "detail": "An unexpected error occurred."},
        )

# 3. Health Endpoint
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "app": "MindMirror Cognitive Agent",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "has_gemini_key": bool(settings.GEMINI_API_KEY),
        "has_maps_key": bool(settings.GOOGLE_MAPS_API_KEY),
    }

# 4. Public Safe Client Config Endpoint (Zero Secret Exposure)
@app.get("/api/config/client")
async def get_client_config():
    """Returns safe public configurations for frontend Firebase and Maps initialization.
    Strictly excludes server-side keys."""
    return settings.get_public_client_config()

from backend.routes.entries import router as entries_router
from backend.routes.agent import router as agent_router
from backend.routes.maps import router as maps_router
from backend.routes.admin import router as admin_router
from backend.routes.notifications import router as notifications_router

# 5. Authenticated User Profile Endpoint
@app.get("/api/auth/me")
async def get_user_profile(user: AuthenticatedUser = Depends(get_current_user)):
    return {
        "authenticated": True,
        "user": user.to_dict(),
    }

# 6. Journal Entries Router (Pydantic Sanitization & Path Isolation)
app.include_router(entries_router)

# 7. Cognitive Agent Router (ReAct Loop, Tool Registry & SSE Streaming)
app.include_router(agent_router)

# 8. Geo-Spatial Maps Router (Zero Secret Exposure & Coordinate Boundaries)
app.include_router(maps_router)

# 9. Admin Dashboard & RBAC Router (Role Verification & Immutable Audit Logs)
app.include_router(admin_router)

# 10. External Notifications Router (Slack, Discord, Email & Directive)
app.include_router(notifications_router)




# 6. Production Static Mount (if built)
dist_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.exists(dist_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(dist_dir, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            return JSONResponse(status_code=404, content={"error": "API route not found"})
        requested_file = os.path.join(dist_dir, full_path)
        if full_path and os.path.isfile(requested_file):
            return FileResponse(requested_file)
        index_file = os.path.join(dist_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return JSONResponse(status_code=404, content={"error": "Frontend build not found"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=(settings.ENVIRONMENT == "development"))
