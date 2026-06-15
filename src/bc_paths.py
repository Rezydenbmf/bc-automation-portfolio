from pathlib import Path
import sys


if getattr(sys, "frozen", False):
    ROOT_DIR = Path.cwd()
else:
    ROOT_DIR = Path(__file__).resolve().parent


DATA_DIR = ROOT_DIR / "Data"
CSV_DIR = DATA_DIR / "csv"

INPUT_PACKAGE_DIR = DATA_DIR / "input_package"
INPUT_IMAGES_DIR = INPUT_PACKAGE_DIR / "images"

AVATAR_DIR = INPUT_IMAGES_DIR / "avatar"
BANNER_DIR = INPUT_IMAGES_DIR / "banner"
LOGO_DIR = INPUT_IMAGES_DIR / "logo"
GRAFIKA_DIR = DATA_DIR / "images" / "grafika"

LOGS_DIR = ROOT_DIR / "logs"
LAUNCHER_LOGS_DIR = LOGS_DIR / "launcher"
PLAYWRIGHT_BROWSERS_DIR = ROOT_DIR / "playwright_browsers"

USERS_CSV = INPUT_PACKAGE_DIR / "users.csv"
COMPANIES_CSV = INPUT_PACKAGE_DIR / "companies.csv"

REGISTER_RESULTS_CSV = CSV_DIR / "register_results.csv"
PROFILE_RESULTS_CSV = CSV_DIR / "profile_results.csv"
COMPANY_RESULTS_CSV = CSV_DIR / "company_results.csv"
COMPANY_STEP2_RESULTS_CSV = CSV_DIR / "company_step2_results.csv"

FILLATOR_POPUP_IMAGE = GRAFIKA_DIR / "fillator.png"
FILLATOR_SUCCESS_IMAGE = GRAFIKA_DIR / "fillator_sukces.png"