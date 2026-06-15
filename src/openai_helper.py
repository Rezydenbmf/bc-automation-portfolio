# openai_helper.py
# Real OpenAI API integration for BC Automation.
#
# Required packages:
#   pip install openai python-dotenv requests Pillow

import base64
import csv
import json
import os
import re
from io import BytesIO
from pathlib import Path
from dotenv import load_dotenv
import openai
import requests

# ─────────────────────────────────────────────────────────────────────────────
# ENV + CLIENT
# ─────────────────────────────────────────────────────────────────────────────

_HERE = Path(__file__).resolve().parent

load_dotenv(dotenv_path=_HERE / ".env", override=True)
client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ─────────────────────────────────────────────────────────────────────────────
# RULES / CATEGORIES — loaded once at module import
# ─────────────────────────────────────────────────────────────────────────────

def _read_first_existing(label: str, paths: tuple[Path, ...]) -> str:
    for candidate in paths:
        if candidate.exists():
            return candidate.read_text(encoding="utf-8").strip()
    searched = ", ".join(str(path.relative_to(_HERE)) for path in paths)
    print(f"[openai_helper] WARNING: {label} source not found in: {searched}")
    return ""


def _read_rules(label: str, paths: tuple[Path, ...]) -> str:
    return _read_first_existing(label, paths)


def _strip_legacy_contract_fields(text: str) -> str:
    lines = []
    for line in text.splitlines():
        if '"company_prefix"' in line or '"postal_code"' in line:
            continue
        if "`company_prefix`" in line or "`postal_code`" in line:
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _read_categories(max_rows: int = 80) -> str:
    """Return top-level category names (ParentId is NULL/empty), one per line."""
    for candidate in (
        _HERE / "Data" / "csv" / "categories_eng.csv",
        _HERE / "categories_eng.csv",
    ):
        if candidate.exists():
            names = []
            with candidate.open(encoding="utf-8", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    parent = (row.get("ParentId") or "").strip()
                    if parent in ("", "NULL"):
                        name = (row.get("EnglishName") or "").strip()
                        if name:
                            names.append(name)
                        if len(names) >= max_rows:
                            break
            return "\n".join(names)
    print("[openai_helper] WARNING: categories_eng.csv not found")
    return ""


def _load_all_categories() -> list:
    """Load every row from categories_eng.csv as a list of dicts (Id, EnglishName, ParentId)."""
    for candidate in (
        _HERE / "Data" / "csv" / "categories_eng.csv",
        _HERE / "categories_eng.csv",
    ):
        if candidate.exists():
            with candidate.open(encoding="utf-8", newline="") as f:
                return list(csv.DictReader(f))
    print("[openai_helper] WARNING: categories_eng.csv not found")
    return []


_CONTRACT_DOC = _read_rules(
    "input package generator contract",
    (_HERE / "docs" / "04_input_package_generator_contract.md",),
)
_IDENTITY_TEMPLATE = _read_rules(
    "identity profile template",
    (_HERE / "input_package_generator" / "templates" / "identity_profile.template.json",),
)
_EXPANSION_TEMPLATE = _read_rules(
    "expansion request template",
    (_HERE / "input_package_generator" / "templates" / "expansion_request.template.json",),
)
_IDENTITY_RULES = _strip_legacy_contract_fields(
    "\n\n".join(part for part in (_CONTRACT_DOC, _IDENTITY_TEMPLATE) if part)
)
_EXPANSION_RULES = _strip_legacy_contract_fields(
    "\n\n".join(part for part in (_CONTRACT_DOC, _EXPANSION_TEMPLATE) if part)
)
_CATEGORIES       = _read_categories(max_rows=80)

_IDENTITY_OUTPUT_SCHEMA = """
Return exactly one JSON object with this active identity_profile.json schema:
{
  "schema_version": "1.0",
  "reference_context": {
    "reference_company_name": "string",
    "reference_person_name": "string",
    "reference_person_role": "string",
    "reference_person_image": "string",
    "reference_logo_source": "string"
  },
  "identity": {
    "first_name": "string",
    "last_name": "string",
    "bio": "string",
    "country": "string",
    "city": "string",
    "password": "replace_me"
  },
  "brand": {
    "base_brand_name": "string",
    "company_description": "string"
  },
  "assets": {
    "avatar_filename": "identity_001_avatar.png",
    "avatar_generation_brief": "string",
    "logo_filename": "identity_001_logo.png",
    "logo_generation_brief": "string",
    "banner_filename": "identity_001_banner.png",
    "banner_generation_brief": "string"
  }
}
Do not add company_prefix, postal_code, companies, fullLegalName, topExecutive, or any wrapper object.
""".strip()


# ─────────────────────────────────────────────────────────────────────────────
# JSON PARSING HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict:
    text = text.strip()
    # Strip ```json ... ``` or ``` ... ```
    clean = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean).strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Could not parse model response as JSON: {exc}\nRaw:\n{text[:500]}"
        ) from exc


