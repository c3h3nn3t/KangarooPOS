# Cursor Rules CLI

Lightweight helper to install and keep `.cursorrules` in sync with the canonical KangarooPOS template.

## Commands

- `pos-cursor-rules init` — writes `.cursorrules` from the bundled template (use `--force` to overwrite).
- `pos-cursor-rules update` — updates `.cursorrules` to match the template; creates it if missing.
- `pos-cursor-rules check` — exits non-zero if `.cursorrules` is missing or out of date.

The CLI injects `<!-- cursor-rules-version: <package-version> -->` at the top of the file for easy drift detection.
