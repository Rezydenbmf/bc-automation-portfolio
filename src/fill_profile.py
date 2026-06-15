import csv
import logging
import os
import sys
import traceback
from pathlib import Path
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from bc_paths import USERS_CSV, PROFILE_RESULTS_CSV, LOGS_DIR as SHARED_LOGS_DIR, AVATAR_DIR

COUNTRY_CAPITALS = {
    # Europe
    "Albania": "Tirana",
    "Andorra": "Andorra la Vella",
    "Austria": "Vienna",
    "Belarus": "Minsk",
    "Belgium": "Brussels",
    "Bosnia and Herzegovina": "Sarajevo",
    "Bulgaria": "Sofia",
    "Croatia": "Zagreb",
    "Cyprus": "Nicosia",
    "Czech Republic": "Prague",
    "Denmark": "Copenhagen",
    "Estonia": "Tallinn",
    "Finland": "Helsinki",
    "France": "Paris",
    "Germany": "Berlin",
    "Greece": "Athens",
    "Hungary": "Budapest",
    "Iceland": "Reykjavik",
    "Ireland": "Dublin",
    "Italy": "Rome",
    "Kosovo": "Pristina",
    "Latvia": "Riga",
    "Liechtenstein": "Vaduz",
    "Lithuania": "Vilnius",
    "Luxembourg": "Luxembourg",
    "Malta": "Valletta",
    "Moldova": "Chisinau",
    "Monaco": "Monaco",
    "Montenegro": "Podgorica",
    "Netherlands": "Amsterdam",
    "North Macedonia": "Skopje",
    "Norway": "Oslo",
    "Poland": "Warsaw",
    "Portugal": "Lisbon",
    "Romania": "Bucharest",
    "Russia": "Moscow",
    "San Marino": "San Marino",
    "Serbia": "Belgrade",
    "Slovakia": "Bratislava",
    "Slovenia": "Ljubljana",
    "Spain": "Madrid",
    "Sweden": "Stockholm",
    "Switzerland": "Zurich",
    "Turkey": "Istanbul",
    "Ukraine": "Kyiv",
    "United Kingdom": "London",
    "Vatican City": "Vatican City",
    # North America
    "Antigua and Barbuda": "Saint John's",
    "Bahamas": "Nassau",
    "Barbados": "Bridgetown",
    "Belize": "Belmopan",
    "Canada": "Toronto",
    "Costa Rica": "San Jose",
    "Cuba": "Havana",
    "Dominica": "Roseau",
    "Dominican Republic": "Santo Domingo",
    "El Salvador": "San Salvador",
    "Grenada": "Saint George's",
    "Guatemala": "Guatemala City",
    "Haiti": "Port-au-Prince",
    "Honduras": "Tegucigalpa",
    "Jamaica": "Kingston",
    "Mexico": "Mexico City",
    "Nicaragua": "Managua",
    "Panama": "Panama City",
    "Saint Kitts and Nevis": "Basseterre",
    "Saint Lucia": "Castries",
    "Saint Vincent and the Grenadines": "Kingstown",
    "Trinidad and Tobago": "Port of Spain",
    "United States of America": "New York",
    # South America
    "Argentina": "Buenos Aires",
    "Bolivia": "La Paz",
    "Brazil": "Sao Paulo",
    "Chile": "Santiago",
    "Colombia": "Bogota",
    "Ecuador": "Quito",
    "Guyana": "Georgetown",
    "Paraguay": "Asuncion",
    "Peru": "Lima",
    "Suriname": "Paramaribo",
    "Uruguay": "Montevideo",
    "Venezuela": "Caracas",
    # Asia
    "Afghanistan": "Kabul",
    "Armenia": "Yerevan",
    "Azerbaijan": "Baku",
    "Bahrain": "Manama",
    "Bangladesh": "Dhaka",
    "Bhutan": "Thimphu",
    "Brunei": "Bandar Seri Begawan",
    "Cambodia": "Phnom Penh",
    "China": "Beijing",
    "Georgia": "Tbilisi",
    "India": "Mumbai",
    "Indonesia": "Jakarta",
    "Iran": "Tehran",
    "Iraq": "Baghdad",
    "Israel": "Tel Aviv",
    "Japan": "Tokyo",
    "Jordan": "Amman",
    "Kazakhstan": "Almaty",
    "Kuwait": "Kuwait City",
    "Kyrgyzstan": "Bishkek",
    "Laos": "Vientiane",
    "Lebanon": "Beirut",
    "Malaysia": "Kuala Lumpur",
    "Maldives": "Male",
    "Mongolia": "Ulaanbaatar",
    "Myanmar": "Yangon",
    "Nepal": "Kathmandu",
    "North Korea": "Pyongyang",
    "Oman": "Muscat",
    "Pakistan": "Karachi",
    "Palestine": "Ramallah",
    "Philippines": "Manila",
    "Qatar": "Doha",
    "Saudi Arabia": "Riyadh",
    "Singapore": "Singapore",
    "South Korea": "Seoul",
    "Sri Lanka": "Colombo",
    "Syria": "Damascus",
    "Taiwan": "Taipei",
    "Tajikistan": "Dushanbe",
    "Thailand": "Bangkok",
    "Timor-Leste": "Dili",
    "Turkmenistan": "Ashgabat",
    "United Arab Emirates": "Dubai",
    "Uzbekistan": "Tashkent",
    "Vietnam": "Ho Chi Minh City",
    "Yemen": "Sanaa",
    # Middle East (additional)
    "Egypt": "Cairo",
    # Africa
    "Algeria": "Algiers",
    "Angola": "Luanda",
    "Benin": "Cotonou",
    "Botswana": "Gaborone",
    "Burkina Faso": "Ouagadougou",
    "Burundi": "Bujumbura",
    "Cameroon": "Yaounde",
    "Cape Verde": "Praia",
    "Central African Republic": "Bangui",
    "Chad": "N'Djamena",
    "Comoros": "Moroni",
    "Congo": "Brazzaville",
    "Democratic Republic of the Congo": "Kinshasa",
    "Djibouti": "Djibouti",
    "Equatorial Guinea": "Malabo",
    "Eritrea": "Asmara",
    "Eswatini": "Mbabane",
    "Ethiopia": "Addis Ababa",
    "Gabon": "Libreville",
    "Gambia": "Banjul",
    "Ghana": "Accra",
    "Guinea": "Conakry",
    "Guinea-Bissau": "Bissau",
    "Ivory Coast": "Abidjan",
    "Kenya": "Nairobi",
    "Lesotho": "Maseru",
    "Liberia": "Monrovia",
    "Libya": "Tripoli",
    "Madagascar": "Antananarivo",
    "Malawi": "Lilongwe",
    "Mali": "Bamako",
    "Mauritania": "Nouakchott",
    "Mauritius": "Port Louis",
    "Morocco": "Casablanca",
    "Mozambique": "Maputo",
    "Namibia": "Windhoek",
    "Niger": "Niamey",
    "Nigeria": "Lagos",
    "Rwanda": "Kigali",
    "Sao Tome and Principe": "Sao Tome",
    "Senegal": "Dakar",
    "Sierra Leone": "Freetown",
    "Somalia": "Mogadishu",
    "South Africa": "Johannesburg",
    "South Sudan": "Juba",
    "Sudan": "Khartoum",
    "Tanzania": "Dar es Salaam",
    "Togo": "Lome",
    "Tunisia": "Tunis",
    "Uganda": "Kampala",
    "Zambia": "Lusaka",
    "Zimbabwe": "Harare",
    # Oceania
    "Australia": "Sydney",
    "Fiji": "Suva",
    "Kiribati": "Tarawa",
    "Marshall Islands": "Majuro",
    "Micronesia": "Palikir",
    "Nauru": "Yaren",
    "New Zealand": "Auckland",
    "Palau": "Ngerulmud",
    "Papua New Guinea": "Port Moresby",
    "Samoa": "Apia",
    "Solomon Islands": "Honiara",
    "Tonga": "Nukualofa",
    "Tuvalu": "Funafuti",
    "Vanuatu": "Port Vila",
}

