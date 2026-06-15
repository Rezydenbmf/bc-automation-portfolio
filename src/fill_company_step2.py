import csv
import logging
import os
import traceback
from datetime import datetime
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

from bc_paths import COMPANIES_CSV, COMPANY_STEP2_RESULTS_CSV, LOGS_DIR as SHARED_LOGS_DIR
from bc_paths import BANNER_DIR


LOGIN_URL = os.getenv("BC_LOGIN_URL", "https://example.com/login")
MY_COMPANIES_URL = os.getenv("BC_COMPANY_URL", "https://example.com/company")

if getattr(sys, "frozen", False):
    BASE_DIR = Path.cwd()
else:
    BASE_DIR = Path(__file__).resolve().parent

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(BASE_DIR / "playwright_browsers")

INPUT_FILE = COMPANIES_CSV
RESULTS_FILE = COMPANY_STEP2_RESULTS_CSV
HEADLESS = False

LOGS_DIR = SHARED_LOGS_DIR
LOGS_DIR.mkdir(exist_ok=True)

_run_ts = datetime.now()
LOG_FILE = LOGS_DIR / f"fill_company_step2_{_run_ts.strftime('%Y-%m-%d')}.log"
with open(LOG_FILE, "a", encoding="utf-8") as _f:
    _f.write(f"\n=== RUN {_run_ts.strftime('%Y-%m-%d %H:%M:%S')} ===\n")

SHORT_WAIT = 700
MEDIUM_WAIT = 1200
LONG_WAIT = 2500


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_FILE), encoding="utf-8"),
        logging.StreamHandler()
    ]
)


def log(msg):
    logging.info(msg)


def read_rows(path):
    log(f"Czytam CSV: {path}")
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    log(f"Wczytano rekordĂłw: {len(rows)}")
    return rows