_COMPANY_SUFFIX_TOKENS = {
    "inc", "incorporated", "corp", "corporation", "company", "co", "ltd",
    "limited", "llc", "plc", "gmbh", "ag", "sa", "se", "nv", "bv", "lp",
    "llp", "holdings", "holding", "group",
}


def _company_tokens(name: str) -> list[str]:
    camel_split = re.sub(r"([a-z])([A-Z])", r"\1 \2", name or "")
    tokens = re.findall(r"[a-z0-9]+", camel_split.lower())
    while tokens and tokens[-1] in _COMPANY_SUFFIX_TOKENS:
        tokens.pop()
    return tokens


def is_strong_company_match(requested_name: str, candidate_name: str) -> bool:
    requested_tokens = _company_tokens(requested_name)
    candidate_tokens = _company_tokens(candidate_name)
    if not requested_tokens or not candidate_tokens:
        return False

    if requested_tokens == candidate_tokens:
        return True

    requested_compact = "".join(requested_tokens)
    candidate_compact = "".join(candidate_tokens)
    if requested_compact == candidate_compact:
        return True

    if len(requested_tokens) >= 2:
        return candidate_tokens[: len(requested_tokens)] == requested_tokens

    return False


def _identity_missing_fields(data: dict) -> list[str]:
    if not isinstance(data, dict):
        return ["<root object>"]
    if data.get("schema_version") != "1.0":
        return ["schema_version"]

    required = {
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

    missing = []
    for section, fields in required.items():
        section_data = data.get(section)
        if not isinstance(section_data, dict):
            missing.append(section)
            continue
        for field in fields:
            value = section_data.get(field)
            if value is None or (isinstance(value, str) and not value.strip()):
                missing.append(f"{section}.{field}")
    return missing


def _fill_reference_company_name_if_only_missing(data: dict, selected_company_name: str) -> list[str]:
    missing = _identity_missing_fields(data)
    if missing == ["reference_context.reference_company_name"] and selected_company_name:
        data.setdefault("reference_context", {})["reference_company_name"] = selected_company_name
        return _identity_missing_fields(data)
    return missing


def _validate_identity_profile_shape(data: dict, requested_name: str = "") -> None:
    if not isinstance(data, dict):
        raise ValueError("identity response must be a JSON object")
    if "companies" in data:
        raise ValueError("identity response must not use wrapper key: companies")
    forbidden_keys = {"fullLegalName", "topExecutive"}
    stack = [data]
    while stack:
        current = stack.pop()
        if isinstance(current, dict):
            overlap = forbidden_keys.intersection(current)
            if overlap:
                raise ValueError(f"identity response uses legacy field name: {sorted(overlap)[0]}")
            stack.extend(current.values())
        elif isinstance(current, list):
            stack.extend(current)
    missing = _identity_missing_fields(data)
    if missing:
        raise ValueError("identity response missing required fields: " + ", ".join(missing))

    if requested_name:
        brand_name = data["brand"]["base_brand_name"]
        reference_name = data["reference_context"]["reference_company_name"]
        if not (
            is_strong_company_match(requested_name, brand_name)
            or is_strong_company_match(requested_name, reference_name)
        ):
            raise ValueError(
                "identity response company does not match requested company: "
                f"requested={requested_name!r}, brand={brand_name!r}, reference={reference_name!r}"
            )


def _research_company(company_name: str) -> str:
    """Fetch real company data using OpenAI web search tool."""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini-search-preview",
            web_search_options={},
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Look up the company '{company_name}' and provide the following facts:\n"
                        f"1. Full legal company name\n"
                        f"2. Top executive name — search in this exact order and stop at the first result found:\n"
                        f"   a) Search for CEO of the company\n"
                        f"   b) Search for President of the company\n"
                        f"   c) Search for Founder of the company\n"
                        f"   d) Search for Chairman of the company\n"
                        f"   e) Search for Managing Director of the company\n"
                        f"   f) Search for any Board Member of the company\n"
                        f"   If none of the above is found after thorough search, generate a realistic and credible "
                        f"full name appropriate for a senior executive of a company in that country and industry. "
                        f"The name must sound professional and culturally appropriate for the company's headquarters country. "
                        f"Append the suffix '(generated)' to any name that was not found and was generated instead.\n"
                        f"3. Headquarters city and country\n"
                        f"4. Main products or services\n"
                        f"5. Company description (detailed, around 800-1000 characters, covering: what the company does, its key products or services, global presence, mission or values, and market position)\n"
                        f"Be factual and concise. If unsure about any field, say so."
                    ),
                }
            ],
        )
        result = (response.choices[0].message.content or "").strip()
        print(f"[_research_company] Result preview: {result[:300]}")
        return result
    except Exception as e:
        print(f"[_research_company] Warning: could not fetch data for '{company_name}': {e}")
        return ""