LOGIN_URL = os.getenv("BC_LOGIN_URL", "https://example.com/login")
PROFILE_URL = os.getenv("BC_PROFILE_URL", "https://example.com/profile")

if getattr(sys, "frozen", False):
    BASE_DIR = Path.cwd()
else:
    BASE_DIR = Path(__file__).resolve().parent

os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(BASE_DIR / "playwright_browsers"))

INPUT_FILE = USERS_CSV
RESULTS_FILE = PROFILE_RESULTS_CSV

LOGS_DIR = SHARED_LOGS_DIR
LOGS_DIR.mkdir(exist_ok=True)

_run_ts = datetime.now()
LOG_FILE = LOGS_DIR / f"fill_profile_{_run_ts.strftime('%Y-%m-%d')}.log"
with open(LOG_FILE, "a", encoding="utf-8") as _f:
    _f.write(f"\n=== RUN {_run_ts.strftime('%Y-%m-%d %H:%M:%S')} ===\n")
HEADLESS = False

SHORT_WAIT = 700
MEDIUM_WAIT = 1200
LONG_WAIT = 2000

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler()
    ]
)


def log(msg):
    logging.info(msg)


class ManualRequiredError(RuntimeError):
    pass


COUNTRY_ALIASES = {
    "usa": "United States of America",
    "us": "United States of America",
    "united states": "United States of America",
    "united states of america": "United States of America",
}