def append_result(row, status, message=""):
    file_exists = Path(RESULTS_FILE).exists()
    with open(RESULTS_FILE, "a", newline="", encoding="utf-8") as f:
        fieldnames = list(row.keys()) + ["status", "message"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerow({**row, "status": status, "message": message})


def dump_page_state(page, label):
    try:
        body_text = page.locator("body").inner_text()[:1200]
    except Exception:
        body_text = "[nie udaĹ‚o siÄ™ pobraÄ‡ body]"
    log(f"[{label}] URL: {page.url}")
    log(f"[{label}] Fragment body: {body_text}")


def login(page, row):
    log(f"=== START LOGIN dla: {row['email']} ===")

    for attempt in range(1, 4):
        page.goto(LOGIN_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(MEDIUM_WAIT)

        email_field = page.locator('input[placeholder="Email Address"]').first
        password_field = page.locator('input[placeholder="Password"]').first

        email_field.click(timeout=5000)
        email_field.fill("")
        email_field.type(row["email"], delay=30)

        password_field.click(timeout=5000)
        password_field.fill("")
        password_field.type(row["password"], delay=40)

        page.wait_for_timeout(SHORT_WAIT)

        login_button = page.locator('button:has-text("Login")').last
        login_button.scroll_into_view_if_needed()
        page.wait_for_timeout(SHORT_WAIT)
        login_button.click(force=True)

        page.wait_for_timeout(LONG_WAIT)
        dump_page_state(page, "after_login_click")

        if "/login" not in page.url:
            break
        if attempt < 3:
            log(f"[retry {attempt}/2] Login failed, waiting 10s... (URL: {page.url})")
            page.wait_for_timeout(10000)
    else:
        raise RuntimeError(f"Login nie powiĂłdĹ‚ siÄ™ po 3 prĂłbach | email={row['email']}")

    log(f"=== KONIEC LOGIN dla: {row['email']} ===")


def find_company_row_on_current_page(page, company_name):
    company_rows = page.locator("tr")

    for i in range(company_rows.count()):
        row_locator = company_rows.nth(i)
        raw_row_text = row_locator.inner_text()

        if f"\t{company_name}\t" in raw_row_text or f"\n{company_name}\t" in raw_row_text:
            return row_locator

    return None


def go_to_companies_page(page, page_number):
    log(f"PrĂłba przejĹ›cia do strony listy nr {page_number}")

    candidate_locators = [
        page.get_by_role("link", name=str(page_number), exact=True),
        page.get_by_role("button", name=str(page_number), exact=True),
        page.locator(f'a:has-text("{page_number}")'),
        page.locator(f'button:has-text("{page_number}")'),
    ]

    for locator in candidate_locators:
        try:
            if locator.count() == 0:
                continue

            locator.first.scroll_into_view_if_needed()
            page.wait_for_timeout(SHORT_WAIT)
            locator.first.click(timeout=5000)
            page.wait_for_timeout(MEDIUM_WAIT)
            dump_page_state(page, f"my_companies_page_{page_number}")
            return True

        except Exception as e:
            log(f"Nie udaĹ‚o siÄ™ kliknÄ…Ä‡ strony {page_number}: {e}")

    return False


def open_company_data(page, row):
    log("PrzechodzÄ™ do My Companies")
    page.goto(MY_COMPANIES_URL, wait_until="domcontentloaded")
    page.wait_for_timeout(MEDIUM_WAIT)
    dump_page_state(page, "my_companies_loaded")

    company_name = str(row["company_name"]).strip()
    log(f"Szukam firmy: {company_name}")

    matched_row = None
    max_pages_to_check = 20

    for page_number in range(1, max_pages_to_check + 1):
        log(f"Szukam firmy na stronie listy nr {page_number}")
        matched_row = find_company_row_on_current_page(page, company_name)

        if matched_row is not None:
            log(f"Znaleziono firmÄ™ na stronie nr {page_number}")
            break

        next_page_number = page_number + 1
        if next_page_number > max_pages_to_check:
            break

        moved = go_to_companies_page(page, next_page_number)
        if not moved:
            log(f"Nie udaĹ‚o siÄ™ przejĹ›Ä‡ do strony nr {next_page_number} - koĹ„czÄ™ szukanie")
            break

    if matched_row is None:
        raise RuntimeError(
            f"Nie znalazĹ‚em dokĹ‚adnego wiersza firmy na liĹ›cie, rĂłwnieĹĽ po paginacji: {company_name}"
        )

    company_row = matched_row

    direct_link = company_row.locator('a[href*="companyId"]')
    if direct_link.count() > 0:
        log("ZnalazĹ‚em bezpoĹ›redni link do edycji firmy, klikam")
        direct_link.first.click(timeout=5000)
        page.wait_for_timeout(MEDIUM_WAIT)
        dump_page_state(page, "company_opened")
        return

    action_button = company_row.locator("button").last
    if action_button.count() == 0:
        raise RuntimeError("Nie znalazĹ‚em przycisku akcji (3 kropki).")

    log("Klikam przycisk akcji (3 kropki)")
    action_button.click(timeout=5000)
    page.wait_for_timeout(3000)

    log("Czekam na otwarcie widoku firmy po klikniÄ™ciu 3 kropek")
    page.wait_for_timeout(2000)
    dump_page_state(page, "company_opened")


def upgrade_plan(page):
    log("Klikam Upgrade plan przy Company Map Card")
    buttons = page.locator('button:has-text("Upgrade plan")')
    count = buttons.count()
    log(f"Liczba przyciskĂłw Upgrade plan: {count}")

    if count == 0:
        log("Nie ma przycisku Upgrade plan - plan prawdopodobnie juĹĽ aktywny")
        return

    buttons.last.scroll_into_view_if_needed()
    page.wait_for_timeout(SHORT_WAIT)
    buttons.last.click(timeout=5000)

    page.wait_for_timeout(SHORT_WAIT)

    proceed_anyway = page.locator('button:has-text("Proceed anyway")')
    if proceed_anyway.count() > 0:
        log("Klikam Proceed anyway")
        proceed_anyway.first.click(timeout=5000)
        page.wait_for_timeout(MEDIUM_WAIT)

    dump_page_state(page, "plan_page_loaded")

    body_text = page.locator("body").inner_text()
    if "address" in body_text.lower() and "required" in body_text.lower():
        log("Upgrade plan zablokowany: brak adresu firmy - pomijam upgrade")
        return

    proceed_payment = page.locator('button:has-text("Proceed to payment")')
    if proceed_payment.count() == 0:
        raise RuntimeError("Nie znalazĹ‚em przycisku Proceed to payment.")

    log("Klikam Proceed to payment")
    proceed_payment.first.scroll_into_view_if_needed()
    page.wait_for_timeout(SHORT_WAIT)
    proceed_payment.first.click(timeout=5000)

    page.wait_for_timeout(LONG_WAIT)
    dump_page_state(page, "after_payment")


def upload_banner(page, file_path):
    log(f"PrĂłbujÄ™ wgraÄ‡ banner: {file_path}")

    raw_path = Path(str(file_path).strip())

    if raw_path.is_absolute():
        p = raw_path
    else:
        p = BANNER_DIR / raw_path.name

    log(f"ĹšcieĹĽka koĹ„cowa bannera: {p}")

    if not p.exists():
        raise RuntimeError(f"Nie znaleziono bannera: {p}")

    file_inputs = page.locator('input[type="file"]')
    count = file_inputs.count()
    log(f"Liczba input[type=file]: {count}")

    if count == 0:
        raise RuntimeError("Nie znalazĹ‚em pola uploadu dla bannera.")

    index = 1 if count > 1 else 0
    file_inputs.nth(index).set_input_files(str(p.resolve()))
    page.wait_for_timeout(MEDIUM_WAIT)
    log("Wgrano banner")


def fill_description(page, text):
    log("UzupeĹ‚niam company_description")

    textarea_count = page.locator("textarea").count()
    editable_count = page.locator('[contenteditable="true"]').count()
    log(f"Liczba textarea: {textarea_count}")
    log(f"Liczba contenteditable=true: {editable_count}")

    if textarea_count > 0:
        description_field = page.locator("textarea").last
        description_field.scroll_into_view_if_needed()
        page.wait_for_timeout(SHORT_WAIT)
        description_field.click(timeout=5000)
        description_field.fill("")
        page.wait_for_timeout(SHORT_WAIT)
        description_field.type(str(text), delay=10)
        page.wait_for_timeout(MEDIUM_WAIT)
        log(f"Wpisano company_description do textarea, dĹ‚ugoĹ›Ä‡: {len(str(text))} znakĂłw")
        return

    if editable_count > 0:
        description_field = page.locator('[contenteditable="true"]').last
        description_field.scroll_into_view_if_needed()
        page.wait_for_timeout(SHORT_WAIT)
        description_field.click(timeout=5000)
        page.keyboard.press("Control+A")
        page.keyboard.press("Backspace")
        page.wait_for_timeout(SHORT_WAIT)
        page.keyboard.type(str(text), delay=10)
        page.wait_for_timeout(MEDIUM_WAIT)
        log(f"Wpisano company_description do contenteditable, dĹ‚ugoĹ›Ä‡: {len(str(text))} znakĂłw")
        return

    dump_page_state(page, "description_not_found")
    raise RuntimeError("Nie znalazĹ‚em pola opisu firmy ani jako textarea, ani jako contenteditable=true.")


def add_map_pin(page, row):
    log("Ustawiam koordynaty firmy przez pola tekstowe")

    lng = str(row["longitude"])
    lat = str(row["latitude"])

    all_inputs = page.locator("input")
    input_count = all_inputs.count()
    log(f"Liczba inputĂłw na stronie: {input_count}")

    longitude_input = all_inputs.nth(input_count - 2)
    latitude_input = all_inputs.nth(input_count - 1)

    longitude_input.click(timeout=5000)
    longitude_input.fill("")
    longitude_input.type(lng, delay=20)

    latitude_input.click(timeout=5000)
    latitude_input.fill("")
    latitude_input.type(lat, delay=20)

    apply_button = page.locator('button:has-text("Apply typed coordinates")')
    if apply_button.count() == 0:
        raise RuntimeError("Nie znalazĹ‚em przycisku Apply typed coordinates.")

    apply_button.first.click(timeout=5000)
    page.wait_for_timeout(MEDIUM_WAIT)
    dump_page_state(page, "after_apply_coordinates")


def save_changes(page):
    log("Klikam Save changes")
    btn = page.locator('button:has-text("Save changes")')
    if btn.count() == 0:
        raise RuntimeError("Nie znalazĹ‚em przycisku Save changes.")

    btn.first.scroll_into_view_if_needed()
    page.wait_for_timeout(SHORT_WAIT)
    btn.first.click(timeout=5000)
    page.wait_for_timeout(LONG_WAIT)


def detect_result(page):
    body_text = page.locator("body").inner_text().lower()
    dump_page_state(page, "final_state")

    if (
        "an error occurred" in body_text
        or "network error" in body_text
        or "error" in body_text
        or "required" in body_text
        or "invalid" in body_text
    ):
        return "error", "formularz zwrĂłciĹ‚ bĹ‚Ä…d"

    if "data has been updated" in body_text or "coordinates applied" in body_text:
        return "success", "step2 wykonany"

    return "unknown", f"nie wykryto jednoznacznego wyniku, URL: {page.url}"


def run_step2(page, row):
    log(f"=== START STEP2 dla: {row['email']} ===")
    open_company_data(page, row)
    upgrade_plan(page)
    upload_banner(page, row["banner_path"])
    fill_description(page, row["company_description"])
    add_map_pin(page, row)
    save_changes(page)
    result = detect_result(page)
    log(f"=== KONIEC STEP2 dla: {row['email']} ===")
    return result


def main():
    rows = read_rows(INPUT_FILE)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS, slow_mo=150)

        for row in rows:
            context = browser.new_context()
            page = context.new_page()

            try:
                log("------------------------------")
                log(f"Przetwarzam step2 dla uĹĽytkownika: {row['email']}")
                login(page, row)

                current_url = page.url
                if "/pl/home" not in current_url and "/pl/control-panel" not in current_url:
                    log(f"[SKIP] Login failed for {row['email']} â€” skipping all rows for this user")
                    append_result(row, "login_failed", f"Login nie powiĂłdĹ‚ siÄ™, URL: {current_url}")
                    break

                status, message = run_step2(page, row)
                log(f"Wynik: {status} | {message}")
                append_result(row, status, message)
            except PlaywrightTimeoutError as e:
                err = f"TIMEOUT: {e}"
                log(err)
                log(traceback.format_exc())
                append_result(row, "timeout", str(e))
            except Exception as e:
                err = f"ERROR: {e}"
                log(err)
                log(traceback.format_exc())
                append_result(row, "error", str(e))
            finally:
                context.close()

        browser.close()


if __name__ == "__main__":
    main()
