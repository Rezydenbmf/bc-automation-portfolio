import json
from pathlib import Path


def load_identity_profile(identity_profile_path: Path) -> dict:
    if not identity_profile_path.exists():
        raise FileNotFoundError(f"Missing file: {identity_profile_path}")

    raw_text = identity_profile_path.read_text(encoding="utf-8").strip()
    if not raw_text:
        raise ValueError("identity_profile.json is empty")

    return json.loads(raw_text)


def build_avatar_prompt(brief: str, filename: str) -> str:
    return (
        "Create one final PNG avatar for internal demo use.\n"
        "References provided in this chat:\n"
        "- real CEO / executive photo\n"
        "- reference avatar image showing the correct framing and visual composition\n"
        f"- creative brief: {brief}\n"
        "Requirements:\n"
        "- final output must be exactly 2048 x 2048 px PNG\n"
        "- keep the result square\n"
        "- create a polished illustrated corporate avatar\n"
        "- use the real CEO only as visual inspiration\n"
        "- do not create a photorealistic portrait\n"
        "- do not create a 1:1 likeness\n"
        "- preserve the general vibe, age range, hairstyle, facial structure, and executive presence\n"
        "- keep the result professionally similar, but clearly stylized and demo-safe\n"
        "- head-and-shoulders framing\n"
        "- clean professional business attire\n"
        "- clear face visibility\n"
        "- confident but natural expression\n"
        "- neutral or subtle office-like background\n"
        "- modern B2B corporate look\n"
        "- clean lighting\n"
        "- no text\n"
        "- no extra objects\n"
        "- no decorative fantasy elements\n"
        "- no collage\n"
        "- no watermark\n"
        "Match the overall framing and usable composition of the uploaded reference avatar.\n"
        f"File target: {filename}"
    )


def build_logo_prompt(brief: str, filename: str) -> str:
    return (
        "Create one final PNG logo for internal demo use.\n"
        "References provided in this chat:\n"
        "- real company logo\n"
        "- reference logo image showing the correct proportions and clean output format\n"
        f"- creative brief: {brief}\n"
        "Requirements:\n"
        "- final output must be exactly 1024 x 1024 px PNG\n"
        "- keep the result square\n"
        "- create a demo-safe logo inspired by the real company logo\n"
        "- do not make a 1:1 copy\n"
        "- preserve the general brand feel, color direction, industry tone, simplicity, and visual clarity\n"
        "- create an original simplified version\n"
        "- keep it clean, flat, centered, scalable, and professional\n"
        "- avoid excessive detail\n"
        "- avoid busy effects\n"
        "- avoid mockup presentation\n"
        "- avoid paper texture\n"
        "- avoid watermark\n"
        "- no background clutter\n"
        "The logo should feel aligned with the real brand, but remain safe for internal demo use.\n"
        "Match the clean usable composition of the uploaded reference logo.\n"
        f"File target: {filename}"
    )


def build_banner_prompt(brief: str, filename: str) -> str:
    return (
        "Create one final cropped horizontal PNG banner for internal demo use.\n"
        "References provided in this chat:\n"
        "- real company logo\n"
        "- optional company website or branding reference\n"
        "- reference banner image showing the correct final crop and usable composition\n"
        f"- creative brief: {brief}\n"
        "Requirements:\n"
        "- final output must be exactly 1456 x 449 px PNG\n"
        "- final result must be a horizontal banner only\n"
        "- tightly cropped to the actual banner area\n"
        "- no outer canvas\n"
        "- no empty margins\n"
        "- no surrounding background\n"
        "- match the final crop style and usable proportions of the uploaded reference banner\n"
        "- use the real company brand only as inspiration\n"
        "- do not make a 1:1 copy of official materials\n"
        "- build the design from the logo direction, brand colors, and general visual style of the company\n"
        "- style should be corporate, modern, international, clean, and suitable for a B2B company page\n"
        "- composition must stay readable and not too busy\n"
        "- no screenshots\n"
        "- no copied website layout\n"
        "- no watermark\n"
        "- no tiny unreadable text\n"
        "- if text appears, keep it minimal or avoid it entirely\n"
        f"File target: {filename}"
    )


def build_asset_prompts_text(identity_profile: dict) -> str:
    assets = identity_profile.get("assets", {})

    avatar_prompt = build_avatar_prompt(
        brief=assets.get("avatar_generation_brief", "").strip(),
        filename=assets.get("avatar_filename", "identity_001_avatar.png").strip(),
    )
    logo_prompt = build_logo_prompt(
        brief=assets.get("logo_generation_brief", "").strip(),
        filename=assets.get("logo_filename", "identity_001_logo.png").strip(),
    )
    banner_prompt = build_banner_prompt(
        brief=assets.get("banner_generation_brief", "").strip(),
        filename=assets.get("banner_filename", "identity_001_banner.png").strip(),
    )

    return (
        "[AVATAR PROMPT]\n"
        f"{avatar_prompt}\n\n"
        "[LOGO PROMPT]\n"
        f"{logo_prompt}\n\n"
        "[BANNER PROMPT]\n"
        f"{banner_prompt}\n"
    )


def generate_asset_prompts_file(package_dir: Path) -> Path:
    identity_profile_path = package_dir / "identity_profile.json"
    output_path = package_dir / "asset_prompts.txt"

    identity_profile = load_identity_profile(identity_profile_path)
    content = build_asset_prompts_text(identity_profile)

    output_path.write_text(content, encoding="utf-8")
    return output_path