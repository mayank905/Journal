#!/usr/bin/env bash
# ==============================================================================
# MindMirror - Google Cloud Run Production Deployment Script
# Built for Hack2Skill APAC Ideathon Challenge
# ==============================================================================
set -euo pipefail

# Configuration Defaults (can be overridden via environment variables)
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || echo '')}"
REGION="${REGION:-asia-southeast1}"
SERVICE_NAME="${SERVICE_NAME:-mindmirror}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
AR_REPO="${AR_REPO:-mindmirror-repo}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: GOOGLE_CLOUD_PROJECT is not set and no default gcloud project found."
  echo "Please run: gcloud config set project <YOUR_PROJECT_ID>"
  exit 1
fi

echo "=================================================================="
echo "Deploying MindMirror to Google Cloud Run"
echo "Project:      ${PROJECT_ID}"
echo "Region:       ${REGION}"
echo "Service:      ${SERVICE_NAME}"
echo "Campaign Tag: dev-tutorial=cloud-run-ai-challenge"
echo "=================================================================="

# 1. Enable Required Google Cloud APIs
echo "[1/5] Enabling required Google Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  --project="${PROJECT_ID}"

# 2. Check / Create Secret Manager Binding for GEMINI_API_KEY
echo "[2/5] Checking Secret Manager secret for GEMINI_API_KEY..."
if ! gcloud secrets describe GEMINI_API_KEY --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Secret GEMINI_API_KEY not found in Secret Manager."
  if [ -n "${GEMINI_API_KEY:-}" ]; then
    echo "Creating GEMINI_API_KEY secret from environment variable..."
    echo -n "${GEMINI_API_KEY}" | gcloud secrets create GEMINI_API_KEY \
      --data-file=- \
      --project="${PROJECT_ID}" \
      --replication-policy="automatic"
  else
    echo "WARNING: GEMINI_API_KEY is not defined. Create it before invocation via:"
    echo "  echo -n 'YOUR_API_KEY' | gcloud secrets create GEMINI_API_KEY --data-file=- --project=${PROJECT_ID}"
  fi
else
  echo "Secret GEMINI_API_KEY exists in Secret Manager."
fi

# Grant Cloud Run default compute service account access to Secret Manager
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Granting Secret Accessor role to service account: ${COMPUTE_SA}..."
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${COMPUTE_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="${PROJECT_ID}" >/dev/null 2>&1 || true

# 3. Create Artifact Registry repository if needed
echo "[3/5] Checking Artifact Registry repository..."
if ! gcloud artifacts repositories describe "${AR_REPO}" --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Creating Artifact Registry repository '${AR_REPO}'..."
  gcloud artifacts repositories create "${AR_REPO}" \
    --repository-format=docker \
    --location="${REGION}" \
    --project="${PROJECT_ID}" \
    --description="MindMirror container images"
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

# 4. Build and Push Container using Cloud Build
echo "[4/5] Submitting build to Google Cloud Build..."
gcloud builds submit --tag "${IMAGE_URI}" --project="${PROJECT_ID}" .

# 5. Deploy to Google Cloud Run with Mandatory Challenge Label & Secret Manager Binding
echo "[5/5] Deploying container image to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_URI}" \
  --platform=managed \
  --region="${REGION}" \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=10 \
  --set-env-vars="ENVIRONMENT=production,PROJECT_ID=${PROJECT_ID}" \
  --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --update-labels="dev-tutorial=cloud-run-ai-challenge" \
  --project="${PROJECT_ID}"

echo "=================================================================="
echo "MindMirror deployed successfully to Cloud Run!"
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --platform=managed --region="${REGION}" --format="value(status.url)" --project="${PROJECT_ID}")
echo "Service Live URL: ${SERVICE_URL}"
echo "=================================================================="
