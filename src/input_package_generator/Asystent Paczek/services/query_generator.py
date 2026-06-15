from pathlib import Path

from services.prompt_generator import load_identity_profile


def build_ceo_query(identity_profile: dict) -> str:
    person_name = identity_profile.get("reference_person_name", "").strip()
    company_name = identity_profile.get("reference_company_name", "").strip()
    return f"{person_name} {company_name}".strip()


def build_logo_query(identity_profile: dict) -> str:
    company_name = identity_profile.get("reference_company_name", "").strip()
    return f"{company_name} logo".strip()


def build_banner_query(identity_profile: dict) -> str:
    company_name = identity_profile.get("reference_company_name", "").strip()
    return f"{company_name} banner".strip()


def build_search_queries_text(identity_profile: dict) -> str:
    ceo_query = build_ceo_query(identity_profile)
    logo_query = build_logo_query(identity_profile)
    banner_query = build_banner_query(identity_profile)

    return (
        "[CEO QUERY]\n"
        f"{ceo_query}\n\n"
        "[LOGO QUERY]\n"
        f"{logo_query}\n\n"
        "[BANNER QUERY]\n"
        f"{banner_query}\n"
    )


def generate_search_queries_file(package_dir: Path) -> Path:
    identity_profile_path = package_dir / "identity_profile.json"
    output_path = package_dir / "search_queries.txt"

    identity_profile = load_identity_profile(identity_profile_path)
    content = build_search_queries_text(identity_profile)

    output_path.write_text(content, encoding="utf-8")
    return output_path