def normalize_country_name(value):
    return " ".join(str(value or "").strip().split()).casefold()


def canonical_country_name(value):
    raw = " ".join(str(value or "").strip().split())
    return COUNTRY_ALIASES.get(normalize_country_name(raw), raw)


def read_users(path):
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


def login(page, user):
    log(f"=== START LOGIN dla: {user['email']} ===")

    for attempt in range(1, 4):
        page.goto(LOGIN_URL, wait_until="domcontentloaded")
        page.wait_for_timeout(MEDIUM_WAIT)
        dump_page_state(page, "login_page_loaded")

        email_field = page.locator('input[placeholder="Email Address"]').first
        password_field = page.locator('input[placeholder="Password"]').first

        log("WpisujÄ™ email")
        email_field.click(timeout=5000)
        email_field.fill("")
        email_field.type(user["email"], delay=30)

        log("WpisujÄ™ hasĹ‚o")
        password_field.click(timeout=5000)
        password_field.fill("")
        password_field.type(user["password"], delay=40)

        page.wait_for_timeout(SHORT_WAIT)

        buttons = page.locator('button:has-text("Login")')
        log(f"Liczba przyciskĂłw 'Login': {buttons.count()}")

        login_button = buttons.last
        log("Klikam przycisk logowania formularza")
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
        raise RuntimeError(f"Login nie powiĂłdĹ‚ siÄ™ po 3 prĂłbach | email={user['email']}")

    log(f"=== KONIEC LOGIN dla: {user['email']} ===")


def open_profile(page):
    log("PrzechodzÄ™ na stronÄ™ profilu")
    page.goto(PROFILE_URL, wait_until="domcontentloaded")
    page.wait_for_timeout(MEDIUM_WAIT)
    dump_page_state(page, "profile_loaded")


def set_bio(page, value):
    log("Szukam pola bio")

    selectors = [
        'textarea',
        'input[placeholder*="yourself" i]',
        'input[name="description"]',
        'input[name="bio"]',
        'input[name="about"]',
        'input[type="text"]'
    ]

    for selector in selectors:
        loc = page.locator(selector)
        count = loc.count()
        log(f"Selector bio {selector} -> count={count}")
        if count > 0:
            try:
                loc.first.click(timeout=3000)
                loc.first.fill("")
                loc.first.type(value, delay=20)
                log(f"UzupeĹ‚niono bio selektorem: {selector}")
                return
            except Exception as e:
                log(f"Selector {selector} nie zadziaĹ‚aĹ‚: {e}")

    raise RuntimeError("Nie znalazĹ‚em dziaĹ‚ajÄ…cego pola bio.")


