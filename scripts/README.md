# Scripts & Developer Tools

- `tools/`: Internal build, lint, and coverage utilities invoked by `package.json` (`lint-tailwind.mjs`, `rust-coverage.mjs`).
- `scripts/`: Developer-facing Python workflow scripts (stdlib only).

## Dev Launcher (`scripts/dev_launcher.py`)

Prompts for target (`desktop` / `android`), optional compile-time features (`cloud-sync`, `discord-presence`), and environment variables (`SCHOLARIUM_GOOGLE_CLIENT_ID`, `SCHOLARIUM_GOOGLE_CLIENT_SECRET`, `SCHOLARIUM_DISCORD_APP_ID`), saving your choices in `.scholarium-dev.json` (gitignored) for fast re-runs.

```bash
python3 scripts/dev_launcher.py           # Interactive prompt (or reuse saved config)
python3 scripts/dev_launcher.py --reuse   # Reuse saved .scholarium-dev.json directly
python3 scripts/dev_launcher.py --clear   # Delete saved .scholarium-dev.json
python3 scripts/dev_launcher.py --build   # Run Tauri build instead of dev
```

## Check Runner (`scripts/check.py`)

Runs formatters, linters, typechecks, and tests across frontend, `scholarium-core`, and `src-tauri`:

```bash
python3 scripts/check.py format           # Format frontend + core + src-tauri
python3 scripts/check.py lint             # Biome + Tailwind + clippy (--all-features)
python3 scripts/check.py lint --fix       # Auto-fix Biome + clippy issues
python3 scripts/check.py typecheck        # tsc + cargo check (--all-features)
python3 scripts/check.py test             # Vitest + rust-coverage + src-tauri tests
python3 scripts/check.py all              # Run all checks (format --check, lint, typecheck, test)
python3 scripts/check.py all --fix        # Auto-fix format/lint and run typecheck + test
```
