#!/usr/bin/env python3
"""
Update PluralKit member avatar_urls to point at the CDN copies in pk/avatars.

Matches each <name>.png file in pk/avatars/ to a system member by name
(exact match, case-insensitive; falls back to fuzzy matching with a
confirmation prompt), then PATCHes that member's avatar_url to:

    https://m.doughmination.gay/pk/avatars/<name>.png

Run from anywhere; it always looks at pk/avatars/ next to the repo root
(one level up from this script's scripts/ folder).
Requires the `requests` package.
"""

import difflib
import getpass
import sys
from pathlib import Path

import requests

API_BASE = "https://api.pluralkit.me/v2"
CDN_BASE = "https://m.doughmination.gay/pk/avatars"
AVATARS_DIR = Path(__file__).resolve().parent.parent / "pk" / "avatars"
FUZZY_CUTOFF = 0.6  # difflib similarity threshold for suggesting a fuzzy match


def get_members(token: str) -> list[dict]:
    resp = requests.get(
        f"{API_BASE}/systems/@me/members",
        headers={"Authorization": token},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def find_match(stem: str, members: list[dict], by_name: dict[str, dict]) -> dict | None:
    lower = stem.lower()

    # exact match on name or display_name (case-insensitive)
    if lower in by_name:
        return by_name[lower]

    # fuzzy fallback, confirmed interactively
    candidates = difflib.get_close_matches(lower, by_name.keys(), n=3, cutoff=FUZZY_CUTOFF)
    if not candidates:
        return None

    print(f"\n  No exact match for '{stem}'. Closest candidates:")
    options = [by_name[c] for c in candidates]
    for i, m in enumerate(options, start=1):
        label = m["name"]
        if m.get("display_name") and m["display_name"].lower() != m["name"].lower():
            label += f" (display: {m['display_name']})"
        print(f"    {i}. {label}  [{m['id']}]")
    print("    0. skip")

    choice = input("  Pick a match [0]: ").strip()
    if not choice or choice == "0":
        return None
    try:
        idx = int(choice)
        if 1 <= idx <= len(options):
            return options[idx - 1]
    except ValueError:
        pass
    print("  Invalid choice, skipping.")
    return None


def main() -> int:
    token = getpass.getpass("PluralKit authorization token: ").strip()
    if not token:
        print("No token given, aborting.")
        return 1

    try:
        members = get_members(token)
    except requests.HTTPError as e:
        print(f"Failed to fetch members: {e}")
        return 1

    by_name: dict[str, dict] = {}
    for m in members:
        by_name.setdefault(m["name"].lower(), m)
        if m.get("display_name"):
            by_name.setdefault(m["display_name"].lower(), m)

    png_files = sorted(AVATARS_DIR.glob("*.png"))
    if not png_files:
        print("No .png files found here.")
        return 1

    updated, skipped = [], []

    for path in png_files:
        stem = path.stem
        member = find_match(stem, members, by_name)
        if member is None:
            print(f"[skip]  {path.name} -> no member match")
            skipped.append(path.name)
            continue

        url = f"{CDN_BASE}/{path.name}"
        confirm = input(
            f"[match] {path.name} -> {member['name']} [{member['id']}]  set avatar_url? [Y/n] "
        ).strip().lower()
        if confirm == "n":
            print("        skipped by user")
            skipped.append(path.name)
            continue

        resp = requests.patch(
            f"{API_BASE}/members/{member['id']}",
            headers={"Authorization": token},
            json={"avatar_url": url},
            timeout=30,
        )
        if resp.status_code == 200:
            print(f"        updated -> {url}")
            updated.append(path.name)
        else:
            print(f"        FAILED ({resp.status_code}): {resp.text}")
            skipped.append(path.name)

    print(f"\nDone. Updated {len(updated)}, skipped {len(skipped)}.")
    if skipped:
        print("Skipped:", ", ".join(skipped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
