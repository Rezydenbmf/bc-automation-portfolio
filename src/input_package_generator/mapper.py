import re
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_EMAIL_LEGAL: frozenset[str] = frozenset({
    "ag", "sa", "ltd", "gmbh", "corp", "inc", "llc", "plc",
    "nv", "bv", "co", "kg", "ab", "se",
})
_EMAIL_FILLER: frozenset[str] = frozenset({
    "group", "holdings", "international", "corporation", "company",
    "systems", "limited", "financial", "services", "retail", "stiftung",
    "motor", "motors",
})


def build_email_from_brand(base_brand_name: str) -> str:
    tokens = base_brand_name.split()
    kept = []
    for tok in tokens:
        clean = re.sub(r"[^a-z0-9]", "", tok.lower())
        if clean and clean not in _EMAIL_LEGAL and clean not in _EMAIL_FILLER:
            kept.append(clean)

    slug = "".join(kept)

    if not slug:
        fallback = re.sub(r"[^a-z0-9]", "", tokens[0].lower()) if tokens else ""
        slug = fallback or "info"

    email = f"info@{slug}.com"
    print(f"[email-gen] {email}", flush=True)
    return email


def build_user_row(identity_data: dict) -> dict:
    identity = identity_data["identity"]
    brand = identity_data["brand"]
    assets = identity_data["assets"]

    email = build_email_from_brand(brand["base_brand_name"])

    return {
        "first_name": identity["first_name"],
        "last_name": identity["last_name"],
        "email": email,
        "password": identity["password"],
        "bio": identity["bio"],
        "country": identity["country"],
        "city": identity["city"],
        "image_path": assets["avatar_filename"],
    }


def build_company_rows(identity_data: dict, expansion_data: dict) -> list[dict]:
    identity = identity_data["identity"]
    brand = identity_data["brand"]
    assets = identity_data["assets"]
    companies = expansion_data["companies"]

    email = build_email_from_brand(brand["base_brand_name"])

    rows = []

    for company in companies:
        rows.append(
            {
                "email": email,
                "password": identity["password"],
                "company_name": company["company_name"],
                "country": company["country"],
                "city": company["city"],
                "street": company["street"],
                "apartment_number": company["apartment_number"],
                "company_description": brand["company_description"],
                "logo_path": assets["logo_filename"],
                "banner_path": assets["banner_filename"],
                "main_category": company["main_category"],
                "subcategory": company["subcategory"],
                "latitude": company["latitude"],
                "longitude": company["longitude"],
            }
        )

    return rows