def search_company_candidates(company_name: str) -> list[dict]:
    """Search for real companies matching the given name using OpenAI web search."""
    print(f"[search_company_candidates] Starting search for: '{company_name}'")
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini-search-preview",
            web_search_options={},
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Find 3 to 5 real companies whose legal name or primary brand name exactly matches '{company_name}'. "
                        f"Do not return competitors, parent companies, customers, partners, or loosely related companies. "
                        f"For each company return: name, country, city, industry, and the top executive name in the 'ceo' field.\n"
                        f"For the 'ceo' field, search in this exact order and stop at the first result found:\n"
                        f"  1. Search for CEO of the company\n"
                        f"  2. Search for President of the company\n"
                        f"  3. Search for Founder of the company\n"
                        f"  4. Search for Chairman of the company\n"
                        f"  5. Search for Managing Director of the company\n"
                        f"  6. Search for any Board Member of the company\n"
                        f"If none of the above is found after thorough search, generate a realistic and credible "
                        f"full name appropriate for a senior executive of a company in that country and industry. "
                        f"The name must sound professional and culturally appropriate for the company's headquarters country. "
                        f"Append the suffix '(generated)' to any name that was not found and was generated instead.\n"
                        f"Return ONLY a JSON array with keys: name, country, city, ceo, industry. No markdown, no commentary."
                    ),
                }
            ],
            max_tokens=800,
            timeout=30,
        )
        raw = (response.choices[0].message.content or "").strip()
        clean = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
        clean = re.sub(r"\s*```$", "", clean).strip()
        result = json.loads(clean)
        if not isinstance(result, list):
            raise ValueError(f"Expected JSON array, got: {type(result)}")
        candidates = [
            {
                "name":     item.get("name", ""),
                "country":  item.get("country", ""),
                "city":     item.get("city", ""),
                "ceo":      item.get("ceo", ""),
                "industry": item.get("industry", ""),
            }
            for item in result
            if isinstance(item, dict)
        ]
        print(f"[search_company_candidates] Done — {len(candidates)} candidates found for: '{company_name}'")
        candidates = [
            item for item in candidates
            if is_strong_company_match(company_name, item.get("name", ""))
        ]
        return candidates
    except Exception as e:
        print(f"[search_company_candidates] Warning: search failed for '{company_name}': {e}")
        return []


# ─────────────────────────────────────────────────────────────────────────────
# FUNCTION 1 — generate_identity  (real API)
# ─────────────────────────────────────────────────────────────────────────────

def generate_identity(description: str, company_count: int, locations_count: int) -> dict:
    """
    Generate identity_profile.json via GPT-4o-mini.

    # Input: plain company name, e.g. "Microsoft" or "Nike, Inc."
    Returns parsed dict on success, or {"error": ..., "raw": ...} on failure.
    """
    research = _research_company(description)
    requested_name = description.split(",", 1)[0].strip()
    if research:
        grounding = (
            f"Real company data from web research (use this to fill in accurate fields):\n"
            f"{research}"
        )
    else:
        grounding = "No web research data available. Use your best knowledge of this company."

    user_prompt = (
        f"Generate identity_profile.json for the following request:\n"
        f"Description: {description}\n"
        f"Selected company name: {requested_name}\n"
        f"Number of companies: {company_count}\n"
        f"Locations per company: {locations_count}\n"
        f"\n{grounding}\n"
        f"\n{_IDENTITY_OUTPUT_SCHEMA}\n"
        f"\nreference_context.reference_company_name must be exactly the selected company name or its full legal name.\n"
        f"reference_context.reference_person_name, reference_person_role, reference_person_image, and reference_logo_source are mandatory.\n"
        f"Do not return wrapper objects such as {{\"companies\": [...]}}.\n"
        f"Do not use alternate field names such as fullLegalName or topExecutive.\n"
        f"Output must be only valid JSON. No markdown. No commentary."
    )
    response_text = ""
    last_error = ""
    missing_fields: list[str] = []
    for attempt in range(2):
        try:
            prompt = user_prompt
            if attempt:
                prompt += (
                    "\n\nPrevious response was rejected. Return one complete valid JSON object only, "
                    "using exactly the required identity_profile.json structure."
                )
                if missing_fields:
                    prompt += "\nMissing or invalid fields to fix: " + ", ".join(missing_fields)
                    prompt += (
                        "\nThe reference_context object must include all of: "
                        "reference_company_name, reference_person_name, reference_person_role, "
                        "reference_person_image, reference_logo_source."
                    )
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": _IDENTITY_RULES},
                    {"role": "user",   "content": prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=4000,
                temperature=0,
            )
            response_text = response.choices[0].message.content or ""
            parsed = _parse_json(response_text)
            missing_fields = _fill_reference_company_name_if_only_missing(parsed, requested_name)
            if missing_fields:
                raise ValueError(
                    "identity response missing required fields: " + ", ".join(missing_fields)
                )
            _validate_identity_profile_shape(parsed, requested_name=requested_name)
            return parsed
        except Exception as e:
            last_error = str(e)
            match = re.search(r"missing required fields: (.+)", last_error)
            if match:
                missing_fields = [field.strip() for field in match.group(1).split(",") if field.strip()]
            if attempt == 0:
                continue
            return {"error": last_error, "raw": response_text}


