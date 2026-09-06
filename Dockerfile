# Multi-stage production build for MindMirror (FastAPI + React 19)

# Stage 1: Build the React 19 Vite Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

ENV VITE_FIREBASE_API_KEY="AIzaSyAskYJQKnqn5rZ6WGoTzcjUffEaeNU7GrY" \
    VITE_FIREBASE_AUTH_DOMAIN="mindmirror-app-bae2d.firebaseapp.com" \
    VITE_FIREBASE_PROJECT_ID="mindmirror-app-bae2d" \
    VITE_FIREBASE_APP_ID="1:92992583743:web:e237cc1be19ec844cc608a"

COPY frontend/package*.json ./

RUN npm ci

COPY frontend/ ./
RUN npm run build


# Stage 2: Production Python 3.11 Runtime
FROM python:3.11-slim AS runtime
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8080 \
    ENVIRONMENT=production

# Install system utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Copy built frontend dist into /app/frontend/dist for FastAPI SPA static serving
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose standard Cloud Run HTTP port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

# Start FastAPI Gateway via Uvicorn with dynamic Cloud Run PORT binding and graceful SIGTERM handling
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}"]

