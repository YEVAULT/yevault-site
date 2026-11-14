"""Refresh the static tracker from the public Google Sheet (Python stdlib only)."""

import argparse
import base64
import csv
import io
import json
import os
from pathlib import Path
import re
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]

# key: (sheet gid, expected length heading, quality/type column, links column)
TABS = {
    "u": ("199908479", "Track Length", 7, 8),
    "r": ("1295931150", "Length", 5, 7),
    "a": ("1297512832", "Copy Length", 6, 7),
}


def clean(value):
    return " ".join(value.split())


def parse_tab(text, key):
    _, length_heading, quality_column, links_column = TABS[key]
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        raise ValueError(f"{key}: empty export")
    header = rows[0]
    expected = {0: "Era", 1: "Name", 3: length_heading,
                quality_column: "Type" if key == "r" else "Quality",
                links_column: "Link(s)"}
    for column, label in expected.items():
        if len(header) <= column or header[column].split("\n")[0] != label:
            raise ValueError(f"{key}: sheet layout changed at column {column + 1}")
    eras = {}
    for row in rows[1:]:
        if not any(row):
            continue
        if len(row) <= links_column:
            raise ValueError(f"{key}: incomplete export row")
        era, name = clean(row[0]), clean(row[1])
        # Era introduction rows have counts in column A, or no era at all.
        if not era or not name or re.match(r"^\d+\s", era):
            continue
        # Tracker markers indicate recent changes / AI / lost files, not titles.
        name = name.lstrip("✨⁉️🤖 ")
        links = re.findall(r"https?://[^\s]+", row[links_column])
        entry = [name, clean(row[quality_column]) or "Not Available",
                 clean(row[3]), links[0] if links else ""]
        eras.setdefault(era, []).append(entry)
    if not eras:
        raise ValueError(f"{key}: no tracker entries")
    return eras


def decode_snapshot(path):
    match = re.fullmatch(r'const RAW="([A-Za-z0-9+/=]+)";\s*', path.read_text())
    if not match:
        raise ValueError("Unrecognized existing data.js format")
    return json.loads(base64.b64decode(match[1]))


def validate_change(previous, updated):
    for key in TABS:
        old_count = sum(map(len, previous[key].values()))
        new_count = sum(map(len, updated[key].values()))
        if new_count < old_count * 0.9:
            raise ValueError(f"{key}: refusing a drop from {old_count} to {new_count} entries")
        missing_eras = set(previous[key]) - set(updated[key])
        if missing_eras:
            raise ValueError(f"{key}: missing eras: {', '.join(sorted(missing_eras))}")
        print(f"{key}: {old_count:,} -> {new_count:,} entries; {len(updated[key])} eras")


def download(gid):
    sheet_id = os.environ.get("TRACKER_SHEET_ID", "")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", sheet_id):
        raise ValueError("TRACKER_SHEET_ID must be configured")
    # headers=0 prevents Google from combining the first songs into a guessed header.
    url = (f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
           f"?tqx=out:csv&headers=0&gid={gid}")
    for attempt in range(3):
        try:
            with urlopen(url, timeout=90) as response:
                return response.read().decode("utf-8-sig")
        except (OSError, UnicodeError):
            if attempt == 2:
                raise RuntimeError("Tracker download failed; saved data preserved") from None
            time.sleep(2 ** attempt)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv-dir", type=Path,
                        help="Read u.csv, r.csv, a.csv locally instead of downloading")
    parser.add_argument("--check", action="store_true", help="Validate without writing")
    args = parser.parse_args()
    destination = ROOT / "assets/data.js"
    previous = decode_snapshot(destination)
    updated = {}
    for key, (gid, *_) in TABS.items():
        text = ((args.csv_dir / f"{key}.csv").read_text(encoding="utf-8-sig")
                if args.csv_dir else download(gid))
        updated[key] = parse_tab(text, key)
    validate_change(previous, updated)
    if args.check:
        return
    if previous == updated:
        print("Tracker is already up to date.")
        return
    encoded = base64.b64encode(json.dumps(updated, ensure_ascii=False,
                                        separators=(",", ":")).encode()).decode()
    # Only replace the snapshot after every tab passes validation.
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(f'const RAW="{encoded}";\n')
    temporary.replace(destination)
    print("Updated assets/data.js")


if __name__ == "__main__":
    main()
