from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = BASE_DIR / "workspace"

COMPANY_LIST_CSV = WORKSPACE_DIR / "company_list.csv"
PACKAGES_DIR = WORKSPACE_DIR / "packages"
INCOMING_ASSETS_DIR = WORKSPACE_DIR / "incoming_assets"
LOGS_DIR = BASE_DIR / "logs"

PACKAGE_JSON_FILES = [
    "identity_profile.json",
    "expansion_request.json",
]

PACKAGE_TEXT_FILES = [
    "asset_prompts.txt",
    "search_queries.txt",
]

ASSET_SUBDIRS = [
    "avatar",
    "logo",
    "banner",
]