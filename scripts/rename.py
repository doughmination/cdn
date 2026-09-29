#!/usr/bin/env python3

import json
import re
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Set this to True once you're happy with the output.
RENAME = True

API = "https://api.pluralkit.me/v2/members/"
USER_AGENT = "PluralKit Avatar Renamer/1.0"

IMAGE_EXTENSIONS = {".webp", ".png", ".jpg", ".jpeg"}


def get_member(member_id):
    url = API + member_id

    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT
        }
    )

    try:
        with urlopen(request, timeout=10) as response:
            return json.load(response)

    except HTTPError as e:
        if e.code == 404:
            print(f"  [!] Member {member_id} does not exist")
        else:
            print(f"  [!] API error for {member_id}: HTTP {e.code}")
        return None

    except URLError as e:
        print(f"  [!] Network error for {member_id}: {e}")
        return None


def sanitise_filename(name):
    # Remove characters that aren't valid/useful in filenames.
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', name)

    # Avoid accidental leading/trailing whitespace.
    name = name.strip()

    # Avoid Windows-reserved names too, just in case.
    if name.upper() in {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5",
        "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5",
        "LPT6", "LPT7", "LPT8", "LPT9",
    }:
        name = "_" + name

    return name or "unknown"


def main():
    directory = Path.cwd()

    files = sorted(
        p for p in directory.iterdir()
        if p.is_file()
        and p.suffix.lower() in IMAGE_EXTENSIONS
        and p.name.startswith("avatar-")
    )

    if not files:
        print("No avatar files found.")
        return

    print(f"Found {len(files)} avatar(s).\n")

    planned = []

    for index, file in enumerate(files):
        # avatar-abbxvw.webp -> abbxvw
        member_id = file.stem.removeprefix("avatar-")

        print(f"{file.name}")
        print(f"  Member ID: {member_id}")

        member = get_member(member_id)

        if member is None:
            print("  -> SKIPPED\n")
            continue

        name = member.get("name")

        if not name:
            print("  -> Member has no name, skipped\n")
            continue

        name = sanitise_filename(name)

        destination = directory / f"{name}{file.suffix.lower()}"

        # Deal with duplicate member names.
        if destination.exists() and destination != file:
            counter = 2

            while True:
                candidate = directory / f"{name} ({counter}){file.suffix.lower()}"

                if not candidate.exists():
                    destination = candidate
                    break

                counter += 1

        print(f"  Name:    {name}")
        print(f"  Rename:  {file.name} -> {destination.name}")

        planned.append((file, destination))

        print()

        # PluralKit currently allows 10 GET requests/sec.
        # 0.12 gives us a little breathing room.
        time.sleep(0.12)

    print("=" * 60)

    if not planned:
        print("Nothing to rename.")
        return

    if not RENAME:
        print("DRY RUN — no files were changed.")
        print()
        print("If everything looks correct, change:")
        print()
        print("    RENAME = False")
        print()
        print("to:")
        print()
        print("    RENAME = True")
        return

    print("Renaming files...\n")

    for source, destination in planned:
        try:
            source.rename(destination)
            print(f"[OK] {source.name} -> {destination.name}")
        except OSError as e:
            print(f"[!] Failed to rename {source.name}: {e}")


if __name__ == "__main__":
    main()
