#!/usr/bin/env python3
"""Interactive dev/build launcher for Scholarium with temporary JSON config persistence."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = REPO_ROOT / ".scholarium-dev.json"


@dataclass
class LauncherConfig:
    target: str = "desktop"
    cloud_sync: bool = False
    google_client_id: str = ""
    google_client_secret: str = ""
    discord_presence: bool = False
    discord_app_id: str = ""


def load_config(path: Path = DEFAULT_CONFIG_PATH) -> LauncherConfig | None:
    if not path.exists():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    return LauncherConfig(
        target="android" if raw.get("target") == "android" else "desktop",
        cloud_sync=bool(raw.get("cloud_sync", False)),
        google_client_id=str(raw.get("google_client_id", "")),
        google_client_secret=str(raw.get("google_client_secret", "")),
        discord_presence=bool(raw.get("discord_presence", False)),
        discord_app_id=str(raw.get("discord_app_id", "")),
    )


def save_config(config: LauncherConfig, path: Path = DEFAULT_CONFIG_PATH) -> None:
    path.write_text(json.dumps(asdict(config), indent=2) + "\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def clear_config(path: Path = DEFAULT_CONFIG_PATH) -> bool:
    if path.exists():
        path.unlink()
        return True
    return False


def mask_secret(value: str) -> str:
    if not value:
        return "(unset)"
    if len(value) <= 6:
        return "***"
    return f"{value[:3]}***{value[-2:]}"


def build_launch_plan(
    config: LauncherConfig,
    *,
    mode: str = "dev",
    base_env: dict[str, str] | None = None,
) -> tuple[list[str], dict[str, str]]:
    env = dict(base_env if base_env is not None else os.environ)
    cargo_features: list[str] = []

    if config.cloud_sync:
        cargo_features.append("cloud-sync")
        env["SCHOLARIUM_CLOUD_SYNC"] = "true"
        if config.google_client_id.strip():
            env["SCHOLARIUM_GOOGLE_CLIENT_ID"] = config.google_client_id.strip()
        if config.google_client_secret.strip():
            env["SCHOLARIUM_GOOGLE_CLIENT_SECRET"] = config.google_client_secret.strip()
    else:
        env["SCHOLARIUM_CLOUD_SYNC"] = "false"

    if config.target == "desktop" and config.discord_presence:
        cargo_features.append("discord-presence")
        env["SCHOLARIUM_DISCORD_PRESENCE"] = "true"
        if config.discord_app_id.strip():
            env["SCHOLARIUM_DISCORD_APP_ID"] = config.discord_app_id.strip()
    else:
        env["SCHOLARIUM_DISCORD_PRESENCE"] = "false"

    if config.target == "android":
        env["TAURI_ENV_PLATFORM"] = "android"
        if mode == "build":
            cmd = ["npm", "run", "tauri", "--", "android", "build"]
        else:
            cmd = ["npm", "run", "dev:android", "--"]
    else:
        env.pop("TAURI_ENV_PLATFORM", None)
        cmd = ["npm", "run", "tauri", "--", "build" if mode == "build" else "dev"]

    if cargo_features:
        if cmd[-1] != "--":
            cmd.append("--")
        cmd.extend(["--features", ",".join(cargo_features)])
    elif cmd[-1] == "--":
        cmd.pop()

    return cmd, env


def _prompt_bool(
    prompt: str, default: bool, input_fn: Callable[[str], str] = input
) -> bool:
    hint = "Y/n" if default else "y/N"
    raw = input_fn(f"{prompt} [{hint}]: ").strip().lower()
    if not raw:
        return default
    return raw in {"y", "yes", "s", "sim"}


def _prompt_str(
    prompt: str, default: str = "", input_fn: Callable[[str], str] = input
) -> str:
    suffix = f" [{default}]" if default else ""
    raw = input_fn(f"{prompt}{suffix}: ").strip()
    return raw if raw else default


def prompt_for_config(
    existing: LauncherConfig | None = None,
    input_fn: Callable[[str], str] = input,
) -> LauncherConfig:
    seed = existing or LauncherConfig()
    target_raw = _prompt_str("Target platform (desktop/android)", seed.target, input_fn).lower()
    target = "android" if target_raw == "android" else "desktop"

    cloud_sync = _prompt_bool("Enable cloud-sync?", seed.cloud_sync, input_fn)
    google_client_id = seed.google_client_id
    google_client_secret = seed.google_client_secret
    if cloud_sync:
        google_client_id = _prompt_str("SCHOLARIUM_GOOGLE_CLIENT_ID", google_client_id, input_fn)
        google_client_secret = _prompt_str(
            "SCHOLARIUM_GOOGLE_CLIENT_SECRET (optional)",
            google_client_secret,
            input_fn,
        )

    discord_presence = False
    discord_app_id = seed.discord_app_id
    if target == "desktop":
        discord_presence = _prompt_bool("Enable discord-presence?", seed.discord_presence, input_fn)
        if discord_presence:
            discord_app_id = _prompt_str("SCHOLARIUM_DISCORD_APP_ID", discord_app_id, input_fn)

    return LauncherConfig(
        target=target,
        cloud_sync=cloud_sync,
        google_client_id=google_client_id,
        google_client_secret=google_client_secret,
        discord_presence=discord_presence,
        discord_app_id=discord_app_id,
    )


def print_summary(config: LauncherConfig) -> None:
    print("Saved launcher configuration:")
    print(f"  target           : {config.target}")
    print(f"  cloud-sync       : {config.cloud_sync}")
    if config.cloud_sync:
        print(f"  google_client_id : {config.google_client_id or '(unset)'}")
        print(f"  google_secret    : {mask_secret(config.google_client_secret)}")
    if config.target == "desktop":
        print(f"  discord-presence : {config.discord_presence}")
        if config.discord_presence:
            print(f"  discord_app_id   : {config.discord_app_id or '(unset)'}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Interactive Scholarium dev/build launcher")
    parser.add_argument("--reuse", action="store_true", help="Reuse saved config without prompting")
    parser.add_argument("--clear", action="store_true", help="Remove saved temporary config and exit")
    parser.add_argument("--build", action="store_true", help="Run Tauri build instead of dev")
    parser.add_argument("--dry-run", action="store_true", help="Print command and exit without running")
    parser.add_argument(
        "--config-path",
        type=Path,
        default=DEFAULT_CONFIG_PATH,
        help="Path to temporary launcher JSON config",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    if args.clear:
        removed = clear_config(args.config_path)
        print(f"Cleared {args.config_path}" if removed else "No saved launcher config found.")
        return 0

    existing = load_config(args.config_path)
    if args.reuse:
        if existing is None:
            print("No saved launcher config found. Run without --reuse first.", file=sys.stderr)
            return 1
        config = existing
    elif existing is not None:
        print_summary(existing)
        if _prompt_bool("Reuse saved configuration?", True):
            config = existing
        else:
            config = prompt_for_config(existing)
            save_config(config, args.config_path)
    else:
        config = prompt_for_config(None)
        save_config(config, args.config_path)

    mode = "build" if args.build else "dev"
    cmd, env = build_launch_plan(config, mode=mode)
    print(f"Running: {' '.join(cmd)}")
    if args.dry_run:
        return 0

    completed = subprocess.run(cmd, cwd=REPO_ROOT, env=env, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
