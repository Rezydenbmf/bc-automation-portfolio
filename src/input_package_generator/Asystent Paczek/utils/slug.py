import re
import unicodedata


def slugify_company_name(company_name: str) -> str:
    normalized = unicodedata.normalize("NFKD", company_name)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower().strip()
    ascii_text = re.sub(r"[^a-z0-9]+", "_", ascii_text)
    ascii_text = re.sub(r"_+", "_", ascii_text).strip("_")
    return ascii_text


def build_package_folder_name(index: int, company_name: str) -> str:
    slug = slugify_company_name(company_name)
    return f"{index:03d}_{slug}"