def set_address(page, value, country="", _is_fallback=False):
    log("Szukam pola Address")

    selectors = [
        'label:has-text("Address") + input:not([disabled])',
        'label:has-text("City") + input:not([disabled])',
        'input[placeholder="Address"]:not([disabled])',
        'input[placeholder="City"]:not([disabled])',
        'input[placeholder*="city" i]:not([disabled])',
        'input[name="address"]:not([disabled])',
        'input[name="city"]:not([disabled])',
        'input[name*="city" i]:not([disabled])'
    ]

    suggestion_locators = [
        page.locator('ul li'),
        page.locator('[role="option"]'),
        page.locator('.autocomplete-item'),
    ]

    def _type_and_pick_suggestion(city_input, label):
        city_input.click(timeout=3000)
        city_input.fill("")
        city_input.type(value, delay=80)
        page.wait_for_timeout(2500)

        try:
            page.wait_for_selector('ul li', state='visible', timeout=3000)
            suggestions = page.locator('ul li')
            count = suggestions.count()
            clicked_text = None
            for i in range(count):
                li = suggestions.nth(i)
                text = li.inner_text().strip()
                if value.lower() in text.lower():
                    li.click()
                    clicked_text = text
                    break
            if clicked_text is None and count > 0:
                clicked_text = suggestions.first.inner_text().strip()
                suggestions.first.click()
            if clicked_text is not None:
                page.wait_for_timeout(SHORT_WAIT)
                log(f"UzupeĹ‚niono address/city ({label}), klikniÄ™to sugestiÄ™: '{clicked_text}'")
                return True
        except Exception as e:
            log(f"Playwright suggestion click failed: {e}")

        # Last-resort fallback: page-wide suggestion locators
        for suggestion_locator in suggestion_locators:
            try:
                if suggestion_locator.count() > 0:
                    first = suggestion_locator.first
                    text = first.inner_text().strip()
                    if text:
                        first.click(timeout=5000)
                        page.wait_for_timeout(SHORT_WAIT)
                        log(f"UzupeĹ‚niono address/city ({label}), klikniÄ™to sugestiÄ™: '{text}'")
                        return True
            except Exception:
                continue

        log(f"Brak sugestii autocomplete dla '{value}' ({label}) â€” zostawiam wpisany tekst")
        return False

    for selector in selectors:
        loc = page.locator(selector)
        count = loc.count()
        log(f"Selector address {selector} -> count={count}")
        if count > 0:
            _type_and_pick_suggestion(loc.first, f"selector={selector}")
            return

    # Fallback: find city input by position â€” it must be inside the profile form,
    # NOT the site search box at the top of the page.
    # The profile form is inside the main content area, after the selects.
    # We look for inputs that are siblings or near the country select element.
    city_input = None

    try:
        # Strategy: find the country select (nth(1)), then look for the next
        # visible text input that is a sibling or nearby in the DOM.
        city_input_js = page.evaluate("""
            () => {
                const selects = document.querySelectorAll('select');
                const countrySelect = selects[1];
                if (!countrySelect) return null;

                // Walk up to find a container, then search for inputs within it
                let container = countrySelect.parentElement;
                for (let i = 0; i < 5; i++) {
                    if (!container) break;
                    const inputs = Array.from(container.querySelectorAll(
                        'input:not([disabled]):not([type="hidden"]):not([type="email"]):not([type="password"]):not([type="submit"]):not([type="file"])'
                    ));
                    if (inputs.length > 0) {
                        inputs[0].setAttribute('data-bc-city-target', 'true');
                        return true;
                    }
                    container = container.parentElement;
                }
                return false;
            }
        """)

        if city_input_js:
            city_input = page.locator('input[data-bc-city-target="true"]').first
            log("Znaleziono pole city przez JS DOM traversal")
    except Exception as e:
        log(f"JS DOM traversal failed: {e}")

    if city_input is None:
        if not _is_fallback:
            capital = COUNTRY_CAPITALS.get(country, "")
            if capital and capital.lower() != value.lower():
                log(f"[FALLBACK] Miasto '{value}' nie znalezione, prĂłbujÄ™ stolicÄ™: {capital}")
                try:
                    return set_address(page, capital, country, _is_fallback=True)
                except Exception:
                    pass
        raise RuntimeError(f"Nie znalazĹ‚em pola address/city dla: {value}")

    _type_and_pick_suggestion(city_input, "JS DOM traversal fallback")


