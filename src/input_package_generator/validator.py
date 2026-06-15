from pathlib import Path
import csv
import json
import logging

from exceptions import ValidationError


IDENTITY_FILE_NAME = "identity_profile.json"
EXPANSION_FILE_NAME = "expansion_request.json"
SUPPORTED_SCHEMA_VERSION = "1.0"
CATEGORIES_FILE_NAME = "categories_eng.csv"


IDENTITY_REQUIRED_FIELDS = {
    "reference_context": [
        "reference_company_name",
        "reference_person_name",
        "reference_person_role",
        "reference_person_image",
        "reference_logo_source",
    ],
    "identity": [
        "first_name",
        "last_name",
        "bio",
        "country",
        "city",
        "password",
    ],
    "brand": [
        "base_brand_name",
        "company_description",
    ],
    "assets": [
        "avatar_filename",
        "avatar_generation_brief",
        "logo_filename",
        "logo_generation_brief",
        "banner_filename",
        "banner_generation_brief",
    ],
}


EXPANSION_REQUIRED_FIELDS = {
    "generation_rules": [
        "target_company_count",
        "maximize_country_diversity",
        "maximize_city_diversity",
        "use_realistic_business_addresses",
        "use_realistic_coordinates",
        "auto_select_categories",
    ],
    "company_record": [
        "company_name",
        "country",
        "city",
        "street",
        "apartment_number",
        "latitude",
        "longitude",
        "main_category",
        "subcategory",
    ],
}


def validate_required_files(base_dir: Path) -> tuple[Path, Path]:
    identity_path = base_dir / IDENTITY_FILE_NAME
    expansion_path = base_dir / EXPANSION_FILE_NAME

    if not identity_path.exists():
        raise ValidationError(f"Missing required file: {IDENTITY_FILE_NAME}")

    if not expansion_path.exists():
        raise ValidationError(f"Missing required file: {EXPANSION_FILE_NAME}")

    return identity_path, expansion_path


