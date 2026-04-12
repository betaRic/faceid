#!/bin/bash
# Download ML models for @vladmandic/human
# Run this script to download models locally for offline operation
# Usage: ./download-models.sh

set -e

MODELS_DIR="public/models/human"
VERSION="3.3.6"
BASE_URL="https://cdn.jsdelivr.net/npm/@vladmandic/human@${VERSION}/models"

echo "Creating models directory..."
mkdir -p "$MODELS_DIR"

# Essential models for face attendance (not hand tracking)
MODELS=(
  "blazeface.json"
  "blazeface.bin"
  "faceres.json"
  "faceres.bin"
  "facemesh.json"
  "facemesh.bin"
  "iris.json"
  "iris.bin"
  "liveness.json"
  "liveness.bin"
)

echo "Downloading essential models..."

for model in "${MODELS[@]}"; do
  echo "Downloading $model..."
  curl -L -o "$MODELS_DIR/$model" "${BASE_URL}/${model}"
done

echo "Download complete!"
echo "Models saved to: $MODELS_DIR"

# List downloaded files
echo ""
echo "Downloaded files:"
ls -lh "$MODELS_DIR"