def set_language(page, country):
    country = canonical_country_name(country)
    log(f"Ustalam jÄ™zyk dla kraju: {country}")

    americas = {
        "United States of America",
        "Canada",
        "Mexico",
        "Brazil",
        "Argentina",
        "Chile",
        "Colombia",
        "Peru",
        "Venezuela",
        "Uruguay",
        "Paraguay",
        "Bolivia",
        "Ecuador",
        "Guyana",
        "Suriname",
        "Panama",
        "Costa Rica",
        "Guatemala",
        "Honduras",
        "Nicaragua",
        "El Salvador",
        "Belize",
        "Cuba",
        "Dominican Republic",
        "Haiti",
        "Jamaica"
    }

    if country in americas:
        language_label = "United States of America (us)"
    else:
        language_label = "United Kingdom (gb)"

    log(f"Ustawiam jÄ™zyk: {language_label}")

    selects = page.locator("select")
    count = selects.count()
    log(f"Liczba selectĂłw na stronie: {count}")
    if count < 1:
        raise RuntimeError("Nie znalazĹ‚em listy wyboru jÄ™zyka.")

    selects.nth(0).select_option(label=language_label)
    page.wait_for_timeout(SHORT_WAIT)
    log("Ustawiono jÄ™zyk")


def set_country(page, country):
    expected_country = canonical_country_name(country)
    expected_normalized = normalize_country_name(expected_country)
    log(f"Ustawiam kraj: {country} -> oczekiwany label portalu: {expected_country}")

    selects = page.locator("select")
    count = selects.count()
    log(f"Liczba selectĂłw na stronie: {count}")
    if count < 2:
        raise RuntimeError("Nie znalazĹ‚em listy wyboru kraju.")

    country_select = selects.nth(1)

    try:
        result = country_select.evaluate("""
            (select, expectedNormalized) => {
                const normalize = (value) => String(value || '').trim().replace(/\\s+/g, ' ').toLowerCase();
                const options = Array.from(select.options || []);
                const match = options.find(o => normalize(o.text) === expectedNormalized);
                if (match) {
                    select.value = match.value;
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    return match.text.trim();
                }
                return null;
            }
        """, expected_normalized)
    except Exception as e:
        log(f"Nie udaĹ‚o siÄ™ wykonaÄ‡ dokĹ‚adnego wyboru kraju: {e}")
        result = None

    if not result:
        message = (
            f"manual_required: nie znaleziono dokĹ‚adnej opcji kraju. "
            f"CSV='{country}', expected='{expected_country}'"
        )
        log(message)
        dump_page_state(page, "country_manual_required")
        raise ManualRequiredError(message)

    page.wait_for_timeout(SHORT_WAIT)
    selected_label = country_select.evaluate("""
        (select) => {
            const option = select.options[select.selectedIndex];
            return option ? option.text.trim() : '';
        }
    """)
    log(f"Wybrano kraj portalu: '{selected_label}'")

    if normalize_country_name(selected_label) != expected_normalized:
        message = (
            f"manual_required: wybrany kraj nie zgadza siÄ™ z oczekiwanym. "
            f"CSV='{country}', expected='{expected_country}', selected='{selected_label}'"
        )
        log(message)
        dump_page_state(page, "country_mismatch_manual_required")
        raise ManualRequiredError(message)

    log("Ustawiono kraj (exact normalized label)")

