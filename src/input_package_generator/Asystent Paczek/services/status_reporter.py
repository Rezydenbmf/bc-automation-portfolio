import json
from pathlib import Path


REQUIRED_ASSET_FILES = [
    "identity_001_avatar.png",
    "identity_001_logo.png",
    "identity_001_banner.png",
]

REQUIRED_JSON_FILES = [
    "identity_profile.json",
    "expansion_request.json",
]


def json_file_is_filled(file_path: Path) -> bool:
    if not file_path.exists():
        return False

    raw_text = file_path.read_text(encoding="utf-8").strip()
    if not raw_text:
        return False

    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError:
        return False

    return isinstance(data, dict) and len(data) > 0


def get_package_status_rows(packages_dir: Path) -> list[dict]:
    if not packages_dir.exists():
        raise ValueError("packages directory does not exist.")

    package_dirs = sorted([path for path in packages_dir.iterdir() if path.is_dir()])
    rows: list[dict] = []

    for package_dir in package_dirs:
        missing_files: list[str] = []
        empty_json_files: list[str] = []

        for file_name in REQUIRED_JSON_FILES:
            file_path = package_dir / file_name
            if not file_path.exists():
                missing_files.append(file_name)
                continue

            if not json_file_is_filled(file_path):
                empty_json_files.append(file_name)

        for file_name in REQUIRED_ASSET_FILES:
            if not (package_dir / file_name).exists():
                missing_files.append(file_name)

        rows.append(
            {
                "package_name": package_dir.name,
                "missing_files": missing_files,
                "empty_json_files": empty_json_files,
                "is_complete": len(missing_files) == 0 and len(empty_json_files) == 0,
            }
        )

    return rows


def print_package_status(packages_dir: Path) -> None:
    rows = get_package_status_rows(packages_dir)

    complete_count = 0

    for row in rows:
        package_name = row["package_name"]
        missing_files = row["missing_files"]
        empty_json_files = row["empty_json_files"]

        if row["is_complete"]:
            complete_count += 1
            print(f"OK | {package_name} | COMPLETE")
            continue

        status_parts: list[str] = []

        if missing_files:
            status_parts.append("missing: " + ", ".join(missing_files))

        if empty_json_files:
            status_parts.append("empty_or_invalid_json: " + ", ".join(empty_json_files))

        print(f"MISSING | {package_name} | {' | '.join(status_parts)}")

    print(f"Packages total: {len(rows)}")
    print(f"Packages complete: {complete_count}")
    print(f"Packages incomplete: {len(rows) - complete_count}")