def load_json_file(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as file:
            return json.load(file)
    except json.JSONDecodeError:
        raise ValidationError(f"Invalid JSON format in {path.name}")


def validate_schema_version(data: dict, file_name: str) -> None:
    if data.get("schema_version") != SUPPORTED_SCHEMA_VERSION:
        raise ValidationError(f"Unsupported schema_version in {file_name}")


def validate_identity_structure(identity_data: dict) -> None:
    required_sections = [
        "reference_context",
        "identity",
        "brand",
        "assets",
    ]

    for section_name in required_sections:
        if section_name not in identity_data:
            raise ValidationError(f"Missing required section: {section_name}")

        if not isinstance(identity_data[section_name], dict):
            raise ValidationError(f"Section must be an object: {section_name}")


def validate_expansion_structure(expansion_data: dict) -> None:
    required_sections = [
        "generation_rules",
        "companies",
    ]

    for section_name in required_sections:
        if section_name not in expansion_data:
            raise ValidationError(f"Missing required section: {section_name}")

    if not isinstance(expansion_data["generation_rules"], dict):
        raise ValidationError("Section must be an object: generation_rules")

    if not isinstance(expansion_data["companies"], list):
        raise ValidationError("Field must be a list: companies")

    if not expansion_data["companies"]:
        raise ValidationError("Companies list must not be empty")


def is_blank_text(value: object) -> bool:
    return isinstance(value, str) and value.strip() == ""


def validate_required_value(value: object, field_path: str) -> None:
    if value is None:
        raise ValidationError(f"Missing required field: {field_path}")

    if is_blank_text(value):
        raise ValidationError(f"Missing required field: {field_path}")


def validate_identity_required_fields(identity_data: dict) -> None:
    for section_name, field_names in IDENTITY_REQUIRED_FIELDS.items():
        section_data = identity_data[section_name]

        for field_name in field_names:
            if field_name not in section_data:
                raise ValidationError(
                    f"Missing required field: {section_name}.{field_name}"
                )

            validate_required_value(
                section_data[field_name],
                f"{section_name}.{field_name}",
            )


def validate_expansion_required_fields(expansion_data: dict) -> None:
    generation_rules = expansion_data["generation_rules"]
    companies = expansion_data["companies"]

    for field_name in EXPANSION_REQUIRED_FIELDS["generation_rules"]:
        if field_name not in generation_rules:
            raise ValidationError(
                f"Missing required field: generation_rules.{field_name}"
            )

        validate_required_value(
            generation_rules[field_name],
            f"generation_rules.{field_name}",
        )

    for index, company in enumerate(companies):
        if not isinstance(company, dict):
            raise ValidationError(f"Company record must be an object: companies[{index}]")

        for field_name in EXPANSION_REQUIRED_FIELDS["company_record"]:
            if field_name not in company:
                raise ValidationError(
                    f"Missing required field: companies[{index}].{field_name}"
                )

            validate_required_value(
                company[field_name],
                f"companies[{index}].{field_name}",
            )


def validate_asset_filenames(identity_data: dict) -> None:
    assets = identity_data["assets"]
    asset_field_names = [
        "avatar_filename",
        "logo_filename",
        "banner_filename",
    ]

    for field_name in asset_field_names:
        value = assets[field_name]

        if "/" in value or "\\" in value:
            raise ValidationError(
                f"Asset filename must not contain path separators: assets.{field_name}"
            )


def validate_coordinates_numeric(companies: list[dict]) -> None:
    for index, company in enumerate(companies):
        latitude = company["latitude"]
        longitude = company["longitude"]

        if not isinstance(latitude, (int, float)):
            raise ValidationError(f"Field must be numeric: companies[{index}].latitude")

        if not isinstance(longitude, (int, float)):
            raise ValidationError(f"Field must be numeric: companies[{index}].longitude")


def validate_target_company_count(expansion_data: dict) -> None:
    target_company_count = expansion_data["generation_rules"]["target_company_count"]
    companies = expansion_data["companies"]

    if target_company_count != len(companies):
        raise ValidationError("target_company_count does not match companies count")


def load_category_catalog(categories_path: Path) -> tuple[set[str], dict[str, set[str]]]:
    if not categories_path.exists():
        raise ValidationError(f"Missing categories dictionary file: {categories_path.name}")

    with categories_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        rows = list(reader)

    id_to_name: dict[str, str] = {}
    main_categories: set[str] = set()

    for row in rows:
        category_id = str(row["Id"]).strip()
        english_name = str(row["EnglishName"]).strip()
        parent_id = str(row["ParentId"]).strip()

        id_to_name[category_id] = english_name

        if parent_id == "NULL":
            main_categories.add(english_name)

    subcategories_by_main: dict[str, set[str]] = {}

    for row in rows:
        english_name = str(row["EnglishName"]).strip()
        parent_id = str(row["ParentId"]).strip()

        if parent_id == "NULL":
            continue

        parent_name = id_to_name.get(parent_id)
        if not parent_name:
            continue

        subcategories_by_main.setdefault(parent_name, set()).add(english_name)

    return main_categories, subcategories_by_main


def validate_company_categories(companies: list[dict], categories_path: Path) -> None:
    main_categories, subcategories_by_main = load_category_catalog(categories_path)

    for index, company in enumerate(companies):
        company_name = company["company_name"].strip()
        main_category = company["main_category"].strip()
        subcategory = company["subcategory"].strip()

        if main_category not in main_categories:
            logging.warning(
                "Invalid company category: companies[%d] '%s' | main_category='%s' | subcategory='%s' | "
                "reason=main_category not found as top-level category in categories_eng.csv",
                index, company_name, main_category, subcategory,
            )
            continue

        allowed_subcategories = subcategories_by_main.get(main_category, set())

        if subcategory not in allowed_subcategories:
            logging.warning(
                "Invalid company category: companies[%d] '%s' | main_category='%s' | subcategory='%s' | "
                "reason=subcategory not found under selected main_category in categories_eng.csv",
                index, company_name, main_category, subcategory,
            )


def find_base_company(companies: list[dict], base_brand_name: str) -> dict:
    for company in companies:
        if company["company_name"] == base_brand_name:
            return company

    logging.warning(
        "Base company matching base_brand_name %r not found — falling back to first company in list",
        base_brand_name,
    )
    return companies[0]


def validate_base_company_location(base_company: dict, identity_data: dict) -> None:
    identity = identity_data["identity"]

    if (
        base_company["country"] != identity["country"]
        or base_company["city"] != identity["city"]
    ):
        raise ValidationError(
            "Base company location does not match identity.country and identity.city"
        )


_COUNTRY_LABEL_MAP = {
    "United States of America": "USA",
    "United Kingdom":           "UK",
    "South Africa":             "RSA",
    "United Arab Emirates":     "UAE",
    "New Zealand":              "NZ",
}

_LEGAL_SUFFIXES = {
    "AB", "AG", "Inc", "Inc.", "Ltd", "Ltd.", "GmbH", "Corp", "Corp.",
    "SA", "NV", "BV", "PLC", "SE", "LLC", "LP", "LLP", "Co", "Co.",
    "Corporation", "Limited", "Incorporated",
}

_ABBREVIATED_SKIP_WORDS = {"Hennes", "Mauritz"}


_ACCENT_MAP = str.maketrans("éóãâêíúç", "eoaaeiuc")


def _deaccent(s: str) -> str:
    return s.translate(_ACCENT_MAP)


def _extract_brand_keywords(base_brand_name: str) -> list[str]:
    """Return all valid brand keywords for base_brand_name.

    Always returns the primary keyword first. If the name contains a dash
    (– or -) the word immediately after it is added as a second keyword
    (e.g. "Petróleo Brasileiro S.A. – Petrobras" → ["Petroleo", "Petrobras"]).
    """
    # Split on em-dash or plain dash to detect alias after dash
    import re as _re
    dash_parts = _re.split(r"\s*[–-]\s*", base_brand_name, maxsplit=1)
    alias_keyword: str | None = None
    if len(dash_parts) == 2:
        alias_word = dash_parts[1].split()[0].strip() if dash_parts[1].split() else None
        if alias_word and len(alias_word) >= 3:
            alias_keyword = alias_word

    tokens = base_brand_name.split()

    # Strip trailing legal suffixes
    while tokens and tokens[-1] in _LEGAL_SUFFIXES:
        tokens.pop()

    if not tokens:
        primary = base_brand_name.split()[0]
    else:
        first_meaningful = next((t for t in tokens if t != "&"), None)
        if first_meaningful is None:
            primary = base_brand_name.split()[0]
        elif len(first_meaningful) <= 2:
            # Build abbreviated prefix from leading short tokens
            prefix_tokens: list[str] = []
            for t in tokens:
                if t == "&":
                    if prefix_tokens:
                        prefix_tokens.append(t)
                elif t in _ABBREVIATED_SKIP_WORDS:
                    continue
                elif len(t) <= 2:
                    prefix_tokens.append(t)
                else:
                    break
            while prefix_tokens and prefix_tokens[-1] == "&":
                prefix_tokens.pop()
            primary = "".join(prefix_tokens) if prefix_tokens else first_meaningful
        else:
            primary = first_meaningful

    keywords = [primary]
    if alias_keyword and alias_keyword != primary:
        keywords.append(alias_keyword)
    return keywords


def _normalize(s: str) -> str:
    """Lowercase, deaccent, and collapse whitespace for loose comparison."""
    return " ".join(_deaccent(s).lower().split())


def validate_non_base_company_naming(
    companies: list[dict],
    base_brand_name: str,
) -> None:
    brand_keywords = _extract_brand_keywords(base_brand_name)
    logging.debug(
        "[validate_non_base_company_naming] brand_keywords=%r (from base_brand_name=%r)",
        brand_keywords, base_brand_name,
    )
    print(f"[DEBUG] brand_keywords={brand_keywords!r}  (base_brand_name={base_brand_name!r})")

    for index, company in enumerate(companies):
        if index == 0:
            continue

        company_name = company["company_name"]
        logging.debug("[validate_non_base_company_naming] companies[%d].company_name=%r", index, company_name)

        country = company["country"]
        country_label = _COUNTRY_LABEL_MAP.get(country, country)

        norm_company = _normalize(company_name.replace("&", " & "))
        print(f"[DEBUG] companies[{index}] company_name={company_name!r}  norm_company={norm_company!r}")

        match = False
        for kw in brand_keywords:
            norm_kw = _normalize(kw)
            print(f"[DEBUG]   comparing norm_company={norm_company!r} against norm_kw={norm_kw!r}  (kw={kw!r}, single_word={len(kw.split()) == 1 and len(kw) >= 3})")
            if len(kw.split()) == 1 and len(kw) >= 3:
                if norm_company.startswith(norm_kw):
                    match = True
                    break
            else:
                expected_name = f"{kw} {country_label}"
                norm_expected = _normalize(expected_name.replace("&", " & "))
                print(f"[DEBUG]   multi-word: norm_expected={norm_expected!r}")
                if norm_company == norm_expected:
                    match = True
                    break

        if not match:
            raise ValidationError(
                "Company name does not match required pattern for non-base company: "
                f"companies[{index}].company_name"
            )


def run_validation(base_dir: Path) -> tuple[dict, dict]:
    identity_path, expansion_path = validate_required_files(base_dir)

    identity_data = load_json_file(identity_path)
    expansion_data = load_json_file(expansion_path)

    validate_schema_version(identity_data, IDENTITY_FILE_NAME)
    validate_schema_version(expansion_data, EXPANSION_FILE_NAME)

    validate_identity_structure(identity_data)
    validate_expansion_structure(expansion_data)

    validate_identity_required_fields(identity_data)
    validate_expansion_required_fields(expansion_data)

    validate_asset_filenames(identity_data)
    validate_coordinates_numeric(expansion_data["companies"])
    validate_target_company_count(expansion_data)

    base_brand_name = identity_data["brand"]["base_brand_name"]
    base_company = find_base_company(expansion_data["companies"], base_brand_name)

    validate_base_company_location(base_company, identity_data)
    validate_non_base_company_naming(expansion_data["companies"], base_brand_name)

    return identity_data, expansion_data
