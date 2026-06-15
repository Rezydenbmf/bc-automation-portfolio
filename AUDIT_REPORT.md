# Portfolio Audit Report

**Date:** 2026-06-15  
**Scope:** Pre-push review for job-application code sample  
**Role target:** AI Automation / AI Workflow (junior)

---

## 1. Files reviewed

### `src/` — all files present at time of audit

| File | Status |
|------|--------|
| `src/bc_paths.py` | Reviewed — clean |
| `src/gui_app_v2.py` | Reviewed — clean |
| `src/openai_helper.py` | Reviewed — clean |
| `src/manual_runner.py` | Reviewed — clean |
| `src/fix_runtime_pkg.py` | Reviewed — clean |
| `src/fill_profile.py` | Reviewed — clean |
| `src/fill_company.py` | Reviewed — clean |
| `src/fill_company_step2.py` | Reviewed — clean |
| `src/company_registry.py` | Reviewed — clean |
| `src/input_package_generator/config.py` | Reviewed — clean |
| `src/input_package_generator/main.py` | Reviewed — clean |
| `src/input_package_generator/mapper.py` | Reviewed — clean |
| `src/input_package_generator/validator.py` | Reviewed — clean |
| `src/input_package_generator/csv_writer.py` | Reviewed — clean |
| `src/input_package_generator/asset_writer.py` | Reviewed — clean |
| `src/input_package_generator/copy_package_to_runtime.py` | Reviewed — clean |
| `src/input_package_generator/run_full_flow.py` | Reviewed — clean |
| `src/input_package_generator/exceptions.py` | Reviewed — clean |
| `src/input_package_generator/templates/*.json` | Reviewed — clean |
| `src/input_package_generator/Asystent Paczek/config.py` | Reviewed — clean |
| `src/input_package_generator/Asystent Paczek/main.py` | Reviewed — clean |
| `src/input_package_generator/Asystent Paczek/gui_app.py` | Reviewed — clean |
| `src/input_package_generator/Asystent Paczek/openai_helper.py` | Reviewed — clean |
| `src/input_package_generator/Asystent Paczek/models.py` | Reviewed — clean |
| `src/input_package_generator/Asystent Paczek/services/*.py` | Reviewed — clean |
| `src/input_package_generator/Asystent Paczek/utils/*.py` | Reviewed — clean |
| `src/input_package_generator/Asystent Paczek/templates/*.txt` | Reviewed — clean |

### `examples/` — all files present at time of audit

| File | Status |
|------|--------|
| `examples/users.example.csv` | Reviewed — clean (only placeholder emails: `demo.user@example.com`) |
| `examples/companies.example.csv` | Reviewed — clean (only fictional company names) |
| `examples/identity_profile.example.json` | Reviewed — clean |
| `examples/expansion_request.example.json` | Reviewed — clean |

---

## 2. Sanitization findings

**No sensitive data found.** Specifically verified:

- **API keys / tokens:** None hardcoded. `openai_helper.py` loads the key via `os.getenv("OPENAI_API_KEY")` from a `.env` file, which is covered by `.gitignore`. The `.env.example` uses only the placeholder `replace_me`.
- **Passwords:** The schema includes a `"password"` field set to `"replace_me"` as the default — not a real credential.
- **Real personal names / emails / phone numbers:** None found. All personal data in examples uses generic demo values (`Alex Demo`, `demo.user@example.com`).
- **Real company names:** None that would identify the original client portal. Mock company names like `Demo Automation Ltd` and `Lumex Consulting Group` are fictional.
- **Absolute Windows paths revealing username:** None found. All paths use `Path(__file__).resolve().parent` or similar relative anchors.
- **Internal production URLs:** None. All URLs resolve through `os.getenv(...)` with `https://example.com/...` as the default fallback, which is already in `.env.example`.
- **The `baza_danych/accounts_export.csv`** path appears in `gui_app_v2.py` as a runtime output target. The `baza_danych/` directory is already covered by `.gitignore`.

No file edits were needed for sanitization.

---

## 3. README.md changes

**Section: `## Main modules`** — significantly expanded.

Previously listed 6 items. Now lists 11 items, adding:

- `src/bc_paths.py` — path constants module
- `src/gui_app_v2.py` — main GUI desktop entry point with description of the AI + Playwright pipeline
- `src/openai_helper.py` — OpenAI API integration (GPT-4o-mini for identity/expansion, gpt-image-1 for images)
- `src/manual_runner.py` — secondary GUI for manually triggering individual scripts
- `src/fix_runtime_pkg.py` — backfill utility for `_runtime_pkg` folders

**Polish/English naming fix:**

`src/input_package_generator/Asystent Paczek/` now reads:  
> *semi-automatic Package Assistant (Polish: asystent paczek); step-by-step GUI wizard…*

The folder was **not renamed** because renaming would break the Python import paths in `gui_app_v2.py` (`_ASYSTENT = _HERE / "input_package_generator" / "Asystent Paczek"`). Adding the English translation in the description is sufficient for a portfolio README.

**Formatting fix:**

The `## Demo data` section had an unclosed code fence (` ```text ` with no closing ` ``` `). Fixed.

Extra blank lines throughout the original README (an artifact of whatever tool generated it) were also cleaned up in the edited sections.

---

## 4. `.gitignore` changes

Added two patterns at the end of the file under a new comment block:

```
# build / installer artifacts (may contain absolute local paths)
*.spec
*.iss
```

