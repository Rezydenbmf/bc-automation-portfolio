import shutil
from pathlib import Path

from exceptions import ValidationError


def copy_asset_file(source_path: Path, target_dir: Path) -> Path:
    if not source_path.exists():
        raise ValidationError(f"Missing required asset file: {source_path.name}")

    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / source_path.name
    shutil.copy2(source_path, target_path)
    return target_path


def copy_assets_to_output(workspace_dir: Path, identity_data: dict, avatar_dir: Path, banner_dir: Path, logo_dir: Path) -> None:
    assets = identity_data["assets"]

    avatar_source = workspace_dir / assets["avatar_filename"]
    banner_source = workspace_dir / assets["banner_filename"]
    logo_source = workspace_dir / assets["logo_filename"]

    copy_asset_file(avatar_source, avatar_dir)
    copy_asset_file(banner_source, banner_dir)
    copy_asset_file(logo_source, logo_dir)