"""
company_registry.py
-------------------
Manages a local JSON registry of companies already uploaded to the
Business Communicator portal.

Registry file: uploaded_companies.json  (same folder as this module)
"""

import csv
import json
from datetime import datetime
from pathlib import Path

_REGISTRY_FILE  = Path(__file__).parent / "uploaded_companies.json"
_ALERTS_FILE    = Path(__file__).parent / "company_alerts.json"
_PROCESSED_FILE = Path(__file__).parent / "processed_packages.json"


def _load() -> list[dict]:
    """Load registry from JSON file. Return empty list if missing or invalid."""
    try:
        return json.loads(_REGISTRY_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except UnicodeDecodeError as e:
        print(f"[_load] Warning: registry file cannot be decoded as UTF-8, returning empty list: {e}")
        return []
    except json.JSONDecodeError as e:
        print(f"[_load] Warning: registry file contains invalid JSON, returning empty list: {e}")
        return []


def _save(records: list[dict]) -> None:
    """Save registry list to JSON file."""
    _REGISTRY_FILE.write_text(
        json.dumps(records, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def is_duplicate(company_name: str) -> bool:
    """Return True if a company with this name already exists (case-insensitive)."""
    needle = company_name.strip().lower()
    return any(r.get("company_name", "").strip().lower() == needle for r in _load())


def add_company(
    company_name: str,
    country: str = "",
    status: str = "uploaded",
) -> None:
    """Append a new record to the registry."""
    records = _load()
    records.append(
        {
            "company_name": company_name.strip(),
            "country": country.strip(),
            "status": status,
            "date_added": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )
    _save(records)


def get_all() -> list[dict]:
    """Return the full list of records from the registry."""
    return _load()


def save_alert(company_name: str, alert_type: str, message: str) -> None:
    """Append an alert entry to company_alerts.json."""
    try:
        alerts = json.loads(_ALERTS_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        alerts = []
    alerts.append(
        {
            "company_name": company_name.strip(),
            "alert_type":   alert_type,
            "message":      message,
            "date_added":   datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )
    _ALERTS_FILE.write_text(
        json.dumps(alerts, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def mark_package_done(package_folder_name: str) -> None:
    """Append a folder name with timestamp to processed_packages.json."""
    try:
        records = json.loads(_PROCESSED_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        records = []
    records.append(
        {
            "folder":     package_folder_name,
            "date_added": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )
    _PROCESSED_FILE.write_text(
        json.dumps(records, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def is_package_done(package_folder_name: str) -> bool:
    """Return True if the folder name exists in processed_packages.json."""
    try:
        records = json.loads(_PROCESSED_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return False
    return any(r.get("folder") == package_folder_name for r in records)


def export_to_csv(output_path: str) -> bool:
    """Export uploaded_companies + alerts to a single CSV file. Returns True on success."""
    try:
        companies = _load()
        try:
            alerts_raw = json.loads(_ALERTS_FILE.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            alerts_raw = []

        # Build alert lookup: company_name (lower) -> list of messages
        alert_map: dict[str, list[str]] = {}
        for a in alerts_raw:
            key = a.get("company_name", "").strip().lower()
            if key:
                alert_map.setdefault(key, []).append(a.get("message", ""))

        with open(output_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["company_name", "country", "date_added", "status", "alerts"],
            )
            writer.writeheader()
            for rec in companies:
                name = rec.get("company_name", "")
                msgs = alert_map.get(name.strip().lower(), [])
                writer.writerow(
                    {
                        "company_name": name,
                        "country":      rec.get("country", ""),
                        "date_added":   rec.get("date_added", ""),
                        "status":       rec.get("status", ""),
                        "alerts":       "; ".join(msgs),
                    }
                )
        return True
    except Exception as e:
        print(f"[export_to_csv] Warning: export failed: {e}")
        return False


def import_from_csv(input_path: str) -> int:
    """Import companies from CSV, skipping duplicates. Returns count of new records added."""
    imported = 0
    try:
        with open(input_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = (row.get("company_name") or "").strip()
                if not name:
                    continue
                if is_duplicate(name):
                    continue
                add_company(
                    company_name=name,
                    country=(row.get("country") or "").strip(),
                    status=(row.get("status") or "uploaded").strip(),
                )
                imported += 1
    except Exception as e:
        print(f"[import_from_csv] Warning: import failed: {e}")
    return imported


def remove_company(company_name: str) -> bool:
    """Remove a company by name (case-insensitive). Return True if removed."""
    needle = company_name.strip().lower()
    records = _load()
    new_records = [r for r in records if r.get("company_name", "").strip().lower() != needle]
    if len(new_records) == len(records):
        return False
    _save(new_records)
    return True
