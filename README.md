# BC Portal Automation Suite

**Two automation tools built for the Business Communicator portal**

---

Business Communicator (`business-communicator.com`) is a B2B networking platform where companies create profiles, connect with partners, and publish content. These tools were built to automate the repetitive account-lifecycle and engagement workflows on that portal — tasks that would otherwise require hours of manual clicking per batch. This repository is a sanitized portfolio version: all real credentials, account data, and private URLs have been removed and replaced with environment variables and example files.

## Tool 1: BC Automation (Python)

Automates the full account lifecycle on the portal, from registration through a fully filled company profile.

- Registers new user accounts and fills user profiles (bio, avatar, location)
- Creates company entries (name, logo, banner, description) and completes the second setup step (map pin, plan upgrade)
- Generates company identities end-to-end using OpenAI — GPT-4o-mini for text, gpt-image-1 for images
- Packages inputs for batch runs; ships as a Windows desktop app (GUI launcher built with tkinter, distributed via PyInstaller + Inno Setup)

**Stack:** Python, Playwright, OpenAI API, tkinter, PyInstaller, Inno Setup

Source: [`src/`](src/)

## Tool 2: BC Follow Bot (TypeScript)

Automates engagement and AI-assisted content operations on the portal, with a strong emphasis on human oversight and auditability.

- Batch-follows profiles across multiple accounts with per-account rate limits, skip-existing logic, and a full audit trail (CSV-driven)
- Generates AI content drafts via the OpenAI API, routes them through human CSV approval, and gates any publish action behind a dry-run step plus two typed confirmations
- Ships with 24 test suites covering core logic and edge cases
- Clean TypeScript build with strict types throughout

**Stack:** TypeScript, Node.js, Playwright, OpenAI API

Source: [`bc-follow-bot/`](bc-follow-bot/)

## Case Studies

Short write-ups of real problems encountered during development:

- [CSV Multiline Content Approval Fix](CASE_STUDY_CSV_MULTILINE_CONTENT_APPROVAL_FIX.md) — diagnosed and fixed a silent data-corruption bug caused by unescaped newlines breaking CSV parsing in the content approval pipeline
- [AI Content Quality Gate](CASE_STUDY_AI_CONTENT_QUALITY_GATE.md) — shifted the supervised content workflow from "does it technically run?" to "is the AI output actually good enough to approve?", introducing a quality gate before human review
- [Supervised Content Run 002](CASE_STUDY_SUPERVISED_CONTENT_RUN_002.md) — end-to-end verification that the full human-gated content workflow completes reliably for a single manually approved post

## Portfolio Note

This is a sanitized portfolio version. Real credentials, portal URLs, approved post text, logs, browser state, cookies, and all account-identifying data have been stripped. Configuration is passed via environment variables (`.env`); safe example files are in [`examples/`](examples/).

Both tools are under active development and continue to be extended.
