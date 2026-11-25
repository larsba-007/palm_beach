# Boca Raton: Git & GitHub Workflow Reference

This document documents the verified Git repository structure, remotes, branches, security risks, cross-platform conventions (Windows & macOS), and the recommended branching strategy for Claude Code and future AI coding assistants.

---

## 1. Verified Git & GitHub Configuration

The following facts were verified directly from the repository's `.git` configuration, remote origins, and commit logs:

| Item | Verified Value | Notes |
| :--- | :--- | :--- |
| **GitHub Remote URL** | `https://github.com/larsba-007/boca-raton.git` | Primary origin |
| **Repository Name** | `boca-raton` | Owned by `larsba-007` |
| **Repository Visibility**| **Private** | Verified (unauthenticated requests return HTTP 404) |
| **Active Local Branch**| `feature/web-version` | All Web edition work happens here |
| **Remote Branches** | `origin/main` (`origin/HEAD`), `origin/AG-Steam-current-version`, `origin/feature/web-version` | Verified when the Web edition (Steps 1-7) was finished |
| **Working Tree State** | Clean at the end of every Web step | Check with `git status` |
| **Sync Status** | `main` equals `origin/main`. `feature/web-version` is **ahead of `origin/feature/web-version`** | The Web edition commits exist locally and are **not pushed yet**. Check with `git status -sb` |
| **Git LFS** | **Not Configured** | All audio and texture assets are tracked as standard Git blobs |
| **Git Tags** | `ag-steam-handover-2026-10-21` | Snapshot taken at the Gemini/Antigravity to Claude Code handover |
| **Frozen Backup** | `AG-Steam-current-version` (branch) | Backup of the handed-over Steam version |

### Branch and tag rules

| Ref | Rule |
| :--- | :--- |
| `AG-Steam-current-version` (branch) | **Frozen backup. Never modify.** |
| `ag-steam-handover-2026-10-21` (tag) | **Never move, delete or re-create.** |
| `main` | Feeds the live Steam release pipelines. **Do not change it without the product owner's explicit approval**, and only through a reviewed pull request. |
| `feature/web-version` | Current development branch (Web Party Edition). Never force-push or rewrite its history without explicit approval. |

Nothing may be published or uploaded to Steam from this branch.

---

## 2. Critical Security Findings: Credentials & Secret Exposure

> [!CAUTION]
> **HIGH RISK SECURITY FINDING**: Credentials and API keys have been committed into the repository or are currently tracked in Git history.

### Specific Findings:
1. **Tracked `.env.local` File**:
   - The `.gitignore` file currently contains an exact-match rule: `.env`.
   - It does **NOT** wildcard-ignore `.env.local` or `.env.*`.
   - As a result, `.env.local` is actively tracked by Git and contains an active **Google Gemini API Key** (`VITE_GEMINI_API_KEY`).
2. **Apple Credentials in `.env.example`**:
   - The tracked file `.env.example` contains a real Apple Developer Team ID (`APPLE_TEAM_ID`) and an App-Specific Apple Password (`APPLE_PASSWORD`).
   - Although commented as an example, actual credential values were committed into Git history.

> **Status: NOT remediated yet.** Credential cleanup is a separate task that the product owner has asked to handle on its own. No value from these files is shown in any document, log or build.

### Re-verified while finishing the Web edition (variable names only; values were never displayed)
- `.env.local` is tracked; `VITE_GEMINI_API_KEY` has a value.
- `.env.example` is tracked; `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` and `STEAM_USERNAME` have values. `STEAM_PASSWORD` and `KEYCHAIN_PASSWORD` are empty.
- `.env.full` and `.env.web` are tracked and contain **only** the edition flag (`VITE_GAME_EDITION`). They are safe and are needed for the builds.
- `.gitignore` still contains only the exact rule `.env`.
- The Web build (`dist-web`) was scanned after every step: no Gemini key, no Apple or Steam credentials, no Steamworks code. The commits on `feature/web-version` add no secrets.

