"""
fix_runtime_pkg.py — backfill _runtime_pkg for packages that are missing it.

Usage:
  python fix_runtime_pkg.py            # auto mode: all qualifying folders in output/
  python fix_runtime_pkg.py "path"     # manual mode: specific folder
"""

import csv
import json
import shutil
import subprocess
import sys
from pathlib import Path

from input_package_generator.mapper import build_email_from_brand

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "output"
IPG_DIR = ROOT / "input_package_generator"
WORKSPACE_DIR = IPG_DIR / "workspace"
IPG_OUTPUT_DIR = IPG_DIR / "output"
MAIN_PY = IPG_DIR / "main.py"



def _collect_auto_folders() -> list[Path]:
    folders = []
    for folder in sorted(OUTPUT_DIR.iterdir()):
        if not folder.is_dir():
            continue
        if not (folder / "01_identity_profile.json").exists():
            continue
        if not (folder / "02_expansion_request.json").exists():
            continue
        if (folder / "_runtime_pkg").exists():
            continue
        folders.append(folder)
    return folders


def _prepare_workspace(pkg_folder: Path, identity_data: dict) -> None:
    shutil.copy(pkg_folder / "01_identity_profile.json", WORKSPACE_DIR / "identity_profile.json")
    shutil.copy(pkg_folder / "02_expansion_request.json", WORKSPACE_DIR / "expansion_request.json")

    assets = identity_data.get("assets", {})
    for key in ("avatar_filename", "logo_filename", "banner_filename"):
        filename = assets.get(key)
        if not filename:
            continue
        src = pkg_folder / filename
        if src.exists():
            shutil.copy(src, WORKSPACE_DIR / filename)
        else:
            print(f"  [WARN] Asset not found in package folder, skipping: {filename}")


def _save_runtime_pkg(pkg_folder: Path, identity_data: dict) -> bool:
    """Copy IPG output → pkg_folder/_runtime_pkg with email verification guard."""
    base_brand_name = identity_data.get("brand", {}).get("base_brand_name", "").strip()
    expected_email = build_email_from_brand(base_brand_name)

    output_users_csv = IPG_OUTPUT_DIR / "users.csv"
    if not output_users_csv.exists():
        print("  [ERROR] input_package_generator/output/users.csv not found after running main.py")
        return False

    with output_users_csv.open(encoding="utf-8", newline="") as fh:
        output_email = next(csv.DictReader(fh)).get("email", "").strip()

    if output_email != expected_email:
        print(
            f"  [ERROR] Błąd: email w output nie pasuje do paczki {pkg_folder.name} - pomijam zapis _runtime_pkg"
        )
        print(f"          oczekiwano={expected_email!r}  otrzymano={output_email!r}")
        return False

    runtime_pkg = pkg_folder / "_runtime_pkg"
    if runtime_pkg.exists():
        shutil.rmtree(runtime_pkg)
    shutil.copytree(str(IPG_OUTPUT_DIR), str(runtime_pkg))
    return True


def _process_folder(pkg_folder: Path) -> str:
    """Returns 'fixed', 'failed', or 'skipped'."""
    print(f"\n--- {pkg_folder.name} ---")

    identity_path = pkg_folder / "01_identity_profile.json"
    try:
        with identity_path.open(encoding="utf-8") as fh:
            identity_data = json.load(fh)
    except Exception as exc:
        print(f"  [ERROR] Nie można odczytać 01_identity_profile.json: {exc}")
        return "failed"

    try:
        _prepare_workspace(pkg_folder, identity_data)
    except Exception as exc:
        print(f"  [ERROR] Nie można przygotować workspace: {exc}")
        return "failed"

    print("  Uruchamiam input_package_generator/main.py ...")
    result = subprocess.run(
        [sys.executable, str(MAIN_PY)],
        capture_output=True,
        text=True,
        cwd=str(IPG_DIR),
    )
    for line in result.stdout.splitlines():
        print(f"    {line}")
    for line in result.stderr.splitlines():
        print(f"    [STDERR] {line}")

    combined_output = result.stdout + result.stderr
    if "Validation failed" in combined_output:
        print(f"  [SKIP] Validation failed for {pkg_folder.name} — fix expansion_request.json first")
        return "failed"

    if result.returncode != 0:
        print(f"  [ERROR] main.py zakończył się kodem {result.returncode}")
        return "failed"

    try:
        ok = _save_runtime_pkg(pkg_folder, identity_data)
    except Exception as exc:
        print(f"  [ERROR] Nie można zapisać _runtime_pkg: {exc}")
        return "failed"

    if not ok:
        return "failed"

    print("  [OK] _runtime_pkg zapisany.")
    return "fixed"


def main() -> None:
    if len(sys.argv) > 1:
        folder = Path(sys.argv[1]).resolve()
        if not folder.is_dir():
            print(f"[ERROR] Nie znaleziono folderu: {folder}")
            sys.exit(1)
        if not (folder / "01_identity_profile.json").exists() or not (folder / "02_expansion_request.json").exists():
            print(f"[ERROR] Folder nie zawiera 01_identity_profile.json lub 02_expansion_request.json: {folder}")
            sys.exit(1)
        folders = [folder]
        print(f"Tryb manualny: {folder}")
    else:
        folders = _collect_auto_folders()
        if not folders:
            print("Brak folderów do naprawy — wszystkie mają już _runtime_pkg lub brak kwalifikujących się folderów.")
            return
        print(f"Tryb auto: znaleziono {len(folders)} folder(ów) bez _runtime_pkg")

    fixed = failed = skipped = 0
    for folder in folders:
        outcome = _process_folder(folder)
        if outcome == "fixed":
            fixed += 1
        elif outcome == "failed":
            failed += 1
        else:
            skipped += 1

    print(f"\n{'=' * 50}")
    print(f"Podsumowanie: {fixed} naprawiono, {failed} błędów, {skipped} pominięto")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
