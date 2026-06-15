from pathlib import Path
import subprocess
import sys

BASE_DIR = Path(__file__).resolve().parent

GENERATOR_SCRIPT = BASE_DIR / "main.py"
COPY_SCRIPT = BASE_DIR / "copy_package_to_runtime.py"


def run_step(script_path: Path, step_name: str) -> None:
    if not script_path.exists():
        raise FileNotFoundError(f"Brak pliku: {script_path}")

    print(f"\n=== START: {step_name} ===")
    result = subprocess.run([sys.executable, str(script_path)], cwd=BASE_DIR)

    if result.returncode != 0:
        raise SystemExit(f"Błąd w kroku: {step_name}")


def main() -> None:
    run_step(GENERATOR_SCRIPT, "GENERATE PACKAGE")
    run_step(COPY_SCRIPT, "COPY PACKAGE TO RUNTIME")

    print("\n=== GOTOWE ===")
    print("Paczkę wygenerowano i skopiowano do runtime.")


if __name__ == "__main__":
    main()