# ─────────────────────────────────────────────────────────────────────────────
# CATEGORY SELECTION — two-step GPT selection from real CSV data
# TODO: Replace with embeddings/vector search (Option 3) in future
# ─────────────────────────────────────────────────────────────────────────────

def select_categories_via_gpt(description: str, industry_div: bool = False) -> list:
    """
    Two-step category selection using categories_eng.csv.

    Step 1: Ask GPT to pick a main category (top-level, ParentId NULL) by exact name.
    Step 2: Ask GPT to pick a subcategory from that parent's children by exact name.

    If industry_div=False: returns [(main_category_name, subcategory_name)].
    If industry_div=True:  returns a list of (main, sub) pairs — primary pair first,
                           then pairs for 2 alternative main categories so the caller
                           can rotate across companies.
    Falls back to first item on the list if GPT returns an unknown name.
    """
    all_rows = _load_all_categories()
    if not all_rows:
        print("[select_categories_via_gpt] WARNING: no categories loaded, returning empty")
        return [("", "")]

    # ── STEP 1: main category ─────────────────────────────────────────────────
    top_level = [
        r for r in all_rows
        if (r.get("ParentId") or "").strip() in ("", "NULL")
    ]
    main_names = [r["EnglishName"].strip() for r in top_level if (r.get("EnglishName") or "").strip()]

    numbered_main = "\n".join(f"{i + 1}. {name}" for i, name in enumerate(main_names))

    step1 = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a business category classifier. "
                    "You will receive a numbered list of categories and a company description. "
                    "Reply with ONLY the exact category name from the list — no number, no explanation, nothing else."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Company description: {description}\n\n"
                    f"Available main categories:\n{numbered_main}\n\n"
                    "Which category best fits this company? Reply with ONLY the exact name."
                ),
            },
        ],
        max_tokens=100,
        temperature=0.1,
    )
    chosen_main_raw = (step1.choices[0].message.content or "").strip()

    chosen_main_row = next(
        (r for r in top_level if r["EnglishName"].strip().lower() == chosen_main_raw.lower()),
        None,
    )
    if chosen_main_row is None:
        print(
            f"[select_categories_via_gpt] WARNING: GPT returned unknown main category "
            f"'{chosen_main_raw}', using first item as fallback"
        )
        chosen_main_row = top_level[0]

    chosen_main_name = chosen_main_row["EnglishName"].strip()
    parent_id = str(chosen_main_row["Id"]).strip()

    # ── DIVERSITY: if industry_div=True, find 2 alternative main categories ───
    if industry_div:
        print("[select_categories_via_gpt] Category diversity ON — rotating categories across companies")
        alt_resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a business category classifier. "
                        "Return only a Python list literal with exactly 2 strings, e.g. ['Cat A', 'Cat B']. "
                        "No explanation, no markdown, nothing else."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Company description: {description}\n"
                        f"Primary category already selected: {chosen_main_name}\n\n"
                        f"Choose 2 other realistic alternative main categories that could fit "
                        f"branch offices of the same brand. Choose only from this list:\n"
                        f"{numbered_main}\n\n"
                        f"Return only a Python list like: ['Category A', 'Category B']"
                    ),
                },
            ],
            max_tokens=100,
            temperature=0.4,
        )
        alt_raw = (alt_resp.choices[0].message.content or "").strip()
        try:
            import ast
            alt_names = ast.literal_eval(alt_raw)
            if not isinstance(alt_names, list):
                raise ValueError("not a list")
        except Exception:
            print(
                f"[select_categories_via_gpt] WARNING: could not parse alternatives '{alt_raw}', "
                f"using primary only"
            )
            alt_names = []

        # Validate alternatives against known main_names; skip unknowns
        valid_alts = [
            name for name in alt_names
            if any(r["EnglishName"].strip().lower() == name.strip().lower() for r in top_level)
        ]

        # Build rotation list: primary first, then alternatives
        rotation_main_names = [chosen_main_name] + valid_alts[:2]
    else:
        rotation_main_names = [chosen_main_name]

    # ── STEP 2: subcategory — one call per entry in rotation_main_names ────────
    pairs = []
    for rot_main_name in rotation_main_names:
        rot_main_row = next(
            (r for r in top_level if r["EnglishName"].strip().lower() == rot_main_name.lower()),
            None,
        )
        if rot_main_row is None:
            pairs.append((rot_main_name, ""))
            continue

        rot_parent_id = str(rot_main_row["Id"]).strip()
        sub_rows = [
            r for r in all_rows
            if str(r.get("ParentId") or "").strip() == rot_parent_id
        ]
        if not sub_rows:
            print(f"[select_categories_via_gpt] WARNING: no subcategories found for '{rot_main_name}'")
            pairs.append((rot_main_name, ""))
            continue

        sub_names = [r["EnglishName"].strip() for r in sub_rows if (r.get("EnglishName") or "").strip()]
        numbered_sub = "\n".join(f"{i + 1}. {name}" for i, name in enumerate(sub_names))

        step2 = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a business category classifier. "
                        "You will receive a numbered list of subcategories and a company description. "
                        "Reply with ONLY the exact subcategory name from the list — no number, no explanation, nothing else."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Company description: {description}\n\n"
                        f"Main category already selected: {rot_main_name}\n\n"
                        f"Available subcategories:\n{numbered_sub}\n\n"
                        "Which subcategory best fits this company? Reply with ONLY the exact name."
                    ),
                },
            ],
            max_tokens=100,
            temperature=0.1,
        )
        chosen_sub_raw = (step2.choices[0].message.content or "").strip()

        chosen_sub_name = next(
            (name for name in sub_names if name.lower() == chosen_sub_raw.lower()),
            None,
        )
        if chosen_sub_name is None:
            print(
                f"[select_categories_via_gpt] WARNING: GPT returned unknown subcategory "
                f"'{chosen_sub_raw}', using first item as fallback"
            )
            chosen_sub_name = sub_names[0]

        pairs.append((rot_main_name, chosen_sub_name))

    return pairs


