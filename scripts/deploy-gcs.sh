#!/bin/bash
#
# Deploy Disc Golf Tracker to Google Cloud Storage
#
# Prerequisites:
# 1. Google Cloud SDK installed (gcloud)
# 2. Authenticated with: gcloud auth login
# 3. Project set with: gcloud config set project YOUR_PROJECT_ID
#
# Usage:
#   ./scripts/deploy-gcs.sh BUCKET_NAME
#
# Example:
#   ./scripts/deploy-gcs.sh my-disc-golf-app
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if bucket name is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: Bucket name is required${NC}"
    echo "Usage: $0 BUCKET_NAME"
    echo "Example: $0 my-disc-golf-app"
    exit 1
fi

BUCKET_NAME="$1"
BUCKET_URL="gs://${BUCKET_NAME}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo -e "${GREEN}=== Disc Golf Tracker GCS Deployment ===${NC}"
echo ""

# Check for gcloud
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if authenticated
if ! gcloud auth print-access-token &> /dev/null; then
    echo -e "${RED}Error: Not authenticated with gcloud${NC}"
    echo "Run: gcloud auth login"
    exit 1
fi

# Get current project
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No project set${NC}"
    echo "Run: gcloud config set project YOUR_PROJECT_ID"
    exit 1
fi

echo -e "${YELLOW}Project:${NC} $PROJECT_ID"
echo -e "${YELLOW}Bucket:${NC} $BUCKET_NAME"
echo ""

# Create bucket if it doesn't exist
echo -e "${GREEN}Checking bucket...${NC}"
if ! gsutil ls "$BUCKET_URL" &> /dev/null; then
    echo "Creating bucket $BUCKET_NAME..."
    gsutil mb -p "$PROJECT_ID" -l US "$BUCKET_URL"
fi

# Configure bucket for static website hosting
echo -e "${GREEN}Configuring static website hosting...${NC}"
gsutil web set -m index.html -e index.html "$BUCKET_URL"

# Set bucket to public read access
echo -e "${GREEN}Setting public access...${NC}"
gsutil iam ch allUsers:objectViewer "$BUCKET_URL"

# Define files to upload (excluding dev/test files)
echo -e "${GREEN}Uploading files...${NC}"

# Upload HTML
gsutil -h "Content-Type:text/html" -h "Cache-Control:no-cache, max-age=0" \
    cp "$PROJECT_DIR/index.html" "$BUCKET_URL/"

# Upload CSS
gsutil -h "Content-Type:text/css" -h "Cache-Control:public, max-age=31536000" \
    cp "$PROJECT_DIR/css/styles.css" "$BUCKET_URL/css/"

# Upload JavaScript files
for js_file in "$PROJECT_DIR"/js/*.js; do
    gsutil -h "Content-Type:application/javascript" -h "Cache-Control:public, max-age=31536000" \
        cp "$js_file" "$BUCKET_URL/js/"
done

# Upload manifest
gsutil -h "Content-Type:application/manifest+json" -h "Cache-Control:no-cache, max-age=0" \
    cp "$PROJECT_DIR/manifest.json" "$BUCKET_URL/"

# Upload service worker (no cache for updates)
gsutil -h "Content-Type:application/javascript" -h "Cache-Control:no-cache, max-age=0" \
    cp "$PROJECT_DIR/sw.js" "$BUCKET_URL/"

# Upload icons
for icon_file in "$PROJECT_DIR"/icons/*.png; do
    gsutil -h "Content-Type:image/png" -h "Cache-Control:public, max-age=31536000" \
        cp "$icon_file" "$BUCKET_URL/icons/"
done

# Upload SVG icon if exists
if [ -f "$PROJECT_DIR/icons/icon.svg" ]; then
    gsutil -h "Content-Type:image/svg+xml" -h "Cache-Control:public, max-age=31536000" \
        cp "$PROJECT_DIR/icons/icon.svg" "$BUCKET_URL/icons/"
fi

echo ""
echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo ""
echo -e "Your app is available at:"
echo -e "  ${YELLOW}https://storage.googleapis.com/${BUCKET_NAME}/index.html${NC}"
echo ""
echo -e "Or configure a custom domain with Cloud CDN for better performance."
echo ""
echo -e "${YELLOW}Important:${NC} Don't forget to:"
echo "  1. Update js/config.js with your Google Cloud Client ID"
echo "  2. Add your GCS URL to the OAuth authorized JavaScript origins"
echo "     in the Google Cloud Console"
echo ""
