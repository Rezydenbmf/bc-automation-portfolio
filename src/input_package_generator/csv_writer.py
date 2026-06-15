import csv
from pathlib import Path


USERS_HEADER = [
    "first_name",
    "last_name",
    "email",
    "password",
    "bio",
    "country",
    "city",
    "image_path",
]

COMPANIES_HEADER = [
    "email",
    "password",
    "company_name",
    "country",
    "city",
    "street",
    "apartment_number",
    "company_description",
    "logo_path",
    "banner_path",
    "main_category",
    "subcategory",
    "latitude",
    "longitude",
]


def write_users_csv(output_path: Path, user_row: dict) -> None:
    with output_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=USERS_HEADER)
        writer.writeheader()
        writer.writerow(user_row)


def write_companies_csv(output_path: Path, company_rows: list[dict]) -> None:
    with output_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=COMPANIES_HEADER)
        writer.writeheader()
        writer.writerows(company_rows)
