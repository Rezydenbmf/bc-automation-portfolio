from pathlib import Path
import shutil
import sys

CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from bc_paths import USERS_CSV, COMPANIES_CSV, AVATAR_DIR, BANNER_DIR, LOGO_DIR


PACKAGE_DIR = CURRENT_DIR / "output"
USERS_SRC = PACKAGE_DIR / "users.csv"
COMPANIES_SRC = PACKAGE_DIR / "companies.csv"

AVATAR_SRC_DIR = PACKAGE_DIR / "images" / "avatar"
BANNER_SRC_DIR = PACKAGE_DIR / "images" / "banner"
LOGO_SRC_DIR = PACKAGE_DIR / "images" / "logo"


def ensure_runtime_dirs() -> None:
    USERS_CSV.parent.mkdir(parents=True, exist_ok=True)
    COMPANIES_CSV.parent.mkdir(parents=True, exist_ok=True)
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    BANNER_DIR.mkdir(parents=True, exist_ok=True)
    LOGO_DIR.mkdir(parents=True, exist_ok=True)


def require_file(path: Path) -> None:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Brak pliku: {path}")


def require_dir(path: Path) -> None:
    if not path.exists() or not path.is_dir():
        raise FileNotFoundError(f"Brak katalogu: {path}")


def clear_files_in_dir(directory: Path) -> None:
    for item in directory.iterdir():
        if item.is_file():
            item.unlink()


def copy_file(src: Path, dst: Path) -> None:
    shutil.copy2(src, dst)


def copy_all_files(src_dir: Path, dst_dir: Path) -> None:
    for item in src_dir.iterdir():
        if item.is_file():
            shutil.copy2(item, dst_dir / item.name)


def main() -> None:
    if not PACKAGE_DIR.exists() or not PACKAGE_DIR.is_dir():
        raise FileNotFoundError(f"Brak katalogu pakietu: {PACKAGE_DIR}")

    ensure_runtime_dirs()

    if USERS_SRC.exists() and USERS_SRC.is_file():
        copy_file(USERS_SRC, USERS_CSV)
    else:
        print(f"Ostrzeżenie — brak pliku, pomijam: {USERS_SRC}")

    if COMPANIES_SRC.exists() and COMPANIES_SRC.is_file():
        copy_file(COMPANIES_SRC, COMPANIES_CSV)
    else:
        print(f"Ostrzeżenie — brak pliku, pomijam: {COMPANIES_SRC}")

    if AVATAR_SRC_DIR.exists() and AVATAR_SRC_DIR.is_dir():
        clear_files_in_dir(AVATAR_DIR)
        copy_all_files(AVATAR_SRC_DIR, AVATAR_DIR)
    else:
        print(f"Ostrzeżenie — brak katalogu, pomijam: {AVATAR_SRC_DIR}")

    if BANNER_SRC_DIR.exists() and BANNER_SRC_DIR.is_dir():
        clear_files_in_dir(BANNER_DIR)
        copy_all_files(BANNER_SRC_DIR, BANNER_DIR)
    else:
        print(f"Ostrzeżenie — brak katalogu, pomijam: {BANNER_SRC_DIR}")

    if LOGO_SRC_DIR.exists() and LOGO_SRC_DIR.is_dir():
        clear_files_in_dir(LOGO_DIR)
        copy_all_files(LOGO_SRC_DIR, LOGO_DIR)
    else:
        print(f"Ostrzeżenie — brak katalogu, pomijam: {LOGO_SRC_DIR}")

    print("Pakiet skopiowany do runtime.")


if __name__ == "__main__":
    main()