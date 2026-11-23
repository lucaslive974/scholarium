#!/usr/bin/env python3
"""Unified format, lint, typecheck, and test runner for frontend and Rust crates."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CORE_MANIFEST = "src-tauri/crates/scholarium-core/Cargo.toml"
APP_MANIFEST = "src-tauri/Cargo.toml"


def build_steps(
    task: str,
    *,
    frontend_only: bool = False,
    backend_only: bool = False,
    check_only: bool = False,
    fix: bool = False,
) -> list[tuple[str, list[str]]]:
    steps: list[tuple[str, list[str]]] = []
    run_frontend = not backend_only
    run_backend = not frontend_only

    if task in {"format", "all"}:
        if run_frontend:
            cmd = (
                ["npx", "biome", "format", "./src"]
                if check_only and not fix
                else ["npm", "run", "format:frontend"]
            )
            steps.append(("format:frontend", cmd))
        if run_backend:
            for label, manifest in [("core", CORE_MANIFEST), ("tauri", APP_MANIFEST)]:
                cmd = ["cargo", "fmt", "--manifest-path", manifest]
                if check_only and not fix:
                    cmd.append("--check")
                steps.append((f"format:{label}", cmd))

    if task in {"lint", "all"}:
        if run_frontend:
            if fix:
                steps.append(
                    ("lint:frontend", ["npx", "biome", "check", "--write", "./src"]),
                )
                steps.append(("lint:tailwind", ["node", "tools/lint-tailwind.mjs"]))
            else:
                steps.append(("lint:frontend", ["npm", "run", "lint:frontend"]))
        if run_backend:
            core_clippy = [
                "cargo",
                "clippy",
                "--manifest-path",
                CORE_MANIFEST,
                "--all-features",
                "--all-targets",
            ]
            tauri_clippy = [
                "cargo",
                "clippy",
                "--manifest-path",
                APP_MANIFEST,
                "--all-features",
                "--lib",
                "--tests",
            ]
            if fix:
                core_clippy.extend(["--fix", "--allow-dirty", "--allow-staged"])
                tauri_clippy.extend(["--fix", "--allow-dirty", "--allow-staged"])
            core_clippy.extend(["--", "-D", "warnings"])
            tauri_clippy.extend(["--", "-D", "warnings"])
            steps.append(("lint:core", core_clippy))
            steps.append(("lint:tauri", tauri_clippy))

    if task in {"typecheck", "all"}:
        if run_frontend:
            steps.append(("typecheck:frontend", ["npm", "run", "typecheck:frontend"]))
        if run_backend:
            steps.append(("typecheck:core", ["npm", "run", "typecheck:backend"]))
            steps.append(
                (
                    "typecheck:tauri",
                    ["cargo", "check", "--manifest-path", APP_MANIFEST, "--all-features", "--tests"],
                )
            )

    if task in {"test", "all"}:
        if run_frontend:
            steps.append(("test:frontend", ["npm", "run", "test:frontend"]))
        if run_backend:
            steps.append(("test:core", ["npm", "run", "test:backend"]))
            steps.append(
                (
                    "test:tauri",
                    ["cargo", "test", "--manifest-path", APP_MANIFEST, "--all-features", "--lib"],
                )
            )

    return steps


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Scholarium formatters, linters, and tests")
    parser.add_argument(
        "task",
        choices=["format", "lint", "typecheck", "test", "all"],
        nargs="?",
        default="all",
        help="Check suite to run (default: all)",
    )
    parser.add_argument("--frontend-only", action="store_true", help="Run only frontend checks")
    parser.add_argument("--backend-only", action="store_true", help="Run only Rust backend checks")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Check formatting without writing files (for format/all)",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Auto-fix formatting and lint issues where supported",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print commands without executing")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.frontend_only and args.backend_only:
        print("Cannot pass both --frontend-only and --backend-only", file=sys.stderr)
        return 2

    steps = build_steps(
        args.task,
        frontend_only=args.frontend_only,
        backend_only=args.backend_only,
        check_only=args.check or (args.task == "all" and not args.fix),
        fix=args.fix,
    )
    for name, cmd in steps:
        print(f"==> [{name}] {' '.join(cmd)}")
        if args.dry_run:
            continue
        res = subprocess.run(cmd, cwd=REPO_ROOT, check=False)
        if res.returncode != 0:
            return res.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