# ─────────────────────────────────────────────────────────────────────────────
# FUNCTION 2 — generate_expansion  (real API)
# ─────────────────────────────────────────────────────────────────────────────

def generate_expansion(identity: dict, company_count: int, locations_count: int, industry_div: bool = False) -> dict:
    """
    Generate expansion_request.json via GPT-4o-mini.

    Returns parsed dict on success, or {"error": ..., "raw": ...} on failure.
    """
    system_prompt = (
        _EXPANSION_RULES
        + "\n\nAvailable categories:\n"
        + _CATEGORIES
    )
    user_prompt = (
        f"Generate expansion_request.json based on this identity_profile:\n"
        f"{json.dumps(identity, ensure_ascii=False, indent=2)}\n"
        f"target_company_count: {locations_count}\n"
        f"locations_per_company: {locations_count}\n"
        f"Street address rules: "
        f"'street' and 'apartment_number' must always be filled with realistic plausible values "
        f"for the city — never leave them empty.\n"
        f"Output must be only valid JSON. No markdown. No commentary."
    )
    response_text = ""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=4000,
            temperature=0.2,
        )
        response_text = response.choices[0].message.content or ""
        result = _parse_json(response_text)
        # Override categories with verified two-step selection from categories_eng.csv
        description = identity.get("brand", {}).get("company_description", "")
        if description:
            pairs = select_categories_via_gpt(description, industry_div=industry_div)
            companies = result.get("companies", [])
            for idx, company in enumerate(companies):
                main_cat, sub_cat = pairs[idx % len(pairs)]
                if main_cat:
                    company["main_category"] = main_cat
                if sub_cat:
                    company["subcategory"] = sub_cat
        return result
    except Exception as e:
        return {"error": str(e), "raw": response_text}


# ─────────────────────────────────────────────────────────────────────────────
# FUNCTION 3 helpers — reference URLs + image download
# ─────────────────────────────────────────────────────────────────────────────

