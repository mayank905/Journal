# ==============================================================================
# MindMirror - Google Cloud Run Production Deployment Script (PowerShell)
# Built for Hack2Skill APAC Ideathon Challenge
# ==============================================================================

param (
    [Parameter(Mandatory=$false)]
    [string]$ProjectId = "",

    [Parameter(Mandatory=$false)]
    [string]$Region = "asia-southeast1",

    [Parameter(Mandatory=$false)]
    [string]$ServiceName = "mindmirror",

    [Parameter(Mandatory=$false)]
    [string]$GeminiApiKey = ""
)

$ErrorActionPreference = "Stop"

# Resolve gcloud command (supports both gcloud.cmd and gcloud)
$gcloudCmd = if (Get-Command gcloud.cmd -ErrorAction SilentlyContinue) { "gcloud.cmd" } else { "gcloud" }

# Determine GCP Project ID
if ([string]::IsNullOrWhiteSpace($ProjectId)) {
    $ProjectId = & $gcloudCmd config get-value project 2>$null
    if ([string]::IsNullOrWhiteSpace($ProjectId)) {
        Write-Error "GCP Project ID is not set. Run: & $gcloudCmd config set project <YOUR_PROJECT_ID> or pass -ProjectId <YOUR_PROJECT_ID>"
        exit 1
    }
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "Deploying MindMirror to Google Cloud Run" -ForegroundColor Cyan
Write-Host "Project:      $ProjectId"
Write-Host "Region:       $Region"
Write-Host "Service:      $ServiceName"
Write-Host "Campaign Tag: dev-tutorial=cloud-run-ai-challenge"
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Enable Required Google Cloud APIs
Write-Host "`n[1/5] Enabling required Google Cloud APIs..." -ForegroundColor Yellow
& $gcloudCmd services enable `
    run.googleapis.com `
    artifactregistry.googleapis.com `
    secretmanager.googleapis.com `
    cloudbuild.googleapis.com `
    firestore.googleapis.com `
    --project=$ProjectId

# 2. Check / Create Secret Manager Binding for GEMINI_API_KEY
Write-Host "`n[2/5] Checking Secret Manager for GEMINI_API_KEY..." -ForegroundColor Yellow
$secretExists = & $gcloudCmd secrets describe GEMINI_API_KEY --project=$ProjectId 2>$null
if (-not $secretExists) {
    if (-not [string]::IsNullOrWhiteSpace($GeminiApiKey)) {
        Write-Host "Creating GEMINI_API_KEY secret in Secret Manager..."
        $GeminiApiKey | & $gcloudCmd secrets create GEMINI_API_KEY --data-file=- --project=$ProjectId --replication-policy="automatic"
    } else {
        Write-Host "WARNING: Secret GEMINI_API_KEY does not exist yet." -ForegroundColor DarkYellow
        Write-Host "Create it before running the service using:" -ForegroundColor DarkYellow
        Write-Host "  `"YOUR_API_KEY`" | & $gcloudCmd secrets create GEMINI_API_KEY --data-file=- --project=$ProjectId" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "Secret GEMINI_API_KEY exists in Secret Manager." -ForegroundColor Green
}

# Grant Cloud Run default compute service account access to Secret Manager
$projectNumber = & $gcloudCmd projects describe $ProjectId --format="value(projectNumber)"
$computeSA = "${projectNumber}-compute@developer.gserviceaccount.com"

Write-Host "Granting Secret Accessor role to service account: $computeSA..."
& $gcloudCmd secrets add-iam-policy-binding GEMINI_API_KEY `
    --member="serviceAccount:$computeSA" `
    --role="roles/secretmanager.secretAccessor" `
    --project=$ProjectId 2>$null | Out-Null

# 3. Create Artifact Registry repository if needed
Write-Host "`n[3/5] Checking Artifact Registry repository..." -ForegroundColor Yellow
$arRepo = "mindmirror-repo"
$repoExists = & $gcloudCmd artifacts repositories describe $arRepo --location=$Region --project=$ProjectId 2>$null
if (-not $repoExists) {
    Write-Host "Creating Artifact Registry repository '$arRepo'..."
    & $gcloudCmd artifacts repositories create $arRepo `
        --repository-format=docker `
        --location=$Region `
        --project=$ProjectId `
        --description="MindMirror container images"
}

$imageUri = "${Region}-docker.pkg.dev/${ProjectId}/${arRepo}/${ServiceName}:latest"

# 4. Build and Push Container using Cloud Build
Write-Host "`n[4/5] Submitting build to Google Cloud Build..." -ForegroundColor Yellow
& $gcloudCmd builds submit --tag $imageUri --project=$ProjectId .

# 5. Deploy to Google Cloud Run with Mandatory Challenge Label & Secret Manager Binding
Write-Host "`n[5/5] Deploying container image to Cloud Run..." -ForegroundColor Yellow
& $gcloudCmd run deploy $ServiceName `
    --image=$imageUri `
    --platform=managed `
    --region=$Region `
    --allow-unauthenticated `
    --port=8080 `
    --memory=1Gi `
    --cpu=1 `
    --min-instances=0 `
    --max-instances=10 `
    --set-env-vars="ENVIRONMENT=production,PROJECT_ID=$ProjectId" `
    --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest" `
    --update-labels="dev-tutorial=cloud-run-ai-challenge" `
    --project=$ProjectId

Write-Host "`n==================================================================" -ForegroundColor Green
Write-Host "MindMirror deployed successfully to Cloud Run!" -ForegroundColor Green
$serviceUrl = & $gcloudCmd run services describe $ServiceName --platform=managed --region=$Region --format="value(status.url)" --project=$ProjectId
Write-Host "Service Live URL: $serviceUrl" -ForegroundColor Cyan
Write-Host "Health Check:     $serviceUrl/api/health" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Green