def upload_image(page, image_path):
    log(f"PrĂłbujÄ™ dodaÄ‡ zdjÄ™cie: {image_path}")

    raw_path = Path(str(image_path).strip())

    if raw_path.is_absolute():
        img = raw_path
    else:
        img = AVATAR_DIR / raw_path.name

    log(f"ĹšcieĹĽka koĹ„cowa zdjÄ™cia: {img}")

    if not img.exists():
        raise RuntimeError(f"Nie znaleziono pliku: {img}")

    file_input = page.locator('input[type="file"]')
    file_count = file_input.count()
    log(f"Liczba input[type=file]: {file_count}")

    if file_count == 0:
        raise RuntimeError("Nie znalazĹ‚em pola uploadu zdjÄ™cia.")

    file_input.first.set_input_files(str(img.resolve()))
    page.wait_for_timeout(MEDIUM_WAIT)
    log("Wgrano zdjÄ™cie")


def save_profile(page):
    log("PrĂłbujÄ™ zapisaÄ‡ profil")
    save_button = page.locator('button:has-text("Save changes")').first
    save_button.scroll_into_view_if_needed()
    page.wait_for_timeout(SHORT_WAIT)

    if not save_button.is_enabled():
        log("Przycisk Save changes jest disabled - brak nowych zmian w profilu")
        return "success", "brak zmian do zapisu"

    save_button.click(timeout=5000)
    page.wait_for_timeout(LONG_WAIT)

    try:
        success_box = page.locator('text="Data has been updated"')
        success_count = success_box.count()
        log(f"Liczba komunikatĂłw sukcesu: {success_count}")
        if success_count > 0:
            log("Wykryto komunikat sukcesu: Data has been updated")
            return "success", "profil zaktualizowany"
    except Exception as e:
        log(f"Nie udaĹ‚o siÄ™ sprawdziÄ‡ komunikatu sukcesu: {e}")

    body_text = page.locator("body").inner_text().lower()
    dump_page_state(page, "after_save")

    if "data has been updated" in body_text:
        log("Wykryto komunikat sukcesu w body")
        return "success", "profil zaktualizowany"

    import re
    if PROFILE_URL in page.url and re.search(r'\b([1-9]\d*)/1200\b', page.locator("body").inner_text()):
        log("Brak komunikatu sukcesu ale bio wypeĹ‚nione â€” traktujemy jako sukces")
        return "success", "profil zaktualizowany (bio wypeĹ‚nione)"

    return "unknown", f"nie wykryto potwierdzenia zapisu, URL: {page.url}"


def fill_profile(page, user):
    log(f"=== START PROFIL dla: {user['email']} ===")
    open_profile(page)
    set_bio(page, user["bio"])
    set_language(page, user["country"])
    set_country(page, user["country"])
    set_address(page, user["city"], user.get("country", ""))
    upload_image(page, user["image_path"])
    result = save_profile(page)
    log(f"=== KONIEC PROFIL dla: {user['email']} ===")
    return result


def main():
    users = read_users(INPUT_FILE)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS, slow_mo=150)

        for user in users:
            context = browser.new_context()
            page = context.new_page()

            try:
                log("------------------------------")
                log(f"Przetwarzam uĹĽytkownika: {user['email']}")
                login(page, user)
                status, message = fill_profile(page, user)
                log(f"Wynik: {status} | {message}")
                append_result(user, status, message)

                if status != "success":
                    log(f"PRZERWANIE FLOW | email={user['email']} | status={status} | message={message}")
                    raise SystemExit(1)

            except ManualRequiredError as e:
                err = f"MANUAL_REQUIRED: {e}"
                log(err)
                log(traceback.format_exc())
                append_result(user, "manual_required", str(e))
                raise SystemExit(1)

            except PlaywrightTimeoutError as e:
                err = f"TIMEOUT: {e}"
                log(err)
                log(traceback.format_exc())
                append_result(user, "timeout", str(e))
                raise SystemExit(1)

            except Exception as e:
                err = f"ERROR: {e}"
                log(err)
                log(traceback.format_exc())
                append_result(user, "error", str(e))
                raise SystemExit(1)

            finally:
                try:
                    context.close()
                except Exception:
                    pass

        browser.close()


if __name__ == "__main__":
    main()
