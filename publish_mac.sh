#!/bin/bash

# ==============================================================================
# GOLD COAST GAMBITS - macOS BUILD & PUBLISH PIPELINE
# Script: publish_mac.sh
# Usage: ./publish_mac.sh [demo|full]
# ==============================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Setup colors for console output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0;68m' # No Color

# Display usage instructions
usage() {
    echo -e "${YELLOW}Usage: $0 [demo|full]${NC}"
    echo -e "  demo  : Builds, notarizes, and publishes the Demo version of the game"
    echo -e "  full  : Builds, notarizes, and publishes the Full version of the game"
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
echo -e "${BLUE} Starting Gold Coast Gambits macOS Publish Pipeline [Edition: ${EDITION}]${NC}"
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

# If KEYCHAIN_PASSWORD is not set in .env, prompt the user securely
if [ -z "$KEYCHAIN_PASSWORD" ]; then
    echo -n -e "${YELLOW}Mac password is required to unlock Keychain for codesign signing.${NC}\n"
    read -s -p "Enter your Mac login password (or press Enter to skip): " KEYCHAIN_PASSWORD
    echo ""
fi

# Optionally unlock macOS Keychain if a password was provided or entered
if [ -n "$KEYCHAIN_PASSWORD" ]; then
    echo -e "${YELLOW}Unlocking macOS Keychain...${NC}"
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" ~/Library/Keychains/login.keychain-db
fi

# Validate Apple credentials
if [ -z "$APPLE_ID" ] || [ -z "$APPLE_PASSWORD" ] || [ -z "$APPLE_TEAM_ID" ]; then
    echo -e "${RED}Error: Apple credentials (APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID) must be set in .env.${NC}"
    exit 1
fi

# Validate Steam credentials
if [ -z "$STEAM_USERNAME" ]; then
    echo -e "${RED}Error: STEAM_USERNAME must be set in .env.${NC}"
    exit 1
fi

# 3. Setup Edition-specific configurations
if [ "$EDITION" = "demo" ]; then
    APP_NAME="Gold Coast Gambits Demo"
    STEAM_APP_ID="$STEAM_APP_ID_DEMO"
    STEAM_DEPOT_ID="$STEAM_DEPOT_ID_DEMO"
    OUTPUT_DIR="dist/demo-game"
    BUILD_CMD="npm run build:demo:mac"
else
    APP_NAME="Gold Coast Gambits"
    STEAM_APP_ID="$STEAM_APP_ID_FULL"
    STEAM_DEPOT_ID="$STEAM_DEPOT_ID_FULL"
    OUTPUT_DIR="dist/full-game"
    BUILD_CMD="npm run build:full:mac"
fi

# Validate Steam App / Depot IDs
if [ -z "$STEAM_APP_ID" ] || [ -z "$STEAM_DEPOT_ID" ]; then
    echo -e "${RED}Error: Steam App ID or Depot ID for ${EDITION} is not defined in .env.${NC}"
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

# 5. Build the Electron application
echo -e "\n${YELLOW}[Step 1/5] Building the Electron application...${NC}"
echo -e "Running: ${BLUE}$BUILD_CMD${NC}"

# Temporarily remove Apple credentials from the environment passed to child processes.
# This prevents electron-builder from attempting automatic, unconfigured notarization.
export -n APPLE_ID
export -n APPLE_PASSWORD
export -n APPLE_TEAM_ID

$BUILD_CMD

# Restore them to the environment for notarytool
export APPLE_ID
export APPLE_PASSWORD
export APPLE_TEAM_ID

APP_PATH="${OUTPUT_DIR}/mac-arm64/${APP_NAME}.app"
if [ ! -d "$APP_PATH" ]; then
    echo -e "${RED}Error: Built app bundle not found at '$APP_PATH'.${NC}"
    exit 1
fi
echo -e "${GREEN}Build succeeded! Built app: $APP_PATH${NC}"

# 6. Compress and Notarize the app
ZIP_PATH="${OUTPUT_DIR}/mac-arm64/${APP_NAME}.zip"
echo -e "\n${YELLOW}[Step 2/5] Compressing app bundle for Apple Notarization...${NC}"
rm -f "$ZIP_PATH" # Remove stale zip if any
/usr/bin/ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"
echo -e "${GREEN}Zip archive created at: $ZIP_PATH${NC}"

echo -e "\n${YELLOW}[Step 3/5] Submitting to Apple Notarization Service...${NC}"
echo -e "This might take a few minutes. Submitting zip with Apple ID: $APPLE_ID"

# Run notarytool and block until done, capturing the output
NOTARY_OUT=$(xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait 2>&1 || true)

echo "$NOTARY_OUT"

# Clean up temporary zip archive immediately
rm -f "$ZIP_PATH"

if [[ ! "$NOTARY_OUT" =~ "status: Accepted" ]]; then
    echo -e "${RED}Error: Apple Notarization failed (status was not 'Accepted').${NC}"
    
    # Extract the submission ID to get the log
    SUB_ID=$(echo "$NOTARY_OUT" | grep -i "id:" | head -n 1 | awk '{print $2}')
    if [ -n "$SUB_ID" ]; then
        echo -e "${YELLOW}Fetching notarization log for submission ID: $SUB_ID...${NC}"
        xcrun notarytool log "$SUB_ID" \
            --apple-id "$APPLE_ID" \
            --password "$APPLE_PASSWORD" \
            --team-id "$APPLE_TEAM_ID" || true
    fi
    exit 1
fi

echo -e "${GREEN}Notarization request completed successfully!${NC}"

# 7. Staple the Notarization Ticket to the app
echo -e "\n${YELLOW}[Step 4/5] Stapling the notarization ticket to the app...${NC}"
xcrun stapler staple "$APP_PATH"
echo -e "${GREEN}Stapling complete!${NC}"

# Verify the app signature and notarization assessment locally
echo -e "\n${YELLOW}Verifying signature and notarization status...${NC}"
codesign --verify --deep --verbose "$APP_PATH"
spctl --assess --type execute --verbose "$APP_PATH"
echo -e "${GREEN}Verification passed! App is correctly signed and notarized.${NC}"

# 8. Setup Steamworks VDF configuration files
echo -e "\n${YELLOW}[Step 5/5] Generating VDF configuration files...${NC}"

# Resolve absolute paths required by Steamworks
ABS_CONTENT_ROOT=$(cd "${OUTPUT_DIR}/mac-arm64" && pwd)
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
    "steam/app_build_${EDITION}.vdf.template" > "${ABS_VDF_DIR}/app_build_${EDITION}.vdf"
    
sed -e "s|__STEAM_DEPOT_ID__|$STEAM_DEPOT_ID|g" \
    -e "s|__CONTENT_ROOT__|$ABS_CONTENT_ROOT|g" \
    -e "s|__APP_NAME__|$APP_NAME|g" \
    "steam/depot_build_${EDITION}.vdf.template" > "${ABS_VDF_DIR}/depot_build_${EDITION}.vdf"

echo -e "${GREEN}VDF files written to: ${ABS_VDF_DIR}${NC}"

# Run SteamCMD to upload the build (using Rosetta 2 translation on Apple Silicon)
echo -e "\n${YELLOW}Triggering SteamCMD upload...${NC}"
if [ -n "$STEAM_PASSWORD" ]; then
    # Headless login using stored password
    arch -x86_64 "$STEAMCMD_EXE" \
        +login "$STEAM_USERNAME" "$STEAM_PASSWORD" \
        +run_app_build "${ABS_VDF_DIR}/app_build_${EDITION}.vdf" \
        +quit
else
    # Interactive login prompting for password (useful when Steam Guard is active)
    echo -e "${YELLOW}Steam password not set in .env. Prompting for credentials...${NC}"
    arch -x86_64 "$STEAMCMD_EXE" \
        +login "$STEAM_USERNAME" \
        +run_app_build "${ABS_VDF_DIR}/app_build_${EDITION}.vdf" \
        +quit
fi

echo -e "\n${GREEN}======================================================================${NC}"
echo -e "${GREEN} SUCCESS: Gold Coast Gambits macOS [${EDITION}] is built, signed,${NC}"
echo -e "${GREEN} notarized, and uploaded to Steam!${NC}"
echo -e "${GREEN}======================================================================${NC}"
