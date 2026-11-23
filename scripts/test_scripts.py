import tempfile
import unittest
from pathlib import Path

from scripts.check import build_steps
from scripts.dev_launcher import (
    LauncherConfig,
    build_launch_plan,
    clear_config,
    load_config,
    mask_secret,
    prompt_for_config,
    save_config,
)


class DevLauncherTests(unittest.TestCase):
    def test_save_load_and_clear_config(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cfg_path = Path(tmp) / ".scholarium-dev.json"
            cfg = LauncherConfig(
                target="desktop",
                cloud_sync=True,
                google_client_id="client-123",
                google_client_secret="secret-xyz",
                discord_presence=True,
                discord_app_id="999888777",
            )
            save_config(cfg, cfg_path)
            loaded = load_config(cfg_path)
            self.assertEqual(loaded, cfg)
            self.assertTrue(clear_config(cfg_path))
            self.assertFalse(clear_config(cfg_path))
            self.assertIsNone(load_config(cfg_path))

    def test_build_launch_plan_desktop_with_features(self) -> None:
        cfg = LauncherConfig(
            target="desktop",
            cloud_sync=True,
            google_client_id="gid",
            google_client_secret="gsec",
            discord_presence=True,
            discord_app_id="123456",
        )
        cmd, env = build_launch_plan(cfg, mode="dev", base_env={})
        self.assertEqual(
            cmd,
            ["npm", "run", "tauri", "--", "dev", "--", "--features", "cloud-sync,discord-presence"],
        )
        self.assertEqual(env["SCHOLARIUM_CLOUD_SYNC"], "true")
        self.assertEqual(env["SCHOLARIUM_GOOGLE_CLIENT_ID"], "gid")
        self.assertEqual(env["SCHOLARIUM_GOOGLE_CLIENT_SECRET"], "gsec")
        self.assertEqual(env["SCHOLARIUM_DISCORD_PRESENCE"], "true")
        self.assertEqual(env["SCHOLARIUM_DISCORD_APP_ID"], "123456")

    def test_build_launch_plan_android_excludes_discord(self) -> None:
        cfg = LauncherConfig(
            target="android",
            cloud_sync=True,
            google_client_id="gid",
            discord_presence=True,
            discord_app_id="123456",
        )
        cmd, env = build_launch_plan(cfg, mode="dev", base_env={})
        self.assertEqual(cmd, ["npm", "run", "dev:android", "--", "--features", "cloud-sync"])
        self.assertEqual(env["TAURI_ENV_PLATFORM"], "android")
        self.assertEqual(env["SCHOLARIUM_DISCORD_PRESENCE"], "false")
        self.assertNotIn("SCHOLARIUM_DISCORD_APP_ID", env)

    def test_mask_secret_and_prompt_flow(self) -> None:
        self.assertEqual(mask_secret(""), "(unset)")
        self.assertEqual(mask_secret("abc"), "***")
        self.assertEqual(mask_secret("secret-token"), "sec***en")

        answers = iter(["desktop", "y", "client-id", "", "y", "555"])
        cfg = prompt_for_config(None, input_fn=lambda _: next(answers))
        self.assertEqual(cfg.target, "desktop")
        self.assertTrue(cfg.cloud_sync)
        self.assertEqual(cfg.google_client_id, "client-id")
        self.assertTrue(cfg.discord_presence)
        self.assertEqual(cfg.discord_app_id, "555")


class CheckRunnerTests(unittest.TestCase):
    def test_build_steps_covers_frontend_and_both_rust_crates(self) -> None:
        steps = build_steps("lint")
        names = [name for name, _ in steps]
        self.assertEqual(names, ["lint:frontend", "lint:core", "lint:tauri"])

    def test_build_steps_respects_filters(self) -> None:
        fe = build_steps("format", frontend_only=True, check_only=True)
        self.assertEqual(fe, [("format:frontend", ["npx", "biome", "format", "./src"])])

        be = build_steps("test", backend_only=True)
        self.assertEqual([name for name, _ in be], ["test:core", "test:tauri"])

    def test_build_steps_supports_fix_mode(self) -> None:
        steps = dict(build_steps("lint", fix=True))
        self.assertEqual(steps["lint:frontend"], ["npx", "biome", "check", "--write", "./src"])
        self.assertIn("--fix", steps["lint:core"])
        self.assertIn("--fix", steps["lint:tauri"])


if __name__ == "__main__":
    unittest.main()
