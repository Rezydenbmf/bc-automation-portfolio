import shutil
from pathlib import Path


ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
ASSET_TYPES = ["avatar", "logo", "banner"]


def build_target_filename(asset_type: str) -> str:
    return f"identity_001_{asset_type}.png"


def get_first_image_file(folder_path: Path) -> Path | None:
    if not folder_path.exists():
        return None

    files = sorted(
        [
            path
            for path in folder_path.iterdir()
            if path.is_file() and path.suffix.lower() in ALLOWED_EXTENSIONS
        ]
    )
    return files[0] if files else None


def collect_assets(incoming_assets_dir: Path, packages_dir: Path) -> dict[str, int]:
    if not incoming_assets_dir.exists():
        raise ValueError("incoming_assets directory does not exist.")

    if not packages_dir.exists():
        raise ValueError("packages directory does not exist.")

    copied_count = 0
    missing_count = 0
    package_count = 0

    incoming_package_dirs = sorted([path for path in incoming_assets_dir.iterdir() if path.is_dir()])

    for incoming_package_dir in incoming_package_dirs:
        package_name = incoming_package_dir.name
        package_dir = packages_dir / package_name

        if not package_dir.exists():
            continue

        package_count += 1

        for asset_type in ASSET_TYPES:
            source_dir = incoming_package_dir / asset_type
            source_file = get_first_image_file(source_dir)

            if source_file is None:
                missing_count += 1
                continue

            target_file = package_dir / build_target_filename(asset_type)
            shutil.copy2(source_file, target_file)

            processed_dir = source_dir / "processed"
            processed_dir.mkdir(parents=True, exist_ok=True)
            processed_file = processed_dir / source_file.name
            shutil.move(str(source_file), str(processed_file))

            copied_count += 1
            print(f"OK | {package_name} | {asset_type} | {source_file.name}")

    return {
        "packages_found": package_count,
        "assets_copied": copied_count,
        "assets_missing": missing_count,
    }