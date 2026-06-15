import csv
from pathlib import Path

from config import ASSET_SUBDIRS, INCOMING_ASSETS_DIR, PACKAGE_JSON_FILES, PACKAGE_TEXT_FILES
from utils.slug import build_package_folder_name


def load_company_names(csv_path: Path) -> list[str]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Missing file: {csv_path}")

    company_names: list[str] = []

    with csv_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        if "company_name" not in (reader.fieldnames or []):
            raise ValueError("CSV must contain 'company_name' column")

        for row in reader:
            company_name = (row.get("company_name") or "").strip()
            if company_name:
                company_names.append(company_name)

    if not company_names:
        raise ValueError("CSV contains no company names")

    return company_names


def create_package_structure(packages_dir: Path, company_names: list[str]) -> list[Path]:
    packages_dir.mkdir(parents=True, exist_ok=True)
    INCOMING_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    created_packages: list[Path] = []

    for index, company_name in enumerate(company_names, start=1):
        package_name = build_package_folder_name(index, company_name)

        package_dir = packages_dir / package_name
        incoming_package_dir = INCOMING_ASSETS_DIR / package_name

        package_dir.mkdir(parents=True, exist_ok=True)
        incoming_package_dir.mkdir(parents=True, exist_ok=True)

        for json_file_name in PACKAGE_JSON_FILES:
            (package_dir / json_file_name).touch(exist_ok=True)

        for text_file_name in PACKAGE_TEXT_FILES:
            (package_dir / text_file_name).touch(exist_ok=True)

        for asset_subdir in ASSET_SUBDIRS:
            (incoming_package_dir / asset_subdir).mkdir(parents=True, exist_ok=True)

        created_packages.append(package_dir)

    return created_packages