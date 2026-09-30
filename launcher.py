#!/usr/bin/env python3
"""
Slime Lab launcher - opens the game in a borderless app window.

The whole game is one self-contained .html with no external requests, so there is
nothing to install.
"""
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

APP = "SlimeLab"
PAGE = "slime_game.html"
WINDOW = "560,940"          # a phone-shaped window; the layout is built for it


def base_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS", Path(sys.executable).parent))
    return Path(__file__).resolve().parent


def find_browser():
    pf = os.environ.get("ProgramFiles", r"C:\Program Files")
    pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    local = os.environ.get("LOCALAPPDATA", "")
    for c in (
        Path(pf) / "Google/Chrome/Application/chrome.exe",
        Path(pf86) / "Google/Chrome/Application/chrome.exe",
        Path(local) / "Google/Chrome/Application/chrome.exe",
        Path(pf) / "Microsoft/Edge/Application/msedge.exe",
        Path(pf86) / "Microsoft/Edge/Application/msedge.exe",
    ):
        if c.is_file():
            return c
    return None


def stage_page() -> Path:
    src = base_dir() / PAGE
    if not src.is_file():
        alt = Path(sys.executable).parent / PAGE
        if alt.is_file():
            src = alt
        else:
            raise SystemExit(f"  {PAGE} not found next to the launcher.")
    # A stable per-user home, so saved progress survives between runs.
    dest_dir = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / APP
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / PAGE
    try:
        shutil.copy2(src, dest)
    except OSError:
        pass
    return dest if dest.is_file() else src


def main() -> int:
    page = stage_page()
    url = page.as_uri()
    browser = find_browser()

    if browser:
        profile = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / APP / "profile"
        profile.mkdir(parents=True, exist_ok=True)
        cmd = [
            str(browser),
            f"--app={url}",
            f"--user-data-dir={profile}",
            f"--window-size={WINDOW}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-features=Translate",
        ]
        DETACHED = 0x00000008
        NO_WINDOW = 0x08000000
        try:
            subprocess.Popen(cmd, creationflags=DETACHED | NO_WINDOW, close_fds=True)
            return 0
        except OSError as e:
            print(f"  could not start {browser.name}: {e}")

    print("  No Chrome or Edge found - opening with the default browser.")
    try:
        os.startfile(str(page))  # noqa: S606
        return 0
    except Exception as e:
        print(f"  could not open the page: {e}")
        print(f"  Open it by hand: {page}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
