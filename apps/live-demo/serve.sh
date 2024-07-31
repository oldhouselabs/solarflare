#!/bin/bash

# Exit immediately if a command exits with a non-zero status,
# if there are unset variables, or if any command in a pipeline fails
set -euo pipefail

# Get the local network IP address
export LOCAL_IP=$(ipconfig getifaddr en0)

# Fail if DATABASE_URL is not set
if [ -z "${DATABASE_URL}" ]; then
  echo "DATABASE_URL is not set. Please set it before running this script."
  exit 1
fi

# Set the environment variables.
export DB_CONNECTION_STRING=$DATABASE_URL
export JWT_SECRET_KEY="sjdkfhskjfhs"

# Interpolate the local IP address into the frontend and backend URLs
export LIVE_DEMO_FRONTEND_URL="http://$LOCAL_IP:3000"
export LIVE_DEMO_BACKEND_URL="http://$LOCAL_IP:3001"
export NEXT_PUBLIC_SOLARFLARE_URL="http://$LOCAL_IP:54321"
export NEXT_PUBLIC_BACKEND_URL=$LIVE_DEMO_BACKEND_URL

# Install dependencies and build the project
pnpm install
turbo build --env-mode=loose

# Migrations
pnpm -F @repo/live-demo-be exec kysely migrate up

# Function to cleanup background processes
cleanup() {
  echo "Cleaning up background processes..."
  pkill -P $$
}

# Trap script exit (0) and all common termination signals to run the cleanup function
trap cleanup EXIT TERM INT

# Launch the Solarflare daemon
pnpm -F @repo/live-demo-be exec solarflare start &

# Serve the backend
pnpm -F @repo/live-demo-be dev &

# Serve the frontend
pnpm -F @repo/live-demo-fe dev &

# Wait for the background processes to finish
wait
