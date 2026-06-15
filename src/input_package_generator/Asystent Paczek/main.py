import sys

from config import COMPANY_LIST_CSV, INCOMING_ASSETS_DIR, PACKAGES_DIR
from services.asset_assigner import collect_assets
from services.package_creator import create_package_structure, load_company_names
from services.prompt_generator import generate_asset_prompts_file
from services.query_generator import generate_search_queries_file
from services.status_reporter import print_package_status


def run_init() -> None:
    company_names = load_company_names(COMPANY_LIST_CSV)
    created_packages = create_package_structure(PACKAGES_DIR, company_names)

    print(f"Loaded companies: {len(company_names)}")
    print(f"Created packages: {len(created_packages)}")

    for package_dir in created_packages:
        print(package_dir.name)


def run_generate() -> None:
    if not PACKAGES_DIR.exists():
        print("Packages directory does not exist.")
        return

    package_dirs = sorted([path for path in PACKAGES_DIR.iterdir() if path.is_dir()])

    print(f"Found packages: {len(package_dirs)}")

    generated_prompts = 0
    generated_queries = 0
    skipped_packages = 0

    for package_dir in package_dirs:
        try:
            generate_asset_prompts_file(package_dir)
            generate_search_queries_file(package_dir)
            generated_prompts += 1
            generated_queries += 1
            print(f"OK | {package_dir.name}")
        except Exception:
            skipped_packages += 1

    print(f"Generated asset prompt files: {generated_prompts}")
    print(f"Generated search query files: {generated_queries}")
    print(f"Skipped packages: {skipped_packages}")


def run_collect() -> None:
    try:
        result = collect_assets(INCOMING_ASSETS_DIR, PACKAGES_DIR)
        print(f"Packages found: {result['packages_found']}")
        print(f"Assets copied: {result['assets_copied']}")
        print(f"Assets missing: {result['assets_missing']}")
    except ValueError as error:
        print(error)


def run_status() -> None:
    print_package_status(PACKAGES_DIR)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage:")
        print("  py main.py init")
        print("  py main.py generate")
        print("  py main.py collect")
        print("  py main.py status")
        return

    command = sys.argv[1].strip().lower()

    if command == "init":
        run_init()
        return

    if command == "generate":
        run_generate()
        return

    if command == "collect":
        run_collect()
        return

    if command == "status":
        run_status()
        return

    print(f"Unknown command: {command}")
    print("Available commands: init, generate, collect, status")


if __name__ == "__main__":
    main()