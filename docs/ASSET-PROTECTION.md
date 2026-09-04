# SK LABS Asset Protection / Recovery

## SSOT
- Code: GitHub repository
- Documents, source manuscripts, images and deliverables: Google Drive
- Netlify / temporary agent environments: runtime and workspaces only; never the sole source of truth

## Git workflow
1. Never develop new features directly on `main`.
2. Create a feature branch.
3. Commit each meaningful milestone.
4. Open a PR and review diff/CI before merge.
5. Before high-risk integration, create a dated `backup/*` branch from the known-good commit.
6. Never force-update `main` during normal operation.
7. Never delete files or branches as part of cleanup until the replacement is verified in production.

## Secrets
- Never commit API keys, tokens or credentials.
- Runtime secrets belong in Netlify environment variables with Functions/runtime scope only.
- Browser code must call server-side Functions and must not receive provider secrets.

## Current recovery points (2026-08-22)
- `backup/main-pre-manga-20260822` -> `cf36418d74d77dd188c180f1c258786786dfa508`
- `backup/manga-creator-mvp-20260822` -> `924f6770f5b0215d7bec8c71e407097de41fa4fb`

## Recovery
If a regression or accidental deletion occurs:
1. Stop writes to affected branch.
2. Compare affected ref against the appropriate `backup/*` branch.
3. Restore only the missing/regressed files in a new recovery branch.
4. Open a PR; do not force-push `main`.
5. Verify Netlify production before declaring recovery complete.
