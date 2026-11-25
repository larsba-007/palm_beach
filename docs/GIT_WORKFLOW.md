# Palm Beach: git, backup and secrets

*Rewritten for Palm Beach in step 1.0 (25 Nov 2026). Original Boca text: `_to_delete/boca_docs/GIT_WORKFLOW.md`.*

## 1. The repository

- This folder is its own git repository, started 25 Nov 2026. It has no connection to the Boca Raton repository.
- One branch: `main`.
- **The first commit (`7da64a8`) is the reference point** for "how Boca did it": the untouched Boca web code plus the Palm Beach art. See an original file with `git show 7da64a8:js/game.js`.
- Backup: a **private GitHub repository** for Palm Beach. Push after every finished step. Never force-push.

## 2. How the work is saved

1. One step from `PLAN.md` at a time.
2. `npm run check` passes.
3. Commit with a message that starts with the step, for example "Step 1.1: ...".
4. Push to GitHub.
5. Update `PROGRESS.md`.

## 3. Secrets

- Never commit `.env` or `.env.local`. Both are in `.gitignore`.
- `.env.example` is in git with **empty** values. `.env.web` and `.env.full` hold only the edition name.
- Never copy `.env` files from the Boca project.
- The whole folder was scanned for keys and passwords before the first commit: none found.
- `npm run check` scans every web build.

## 4. Files that are kept out of git

`node_modules/`, `dist/`, `dist-web/`, `release/`, `out/`, `coverage/`, `.DS_Store`.

`.gitignore` also lists `build`, a rule inherited from Boca. The two Mac entitlement files in `build/` are needed for the Steam version, so they were added to git on purpose (`git add -f build`).

## 5. Deleting

Files are not deleted. Unused files are moved to `_to_delete/`, and Lars decides.
