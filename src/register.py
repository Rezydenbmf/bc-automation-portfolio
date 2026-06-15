import csv
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from bc_paths import USERS_CSV, REGISTER_RESULTS_CSV, LOGS_DIR

REGISTER_URL = os.getenv("BC_REGISTER_URL", "https://example.com/register")

if getattr(sys, "frozen", False):
    BASE_DIR = Path.cwd()
else:
    BASE_DIR = Path(__file__).resolve().parent

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(BASE_DIR / "playwright_browsers")

INPUT_FILE = USERS_CSV
RESULTS_FILE = REGISTER_RESULTS_CSV
HEADLESS = False

LOGS_DIR.mkdir(exist_ok=True)

_run_ts = datetime.now()
log_file = LOGS_DIR / f"register_{_run_ts.strftime('%Y-%m-%d')}.log"

with open(log_file, "a", encoding="utf-8") as _f:
    _f.write(f"\n=== RUN {_run_ts.strftime('%Y-%m-%d %H:%M:%S')} ===\n")

logging.basicConfig(
    filename=str(log_file),
    filemode="a",
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    encoding="utf-8"
)

def read_users(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def append_result(row, status, message=""):
    file_exists = Path(RESULTS_FILE).exists()
    with open(RESULTS_FILE, "a", newline="", encoding="utf-8") as f:
        fieldnames = list(row.keys()) + ["status", "message"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerow({**row, "status": status, "message": message})

def register_one(page, user):
    for attempt in range(1, 4):
        try:
            page.goto(REGISTER_URL, wait_until="domcontentloaded")
            page.wait_for_timeout(2000)
            logging.info(f"START rejestracji | email={user['email']} | user={user['first_name']} {user['last_name']}")

            page.locator('input[placeholder="First name"]').fill(user["first_name"])
            page.locator('input[placeholder="Last name"]').fill(user["last_name"])
            page.locator('input[placeholder="Email Address"]').fill(user["email"])

            password_field = page.locator('input[placeholder="Password"]')
            confirm_field = page.locator('input[placeholder="Confirm password"]')

            password_field.click()
            password_field.fill("")
            password_field.type(user["password"], delay=120)

            confirm_field.click()
            confirm_field.fill("")
            confirm_field.type(user["password"], delay=120)

            page.wait_for_timeout(1000)

            sign_up_button = page.locator('button[type="submit"]').first
            sign_up_button.scroll_into_view_if_needed()
            page.wait_for_timeout(1000)
            logging.info(f"Klikam submit | email={user['email']}")

            print("Czy przycisk widoczny:", sign_up_button.is_visible())
            print("Czy przycisk aktywny:", sign_up_button.is_enabled())

            try:
                sign_up_button.click(timeout=10000)
            except Exception as e:
                print("Normalne kliknięcie nie zadziałało:", e)
                page.evaluate("""
                    () => {
                        const btn = document.querySelector('button[type="submit"]');
                        if (btn) btn.click();
                    }
                """)

            page.wait_for_timeout(1500)
            logging.info(f"Po submit | email={user['email']} | url={page.url}")

            current_url = page.url.lower()
            body_text = page.locator("body").inner_text().lower()

            if "already" in body_text or "exists" in body_text:
                return "duplicate", "konto już istnieje"

            if "verify" in body_text or "confirmation" in body_text or "check your email" in body_text:
                return "success_pending", "konto utworzone, wymagane potwierdzenie maila"

            if "login" in current_url or "signin" in current_url:
                return "success", "rejestracja zakończona"

            if "captcha" in body_text or "recaptcha" in body_text:
                return "captcha", "strona wymaga captcha"

            return "unknown", f"sprawdź ręcznie, URL po wysłaniu: {page.url}"
        except PlaywrightTimeoutError:
            if attempt < 3:
                logging.info(f"[retry {attempt}/2] Login failed, waiting 10s... | email={user['email']}")
                page.wait_for_timeout(10000)
            else:
                raise

def main():
    users = read_users(INPUT_FILE)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS, slow_mo=500)
        context = browser.new_context()
        page = context.new_page()

        for user in users:
            try:
                status, message = register_one(page, user)
                logging.info(f"WYNIK rejestracji | email={user['email']} | status={status} | message={message}")
                print(user["email"], status, message)
                append_result(user, status, message)
            except PlaywrightTimeoutError as e:
                append_result(user, "timeout", str(e))
                logging.exception(f"TIMEOUT rejestracji | email={user['email']}")
                print("TIMEOUT:", e)
            except Exception as e:
                append_result(user, "error", str(e))
                logging.exception(f"ERROR rejestracji | email={user['email']}")
                print("ERROR:", e)

        browser.close()

if __name__ == "__main__":
    main()