def find_reference_urls(identity: dict) -> dict:
    """
    Ask gpt-4o-mini for public CEO photo and logo URLs for the company.
    Returns {"ceo_photo_url": ..., "logo_url": ...} or both None on failure.
    """
    brand    = identity.get("brand", {})
    ident    = identity.get("identity", {})
    ref_ctx  = identity.get("reference_context", {})
    company  = brand.get("base_brand_name", "")
    person   = f"{ident.get('first_name', '')} {ident.get('last_name', '')}".strip()
    role     = ref_ctx.get("reference_person_role", "")

    user_prompt = (
        f"Find public image URLs for this company:\n"
        f"Company: {company}\n"
        f"Person: {person}\n"
        f"Role: {role}\n\n"
        f"Return JSON with exactly these fields:\n"
        f"{{\n"
        f'  "ceo_photo_url": "direct URL to a public photo of this person",\n'
        f'  "logo_url": "direct URL to the company logo image"\n'
        f"}}\n"
        f"Use only real, publicly accessible URLs. Prefer Wikipedia, official company "
        f"sites, LinkedIn public profiles, or news sources."
    )
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a research assistant. Return only valid JSON, no markdown."},
                {"role": "user",   "content": user_prompt},
            ],
            max_tokens=300,
            temperature=0.1,
        )
        raw = response.choices[0].message.content or ""
        return _parse_json(raw)
    except Exception as e:
        print(f"[find_reference_urls] WARNING: {e}")
        return {"ceo_photo_url": None, "logo_url": None}