**Rationale:**  
- `*.spec` — PyInstaller spec files are referenced in the task description (`BC_Launcher.spec`). These files typically contain absolute paths to the developer's machine.  
- `*.iss` — Inno Setup scripts (`Fillator2077.iss`) also commonly embed absolute local paths (output directories, source directories).  
- Neither file type currently exists in the repo, so this is a preventive measure for future work.

The `*.log`, `__pycache__/`, `*.pyc`, `baza_danych/`, and other relevant patterns were already in `.gitignore`.

---

## 5. Items to double-check manually before pushing

1. **`register.py` is missing from the repo** — `gui_app_v2.py` and `manual_runner.py` both reference `register.py` by path (`_HERE / "register.py"`). It does not exist in `src/`. If it contains automation logic you want to show, add it. If it was intentionally excluded, consider adding a comment or note in the README under a "Not included" section.

2. **`src/input_package_generator/Asystent Paczek/` folder name contains a space** — the space in the folder name works on Windows but can cause friction on some Linux-based CI systems and with certain Git tooling. Consider renaming to `asystent_paczek` (and updating all import/path references) before the repo becomes public, if you plan to share it on GitHub.

3. **`requirements.txt` is incomplete** — the file only lists `playwright`, `pandas`, and `openpyxl`. `src/openai_helper.py` additionally requires `openai`, `python-dotenv`, `requests`, and `Pillow`. These should be added so a reviewer can `pip install -r requirements.txt` and run the code.

4. **`launcher_orchestrator.py` does not exist** — it is referenced as a constant in `gui_app_v2.py` (`LAUNCHER_SCRIPT = Path(__file__).resolve().parent / "launcher_orchestrator.py"`) but never called (the button that would invoke it appears to have been replaced by `_run_playwright_queue`). Verify this is dead code before pushing; if so, remove the constant to avoid confusion.

5. **Polish UI strings in `gui_app_v2.py`** — button labels, log messages, and tab names are mixed Polish/English (e.g., "Historia", "Liczba firm", "GENERUJ PACZKI"). These are internal UI strings and do not affect the public API, but a reviewer may notice them. Mention in the README that the UI was designed for Polish-speaking operators, or add a brief note under a "Localization" heading.

6. **No `register.py`, `reporting/`, or `BC_Launcher.spec` / `Fillator2077.iss`** — the task description anticipated these might be present. None were found. If these exist on your machine and contain work you want to show, add them after the same sanitization review process (check for absolute paths and credentials). Add to `.gitignore` first if they should NOT be tracked.

---

## Round 2 — 2026-06-15

### Files added

| File | Source | Action |
|------|--------|--------|
| `src/register.py` | `H:/AI/apki/BC/register.py` | Sanitized 1 URL (see below), then copied |
| `src/BC_Launcher.spec` | `H:/AI/apki/BC/BC_Launcher.spec` | Copied as-is — already clean |
| `src/Fillator2077.iss` | `H:/AI/apki/BC/Fillator2077.iss` | Copied as-is — already clean |

### Sanitization performed

**`src/register.py` — 1 change:**

```
# BEFORE (line 10 in original)
REGISTER_URL = "https://business-communicator.com/register"

# AFTER
REGISTER_URL = os.getenv("BC_REGISTER_URL", "https://example.com/register")
```

This matches the pattern already used in `fill_company.py` and `fill_profile.py` for their portal URLs. The real domain (`business-communicator.com`) was the only sensitive item in all three files reviewed.

**`src/BC_Launcher.spec` — no changes required.**  
PyInstaller spec uses only relative references: entry script `launcher_demo.py`, icon at `images\fillator_2077_installer_icon.ico`. No absolute paths, no usernames.

**`src/Fillator2077.iss` — no changes required.**  
Inno Setup script uses only Inno macros (`{localappdata}`, `{app}`, `{autodesktop}`, `{group}`) and relative source paths (`demo_package\*`, `images\...`). No absolute paths, no usernames.

### `.gitignore` update

The `*.spec` / `*.iss` block added in Round 1 was extended with negation rules so the two portfolio files are tracked while other generated build artifacts remain ignored:

```gitignore
*.spec
*.iss
!src/BC_Launcher.spec
!src/Fillator2077.iss
```

### `.env.example` update

Added `BC_REGISTER_URL=https://example.com/register` to document the new env variable consumed by `register.py`.

### `requirements.txt` update

Added four packages confirmed as actually imported by the project:

| Package | Used in |
|---------|---------|
| `openai` | `src/openai_helper.py` — `import openai` |
| `python-dotenv` | `src/openai_helper.py` — `from dotenv import load_dotenv` |
| `requests` | `src/openai_helper.py` — `import requests` |
| `Pillow` | `src/gui_app_v2.py` — `from PIL import Image, ImageTk` |

### `README.md` update

Added three entries to the Main modules list:

- `src/register.py` — Playwright automation: registers new user accounts on the portal
- `src/BC_Launcher.spec` — PyInstaller spec for building the Windows `BC_Launcher.exe` desktop executable
- `src/Fillator2077.iss` — Inno Setup script for packaging `BC_Launcher.exe` into a Windows installer

### Remaining open items (unchanged from Round 1)

- Items 2, 4, 5 from Round 1 still apply (`Asystent Paczek` folder name with space; dead `LAUNCHER_SCRIPT` constant; Polish UI strings).
- `reporting/generate_registry_report.py` is referenced in `gui_app_v2.py` but not present in the repo. Add or note as intentionally excluded.
