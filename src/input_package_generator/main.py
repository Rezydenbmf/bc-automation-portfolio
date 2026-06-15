from pathlib import Path
import logging
import traceback
from datetime import datetime

from config import (
    LOGS_DIR,
    WORKSPACE_DIR,
    OUTPUT_DIR,
    USERS_OUTPUT_CSV,
    COMPANIES_OUTPUT_CSV,
    AVATAR_OUTPUT_DIR,
    BANNER_OUTPUT_DIR,
    LOGO_OUTPUT_DIR,
)
from exceptions import ValidationError
from validator import run_validation
from mapper import build_user_row, build_company_rows
from csv_writer import write_users_csv, write_companies_csv
from asset_writer import copy_assets_to_output


def setup_logging() -> Path:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    log_file = LOGS_DIR / f"package_generator_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        handlers=[
            logging.FileHandler(log_file, encoding="utf-8"),
            logging.StreamHandler()
        ]
    )

    logging.info("Input Package Generator started")
    return log_file


def prepare_output_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    AVATAR_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    BANNER_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    LOGO_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def main() -> int:
    setup_logging()
    logging.info("START validation")

    try:
        identity_data, expansion_data = run_validation(WORKSPACE_DIR)

        logging.info("Validation passed")
        logging.info(
            "Loaded input package successfully | companies=%s",
            len(expansion_data["companies"]),
        )

        prepare_output_dirs()

        user_row = build_user_row(identity_data)
        company_rows = build_company_rows(identity_data, expansion_data)

        write_users_csv(USERS_OUTPUT_CSV, user_row)
        write_companies_csv(COMPANIES_OUTPUT_CSV, company_rows)

        copy_assets_to_output(
            WORKSPACE_DIR,
            identity_data,
            AVATAR_OUTPUT_DIR,
            BANNER_OUTPUT_DIR,
            LOGO_OUTPUT_DIR,
        )

        logging.info("Output package written successfully")
        logging.info("users.csv path: %s", USERS_OUTPUT_CSV)
        logging.info("companies.csv path: %s", COMPANIES_OUTPUT_CSV)
        logging.info("avatar dir: %s", AVATAR_OUTPUT_DIR)
        logging.info("banner dir: %s", BANNER_OUTPUT_DIR)
        logging.info("logo dir: %s", LOGO_OUTPUT_DIR)

        print("Validation passed")
        print("Output package created successfully")
        return 0

    except ValidationError as error:
        logging.error("Validation failed: %s", error)
        print(str(error))
        return 1

    except Exception:
        logging.error("Unexpected error during generation")
        logging.error(traceback.format_exc())
        print("Unexpected error during generation")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())