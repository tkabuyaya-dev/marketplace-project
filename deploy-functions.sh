#!/bin/bash
# ============================================================
# AURABUJA — Deploy Cloud Functions (Bash)
# ============================================================
# Usage: bash deploy-functions.sh
# ============================================================

set -e

echo "=== AuraBuja Cloud Functions Deployment ==="

# Step 1: Install
echo -e "\n[1/3] Installing dependencies..."
cd "$(dirname "$0")/functions"
npm install

# Step 2: Build (lint runs as predeploy)
echo -e "\n[2/3] Building TypeScript..."
npm run build

# Step 3: Deploy
echo -e "\n[3/3] Deploying to Firebase..."
cd "$(dirname "$0")"
firebase deploy --only functions

echo -e "\n=== Deployment successful! ==="
