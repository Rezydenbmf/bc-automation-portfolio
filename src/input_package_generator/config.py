from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent

WORKSPACE_DIR = BASE_DIR / "workspace"
TEMPLATES_DIR = BASE_DIR / "templates"
LOGS_DIR = BASE_DIR / "logs"
OUTPUT_DIR = BASE_DIR / "output"

USERS_OUTPUT_CSV = OUTPUT_DIR / "users.csv"
COMPANIES_OUTPUT_CSV = OUTPUT_DIR / "companies.csv"

IMAGES_DIR = OUTPUT_DIR / "images"
AVATAR_OUTPUT_DIR = IMAGES_DIR / "avatar"
BANNER_OUTPUT_DIR = IMAGES_DIR / "banner"
LOGO_OUTPUT_DIR = IMAGES_DIR / "logo"