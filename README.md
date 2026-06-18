\# BC Automation Portfolio



Sanitized portfolio version of a Python desktop automation project.



The original project automated a multi-step business portal workflow:

\- user registration,

\- user profile completion,

\- company creation,

\- second-step company completion,

\- input package preparation,

\- operator support and reporting helpers.



This repository is intended to show:

\- project structure,

\- modular automation design,

\- validation logic,

\- error handling approach,

\- data preparation workflow.



## Portfolio case studies

- [CSV Multiline Content Approval Fix](CASE_STUDY_CSV_MULTILINE_CONTENT_APPROVAL_FIX.md)



\## Security



This is not the original working repository.



Removed from the portfolio version:

\- real user and company data,

\- logs,

\- generated packages,

\- runtime workspace files,

\- screenshots,

\- browser state,

\- cookies,

\- tokens,

\- `.env` files,

\- private Git history,

\- production URLs.



## Main modules

- `src/bc_paths.py` — centralized path constants for all runtime directories and CSV files
- `src/gui_app_v2.py` — main Tkinter GUI desktop entry point; orchestrates the full AI generation + Playwright automation pipeline
- `src/openai_helper.py` — OpenAI API integration; generates company identities via GPT-4o-mini and images (avatar / logo / banner) via gpt-image-1
- `src/manual_runner.py` — secondary GUI for manually triggering individual automation scripts (register, fill profile, fill company step 1 & 2)
- `src/fix_runtime_pkg.py` — utility to backfill missing `_runtime_pkg` folders in the output directory
- `src/register.py` — Playwright automation: registers new user accounts on the portal
- `src/fill_profile.py` — Playwright automation: fills user profile (bio, country, city, avatar upload)
- `src/fill_company.py` — Playwright automation: creates a company entry (name, address, category, logo, banner)
- `src/fill_company_step2.py` — Playwright automation: second-step company completion (map pin, description, plan upgrade)
- `src/company_registry.py` — local JSON registry tracking uploaded companies and preventing duplicates
- `src/input_package_generator/` — converts identity + expansion JSON into ready-to-use CSV + image packages
- `src/input_package_generator/Asystent Paczek/` — semi-automatic Package Assistant (Polish: *asystent paczek*); step-by-step GUI wizard for building packages manually with AI prompt helpers
- `src/BC_Launcher.spec` — PyInstaller spec for building the Windows `BC_Launcher.exe` desktop executable
- `src/Fillator2077.iss` — Inno Setup script for packaging `BC_Launcher.exe` into a Windows installer (`Fillator2077_Setup.exe`)



## Demo data

Safe sample files are in:

```text
examples/
```
