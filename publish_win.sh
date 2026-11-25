#!/bin/bash

# ==============================================================================
# GOLD COAST GAMBITS - WINDOWS BUILD & PUBLISH PIPELINE FROM MAC
# Script: publish_win.sh
# Usage: ./publish_win.sh [demo|full]
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Setup colors for console output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Display usage instructions
usage() {
    echo -e "${YELLOW}Usage: $0 [demo|full]${NC}"
    echo -e "  demo  : Builds and publishes the Windows Demo version to Steam"
    echo -e "  full  : Builds and publishes the Windows Full version to Steam"
    exit 1
}

# 1. Parse and validate arguments
if [ "$#" -ne 1 ]; then
    usage
fi

EDITION=$(echo "$1" | tr '[:upper:]' '[:lower:]')

if [ "$EDITION" != "demo" ] && [ "$EDITION" != "full" ]; then
    echo -e "${RED}Error: Invalid argument '$1'.${NC}"
    usage
fi

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE} Starting Gold Coast Gambits Windows Publish Pipeline [Edition: ${EDITION}]${NC}"
echo -e "${BLUE}======================================================================${NC}"

# 2. Load and validate environment variables
ENV_FILE=".env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: .env file not found!${NC}"
    echo -e "Please copy .env.example to .env and fill in your credentials."
    exit 1
fi

# Load env variables (filtering comments and empty lines)
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

# Validate Steam credentials
if [ -z "$STEAM_USERNAME" ]; then
    echo -e "${RED}Error: STEAM_USERNAME must be set in .env.${NC}"
    exit 1
fi

# 3. Setup Edition-specific configurations
if [ "$EDITION" = "demo" ]; then
    APP_NAME="Gold Coast Gambits Demo"
    STEAM_APP_ID="$STEAM_APP_ID_DEMO"
    STEAM_DEPOT_ID="$STEAM_DEPOT_ID_DEMO_WIN"
    OUTPUT_DIR="dist/demo-game"
    BUILD_CMD="npm run build:demo:win"
else
    APP_NAME="Gold Coast Gambits"
    STEAM_APP_ID="$STEAM_APP_ID_FULL"
    STEAM_DEPOT_ID="$STEAM_DEPOT_ID_FULL_WIN"
    OUTPUT_DIR="dist/full-game"
    BUILD_CMD="npm run build:full:win"
fi

# Validate Steam App / Depot IDs
if [ -z "$STEAM_APP_ID" ] || [ -z "$STEAM_DEPOT_ID" ]; then
    echo -e "${RED}Error: Steam App ID or Depot ID for Windows ${EDITION} is not defined in .env.${NC}"
    echo -e "Please ensure STEAM_DEPOT_ID_DEMO_WIN and STEAM_DEPOT_ID_FULL_WIN are set."
    exit 1
fi

# 4. Resolve SteamCMD executable
STEAMCMD_EXE="steamcmd"
if [ -n "$STEAMCMD_PATH" ]; then
    STEAMCMD_EXE="$STEAMCMD_PATH"
fi

# Check if SteamCMD exists and is executable
if ! command -v "$STEAMCMD_EXE" &> /dev/null; then
    echo -e "${RED}Error: SteamCMD not found at '$STEAMCMD_EXE'.${NC}"
    echo -e "Please install SteamCMD or update STEAMCMD_PATH in your .env file."
    exit 1
fi

# 5. Build the Electron application for Windows
echo -e "\n${YELLOW}[Step 1/3] Building the Electron Windows application...${NC}"
echo -e "Running: ${BLUE}$BUILD_CMD${NC}"

# Temporarily remove Apple credentials to avoid unwanted macOS build notarization tasks
export -n APPLE_ID
export -n APPLE_PASSWORD
export -n APPLE_TEAM_ID

$BUILD_CMD

APP_PATH="${OUTPUT_DIR}/win-unpacked"
if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}Error: Built app folder not found at '$APP_PATH'.${NC}"
    exit 1
fi
echo -e "${GREEN}Build succeeded! Built app: $APP_PATH${NC}"

# 6. Setup Steamworks VDF configuration files
echo -e "\n${YELLOW}[Step 2/3] Generating Windows VDF configuration files...${NC}"

# Resolve absolute paths required by Steamworks
ABS_CONTENT_ROOT=$(cd "${OUTPUT_DIR}/win-unpacked" && pwd)
ABS_BUILD_OUTPUT=$(mkdir -p dist/steam_logs && cd dist/steam_logs && pwd)
ABS_VDF_DIR=$(mkdir -p dist/vdfs && cd dist/vdfs && pwd)

echo -e "Content Root: $ABS_CONTENT_ROOT"
echo -e "Build Output: $ABS_BUILD_OUTPUT"

# Substitute values in VDF templates and write to target directory
sed -e "s|__STEAM_APP_ID__|$STEAM_APP_ID|g" \
    -e "s|__STEAM_DEPOT_ID__|$STEAM_DEPOT_ID|g" \
    -e "s|__CONTENT_ROOT__|$ABS_CONTENT_ROOT|g" \
    -e "s|__BUILD_OUTPUT__|$ABS_BUILD_OUTPUT|g" \
    -e "s|__APP_NAME__|$APP_NAME|g" \
    -e "s|depot_build_${EDITION}.vdf|depot_build_${EDITION}_win.vdf|g" \
    "steam/app_build_${EDITION}.vdf.template" > "${ABS_VDF_DIR}/app_build_${EDITION}_win.vdf"
    
sed -e "s|__STEAM_DEPOT_ID__|$STEAM_DEPOT_ID|g" \
    -e "s|__CONTENT_ROOT__|$ABS_CONTENT_ROOT|g" \
    -e "s|__APP_NAME__|$APP_NAME|g" \
    "steam/depot_build_${EDITION}.vdf.template" > "${ABS_VDF_DIR}/depot_build_${EDITION}_win.vdf"

echo -e "${GREEN}VDF files written to: ${ABS_VDF_DIR}${NC}"

# 7. Run SteamCMD to upload the build
echo -e "\n${YELLOW}[Step 3/3] Triggering SteamCMD upload...${NC}"
if [ -n "$STEAM_PASSWORD" ]; then
    # Headless login using stored password
    arch -x86_64 "$STEAMCMD_EXE" \
        +login "$STEAM_USERNAME" "$STEAM_PASSWORD" \
        +run_app_build "${ABS_VDF_DIR}/app_build_${EDITION}_win.vdf" \
        +quit
else
    # Interactive login prompting for password (useful when Steam Guard is active)
    echo -e "${YELLOW}Steam password not set in .env. Prompting for credentials...${NC}"
    arch -x86_64 "$STEAMCMD_EXE" \
        +login "$STEAM_USERNAME" \
        +run_app_build "${ABS_VDF_DIR}/app_build_${EDITION}_win.vdf" \
        +quit
fi

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN} SUCCESS: Gold Coast Gambits Windows [${EDITION}] is built${NC}"
echo -e "${GREEN} and uploaded to Steam!${NC}"
echo -e "${GREEN}======================================================================${NC}"
