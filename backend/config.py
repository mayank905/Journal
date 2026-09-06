import os
from pydantic_settings import BaseSettings
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseSettings):
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    
    # Server-Side Private Secrets (NEVER sent to client)
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")
    FIREBASE_SERVICE_ACCOUNT_PATH: Optional[str] = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", None)

    # Public Client Configs (Safe to expose to authenticated client)
    FIREBASE_API_KEY: str = os.getenv("FIREBASE_API_KEY", "")
    FIREBASE_AUTH_DOMAIN: str = os.getenv("FIREBASE_AUTH_DOMAIN", "")
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "mindmirror-ideathon")
    FIREBASE_APP_ID: str = os.getenv("FIREBASE_APP_ID", "")
    GOOGLE_MAPS_CLIENT_KEY: str = os.getenv("GOOGLE_MAPS_CLIENT_KEY", "")

    def get_public_client_config(self) -> dict:
        """Returns only public configurations required by client frontend SDKs.
        No server-side secrets or private keys are ever included."""
        return {
            "firebase": {
                "apiKey": self.FIREBASE_API_KEY,
                "authDomain": self.FIREBASE_AUTH_DOMAIN,
                "projectId": self.FIREBASE_PROJECT_ID,
                "appId": self.FIREBASE_APP_ID,
            },
            "maps": {
                "hasClientKey": bool(self.GOOGLE_MAPS_CLIENT_KEY),
                "clientKey": self.GOOGLE_MAPS_CLIENT_KEY,
            },
            "environment": self.ENVIRONMENT,
        }

settings = Settings()