### Recommended Remediation Steps (to be done as a separate, approved task)
1. Update `.gitignore` to match secret environment files, **but keep the two harmless edition files tracked**:
   ```gitignore
   .env
   .env.*
   !.env.example
   !.env.full
   !.env.web
   ```
   (Without the last two lines, `.env.full` and `.env.web` would be ignored and a fresh clone could not build the Full or Web edition.)
2. Remove `.env.local` from the Git index without deleting the local file (do **not** do this for `.env.full` or `.env.web`):
   ```bash
   git rm --cached .env.local
   ```
3. Sanitize `.env.example` so it contains only placeholders, never real identifiers or passwords.
4. **Rotate** the Gemini API key and the Apple app-specific password. They remain in Git history even after the files are untracked, so rotation matters more than deleting the files. Decide separately whether to rewrite history (needs explicit approval) before the repository or any build is made public.

---

## 3. Cross-Platform Development (Windows & macOS)

The developer and AI tools work across both **macOS** and **Windows 11**. To prevent cross-platform friction:

### 3.1 Line Endings (CRLF vs LF)
- macOS and Linux use `LF` (`\n`); Windows uses `CRLF` (`\r\n`).
- Current state: there is **no `.gitattributes`** in the repository, and the Windows machine uses `core.autocrlf=true`, so the working copies of `js/*.js`, `index.html` and `index.css` have CRLF line endings while Git stores LF. Tools that edit these files must preserve CRLF.
- Shell scripts (`publish_mac.sh`, `publish_win.sh`) must retain **LF** line endings. If Windows Git checkout converts them to CRLF, running them on macOS will fail with `\r: command not found`.
- **Recommended `.gitattributes` configuration**:
  ```gitattributes
  * text=auto
  *.sh text eol=lf
  *.json text eol=lf
  *.js text eol=lf
  *.html text eol=lf
  *.css text eol=lf
  *.webp binary
  *.mp3 binary
  *.aac binary
  *.png binary
  *.ico binary
  ```

### 3.2 Platform-Specific Build Scripts
- `publish_mac.sh`: Designed for execution directly on macOS. Handles Apple Developer codesigning and `xcrun notarytool`.
- `publish_win.sh`: Titled *"WINDOWS BUILD & PUBLISH PIPELINE FROM MAC"*. It can be executed on macOS or in Git Bash on Windows to build the Windows Electron distribution and trigger SteamCMD.
- On native Windows PowerShell, use the npm scripts directly:
  - Demo: `npm run build:demo:win`
  - Full: `npm run build:full:win`

---

## 4. Safe Branching & Release Strategy

Developing directly on `main` is **dangerous** because `main` is used to trigger live Steam production deployments.

### Repository structure (as it is now)

```
main (Steam live)
 |-- tag ag-steam-handover-2026-10-21     (snapshot, never moved)
 |-- AG-Steam-current-version             (frozen backup branch)
 `-- feature/web-version                  (Web Party Edition, 7 steps, one commit per step)
```

1. **Snapshot tag**: `ag-steam-handover-2026-10-21` marks the handed-over Steam state so Steam Full and Demo can be reproduced at any time. (The earlier plan to create `v1.0.0-steam` was replaced by this tag.)
2. **Dedicated branch for Web development**: all Web work lives on `feature/web-version`, so web changes cannot break the desktop Steam builds or trigger an accidental SteamCMD deployment. Each step is one commit; nothing is pushed without approval.
3. **Protected `main`**: keep `main` as the stable production trunk. Merge `feature/web-version` only through a reviewed pull request after the product owner has launched the Steam builds in Electron (see `WEB_EDITION.md`, sections 8 and 10).

### Proving the Steam files are untouched
```bash
git diff main -- electron-main.js electron-builder.demo.json electron-builder.full.json publish_mac.sh publish_win.sh steam .env.full
```
Empty output means none of the Steam packaging, publishing or edition files changed on the Web branch.