def _download_image_as_bytes(url: str):
    """Download image from URL. Returns bytes on success, None on any error."""
    if not url:
        return None
    try:
        r = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        if r.status_code == 200:
            return r.content
        print(f"[_download_image_as_bytes] WARNING: status {r.status_code} for {url}")
        return None
    except Exception as e:
        print(f"[_download_image_as_bytes] WARNING: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# FUNCTION 3 — generate_images  (gpt-image-1 with image inputs)
# ─────────────────────────────────────────────────────────────────────────────

def generate_images(identity: dict, output_folder: Path) -> dict:
    """
    Generate avatar, logo, and banner using gpt-image-1.
    Uses reference images (CEO photo, company logo) when available via images.edit,
    falls back to images.generate when no reference image can be downloaded.
    Falls back entirely to generate_images_mock if org is not verified for gpt-image-1.
    """
    output_folder = Path(output_folder)
    output_folder.mkdir(parents=True, exist_ok=True)

    assets = identity.get("assets", {})

    # ── reference image lookup ────────────────────────────────────────────────
    print("Searching for reference images...")
    urls         = find_reference_urls(identity)
    ceo_bytes    = _download_image_as_bytes(urls.get("ceo_photo_url"))
    logo_bytes   = _download_image_as_bytes(urls.get("logo_url"))

    _AVATAR_SUFFIX = (
        "\n\nStyle: photorealistic corporate portrait, head-and-shoulders, professional attire, "
        "serious office background, realistic lighting, no text, no watermark, demo-safe, "
        "not a 1:1 likeness"
    )
    _LOGO_SUFFIX = (
        "\n\nStyle: clean flat logo, centered, scalable, professional, white or transparent background, "
        "no clutter, no watermark, demo-safe, not a 1:1 copy. "
        "White or light background only. Do NOT use black, dark, or transparent background. "
        "Clean white background, logo centered, high contrast, clearly visible."
    )
    _BANNER_SUFFIX = (
        "\n\nStyle: horizontal corporate banner, clean modern design, brand colors, enterprise B2B look, "
        "no watermark, no screenshots, wide landscape format, demo-safe"
    )

    jobs = [
        {
            "key":       "avatar",
            "prompt":    assets.get("avatar_generation_brief", "") + _AVATAR_SUFFIX,
            "filename":  assets.get("avatar_filename", "identity_001_avatar.png"),
            "size":      "1024x1024",
            "ref_bytes": ceo_bytes,
        },
        {
            "key":       "logo",
            "prompt":    assets.get("logo_generation_brief", "") + _LOGO_SUFFIX,
            "filename":  assets.get("logo_filename", "identity_001_logo.png"),
            "size":      "1024x1024",
            "ref_bytes": logo_bytes,
        },
        {
            "key":       "banner",
            "prompt":    assets.get("banner_generation_brief", "") + _BANNER_SUFFIX,
            "filename":  assets.get("banner_filename", "identity_001_banner.png"),
            "size":      "1536x1024",
            "ref_bytes": logo_bytes,
        },
    ]

    result = {}
    errors = 0

    for job in jobs:
        key       = job["key"]
        filename  = job["filename"]
        prompt    = job["prompt"]
        size      = job["size"]
        ref_bytes = job["ref_bytes"]
        save_path = output_folder / filename

        def _call_api(size_override=None):
            s = size_override or size
            if ref_bytes:
                return client.images.edit(
                    model="gpt-image-1",
                    image=BytesIO(ref_bytes),
                    prompt=prompt,
                    size=s,
                    quality="low",
                    n=1,
                )
            else:
                return client.images.generate(
                    model="gpt-image-1",
                    prompt=prompt,
                    size=s,
                    quality="low",
                    n=1,
                )

        try:
            try:
                api_response = _call_api()
            except Exception as first_err:
                if key == "banner":
                    print(f"[generate_images] banner error ({first_err}), retrying with 1024x1024")
                    api_response = _call_api(size_override="1024x1024")
                else:
                    raise

            image_bytes = base64.b64decode(api_response.data[0].b64_json)
            with open(save_path, "wb") as f:
                f.write(image_bytes)
            result[key] = str(save_path.resolve())
            print(f"Saved: {filename}")

        except Exception as e:
            err_str = str(e)
            print(f"[generate_images] ERROR generating {key}: {err_str}")
            if "organization" in err_str.lower() and (
                "not verified" in err_str.lower() or "verification" in err_str.lower()
            ):
                print("[generate_images] gpt-image-1 requires org verification — falling back to MOCK")
                return generate_images_mock(identity, output_folder)
            result[key] = f"ERROR: {err_str}"
            errors += 1

    total = len(jobs)
    status = "ok" if errors == 0 else ("partial" if errors < total else "error")

    result["reference_urls"] = urls
    result["generated_by"]   = "gpt-image-1"
    result["quality"]        = "low"
    result["status"]         = status
    return result


def generate_single_image(identity: dict, asset_type: str, output_folder: Path) -> dict:
    """
    Generate a single image (avatar, logo, or banner) using gpt-image-1.
    Same logic as generate_images but for one asset only.
    Returns {asset_type: saved_path, "status": "ok"} or {"error": ..., "status": "error"}.
    """
    output_folder = Path(output_folder)
    output_folder.mkdir(parents=True, exist_ok=True)

    assets = identity.get("assets", {})

    _SUFFIXES = {
        "avatar": (
            "\n\nStyle: photorealistic corporate portrait, head-and-shoulders, professional attire, "
            "serious office background, realistic lighting, no text, no watermark, demo-safe, "
            "not a 1:1 likeness"
        ),
        "logo": (
            "\n\nStyle: clean flat logo, centered, scalable, professional, white or transparent background, "
            "no clutter, no watermark, demo-safe, not a 1:1 copy. "
            "White or light background only. Do NOT use black, dark, or transparent background. "
            "Clean white background, logo centered, high contrast, clearly visible."
        ),
        "banner": (
            "\n\nStyle: horizontal corporate banner, clean modern design, brand colors, enterprise B2B look, "
            "no watermark, no screenshots, wide landscape format, demo-safe"
        ),
    }
    _BRIEF_KEYS    = {"avatar": "avatar_generation_brief", "logo": "logo_generation_brief",   "banner": "banner_generation_brief"}
    _FILENAME_KEYS = {"avatar": "avatar_filename",          "logo": "logo_filename",           "banner": "banner_filename"}
    _DEFAULTS      = {"avatar": "identity_001_avatar.png",  "logo": "identity_001_logo.png",   "banner": "identity_001_banner.png"}
    _SIZES         = {"avatar": "1024x1024",                "logo": "1024x1024",               "banner": "1536x1024"}
    _REF_TYPE      = {"avatar": "ceo",                      "logo": "logo",                    "banner": "logo"}

    if asset_type not in _SUFFIXES:
        return {"error": f"Unknown asset_type: {asset_type}", "status": "error"}

    urls       = find_reference_urls(identity)
    ceo_bytes  = _download_image_as_bytes(urls.get("ceo_photo_url"))
    logo_bytes = _download_image_as_bytes(urls.get("logo_url"))
    ref_bytes  = ceo_bytes if _REF_TYPE[asset_type] == "ceo" else logo_bytes

    prompt    = assets.get(_BRIEF_KEYS[asset_type], "") + _SUFFIXES[asset_type]
    filename  = assets.get(_FILENAME_KEYS[asset_type], _DEFAULTS[asset_type])
    size      = _SIZES[asset_type]
    save_path = output_folder / filename

    def _call(sz):
        if ref_bytes:
            return client.images.edit(
                model="gpt-image-1", image=BytesIO(ref_bytes),
                prompt=prompt, size=sz, quality="low", n=1,
            )
        return client.images.generate(
            model="gpt-image-1", prompt=prompt, size=sz, quality="low", n=1,
        )

    try:
        try:
            api_response = _call(size)
        except Exception as first_err:
            if asset_type == "banner":
                print(f"[generate_single_image] banner retry with 1024x1024: {first_err}")
                api_response = _call("1024x1024")
            else:
                raise
        image_bytes = base64.b64decode(api_response.data[0].b64_json)
        with open(save_path, "wb") as f:
            f.write(image_bytes)
        print(f"Saved: {filename}")
        return {asset_type: str(save_path.resolve()), "status": "ok"}
    except Exception as e:
        print(f"[generate_single_image] ERROR {asset_type}: {e}")
        return {"error": str(e), "status": "error"}


def generate_images_mock(identity: dict, output_folder: Path) -> dict:
    # kept as fallback
    import time, random
    time.sleep(random.uniform(1.5, 2.5))
    return {
        "avatar": "identity_001_avatar.png",
        "logo":   "identity_001_logo.png",
        "banner": "identity_001_banner.png",
        "generated_by": "MOCK",
        "status": "ok",
    }


# ─────────────────────────────────────────────────────────────────────────────
# FUNCTION 4 — assemble_packages  (real)
# ─────────────────────────────────────────────────────────────────────────────

def assemble_packages(identity: dict, expansion: dict, images: dict, output_folder: Path) -> dict:
    import shutil
    import subprocess
    import sys

    output_folder = Path(output_folder)
    output_folder.mkdir(parents=True, exist_ok=True)

    # Step 1 — Save JSONs to output_folder
    identity_path = output_folder / "identity_profile.json"
    expansion_path = output_folder / "expansion_request.json"
    try:
        identity_path.write_text(json.dumps(identity, ensure_ascii=False, indent=2), encoding="utf-8")
        expansion_path.write_text(json.dumps(expansion, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        return {"error": f"Failed to save JSONs: {e}", "status": "error"}

    # Step 2 — Copy JSONs and images to input_package_generator/workspace
    workspace = _HERE / "input_package_generator" / "workspace"
    workspace.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copy2(identity_path, workspace / "identity_profile.json")
        shutil.copy2(expansion_path, workspace / "expansion_request.json")
    except Exception as e:
        return {"error": f"Failed to copy JSONs to workspace: {e}", "status": "error"}

    assets = identity.get("assets", {})
    for key in ("avatar_filename", "logo_filename", "banner_filename"):
        filename = assets.get(key)
        if not filename:
            continue
        src = Path(images.get(key.replace("_filename", ""), "")) if images else None
        if src and src.exists():
            shutil.copy2(src, workspace / filename)
        else:
            print(f"[assemble_packages] WARNING: image not found, skipping: {filename}")

    # Step 3 — Run Input Package Generator
    script = _HERE / "input_package_generator" / "main.py"
    try:
        proc = subprocess.run(
            [sys.executable, str(script)],
            cwd=str(script.parent),
            capture_output=True,
            text=True,
            timeout=60,
        )
        stdout = proc.stdout or ""
        stderr = proc.stderr or ""
        if proc.returncode != 0:
            return {"error": stderr or stdout, "status": "error"}
    except Exception as e:
        return {"error": f"Failed to run input_package_generator: {e}", "status": "error"}

    # Step 4 — Verify output files exist
    users_csv = _HERE / "input_package_generator" / "output" / "users.csv"
    companies_csv = _HERE / "input_package_generator" / "output" / "companies.csv"
    missing = [str(p) for p in (users_csv, companies_csv) if not p.exists()]
    if missing:
        return {"error": f"Generator did not create: {', '.join(missing)}", "status": "error"}

    # Step 5 — Return success dict
    return {
        "packages_created": expansion["generation_rules"]["target_company_count"],
        "identity_profile": str(identity_path),
        "expansion_request": str(expansion_path),
        "users_csv": str(users_csv),
        "companies_csv": str(companies_csv),
        "generator_output": stdout,
        "generated_by": "input_package_generator",
        "status": "ok",
    }


# ─────────────────────────────────────────────────────────────────────────────
# FUNCTION 5 — test_connection
# ─────────────────────────────────────────────────────────────────────────────

def test_connection() -> bool:
    """
    Send a single 'ping' to gpt-4o-mini.
    Returns True on success, False on any error. Never logs the API key.
    """
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "ping"}],
            max_tokens=5,
        )
        reply = response.choices[0].message.content.strip()
        print(f"Model replied: {reply}")
        return True
    except Exception as e:
        print(f"Connection failed: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# STANDALONE TEST
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Testing connection...")
    ok = test_connection()
    print("OK" if ok else "FAILED")
