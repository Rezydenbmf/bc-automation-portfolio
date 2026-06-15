import csv
import logging
import traceback
import tkinter as tk
import winsound
import os
from datetime import datetime
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from bc_paths import (
    COMPANIES_CSV,
    COMPANY_RESULTS_CSV,
    LOGS_DIR as SHARED_LOGS_DIR,
    FILLATOR_POPUP_IMAGE,
    LOGO_DIR,
    BANNER_DIR,
)

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
ADD_COMPANY_URL = os.getenv("BC_COMPANY_URL", "https://example.com/company")

if getattr(sys, "frozen", False):
    BASE_DIR = Path.cwd()
else:
    BASE_DIR = Path(__file__).resolve().parent

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(BASE_DIR / "playwright_browsers")

INPUT_FILE = COMPANIES_CSV
RESULTS_FILE = COMPANY_RESULTS_CSV
HEADLESS = False

LOGS_DIR = SHARED_LOGS_DIR
LOGS_DIR.mkdir(exist_ok=True)

_run_ts = datetime.now()
LOG_FILE = LOGS_DIR / f"fill_company_{_run_ts.strftime('%Y-%m-%d')}.log"
with open(LOG_FILE, "a", encoding="utf-8") as _f:
    _f.write(f"\n=== RUN {_run_ts.strftime('%Y-%m-%d %H:%M:%S')} ===\n")

SHORT_WAIT = 700
MEDIUM_WAIT = 1200
LONG_WAIT = 2000

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


CITY_ALIASES = {
    "zurich": ["zĂĽrich"],
    "munich": ["mĂĽnchen"],
    "sao paulo": ["sĂŁo paulo"],
    "bengaluru": ["bangalore"],
}


def normalize_city_label(value):
    import re
    import unicodedata

    if value is None:
        return ""

    text = str(value).strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))

    text = text.replace("'", " ")
    text = text.replace("â€™", " ")
    text = text.replace("-", " ")
    text = text.replace(".", " ")

    text = re.sub(r"\s+", " ", text).strip()
    return text


def get_city_search_variants(city):
    raw = str(city).strip()
    normalized = normalize_city_label(raw)

    variants = []
    seen_exact = set()

    for candidate in [raw, *CITY_ALIASES.get(normalized, [])]:
        candidate = str(candidate).strip()
        if not candidate:
            continue

        candidate_key = candidate.lower()
        if candidate_key in seen_exact:
            continue

        seen_exact.add(candidate_key)
        variants.append(candidate)

    return variants


def wait_for_manual_funds_confirmation(emails):
    popup = tk.Tk()
    popup.title("RÄ™czne doĹ‚adowanie Ĺ›rodkĂłw")
    popup.geometry("1090x730")
    popup.resizable(False, False)
    popup.attributes("-topmost", True)
    popup.after(100, lambda: popup.attributes("-topmost", True))
    popup.after(150, lambda: popup.lift())
    popup.after(200, lambda: popup.focus_force())
    winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)

    main_frame = tk.Frame(popup, padx=25, pady=20)
    main_frame.pack(fill="both", expand=True)

    top_frame = tk.Frame(main_frame)
    top_frame.pack(fill="both", expand=True)

    left_frame = tk.Frame(top_frame)
    left_frame.pack(side="left", fill="both", expand=True, padx=(0, 20))

    right_frame = tk.Frame(top_frame, width=320)
    right_frame.pack(side="right", fill="y")
    right_frame.pack_propagate(False)

    tk.Label(
        left_frame,
        text="FILLATOR 2077\n\nUzupeĹ‚nij Ĺ›rodki na poniĹĽszych kontach.\nZaznacz kaĹĽde konto po doĹ‚adowaniu.",
        justify="left",
        font=("Segoe UI", 30, "bold"),
        anchor="w"
    ).pack(anchor="w", pady=(0, 20))

    vars_list = []

    button_holder = tk.Frame(right_frame)
    button_holder.pack(side="bottom", fill="x", pady=(12, 0))

    def refresh_button_state():
        if all(var.get() for _, var in vars_list):
            continue_button.config(state="normal")
        else:
            continue_button.config(state="disabled")

    checks_container = tk.Frame(left_frame)
    checks_container.pack(fill="both", expand=True, anchor="w")

    checks_canvas = tk.Canvas(checks_container, highlightthickness=0)
    scrollbar = tk.Scrollbar(checks_container, orient="vertical", command=checks_canvas.yview)
    checks_frame = tk.Frame(checks_canvas)

    def _on_frame_configure(event):
        checks_canvas.configure(scrollregion=checks_canvas.bbox("all"))

    def _on_canvas_configure(event):
        checks_canvas.itemconfig(checks_window, width=event.width)

    checks_frame.bind("<Configure>", _on_frame_configure)

    checks_window = checks_canvas.create_window((0, 0), window=checks_frame, anchor="nw")
    checks_canvas.configure(yscrollcommand=scrollbar.set)
    checks_canvas.bind("<Configure>", _on_canvas_configure)

    checks_canvas.pack(side="left", fill="both", expand=True)
    scrollbar.pack(side="right", fill="y")

    unique_emails = []
    seen_emails = set()

    for email in emails:
        normalized_email = str(email).strip().lower()
        if not normalized_email:
            continue
        if normalized_email in seen_emails:
            continue
        seen_emails.add(normalized_email)
        unique_emails.append(str(email).strip())

    for email in unique_emails:
        var = tk.BooleanVar(value=False)
        chk = tk.Checkbutton(
            checks_frame,
            text=email,
            variable=var,
            command=refresh_button_state,
            anchor="w",
            justify="left",
            font=("Segoe UI", 24)
        )
        chk.pack(fill="x", pady=10, anchor="w")
        vars_list.append((email, var))

    image_path = FILLATOR_POPUP_IMAGE
    if image_path.exists():
        try:
            popup.fillator_img = tk.PhotoImage(file=str(image_path))
            tk.Label(right_frame, image=popup.fillator_img).pack(anchor="n")
        except Exception as e:
            log(f"Nie udaĹ‚o siÄ™ wczytaÄ‡ obrazka popupu: {e}")
    else:
        log(f"Nie znaleziono obrazka popupu: {image_path}")

    continue_button = tk.Button(
        button_holder,
        text="KONTYNUUJ",
        state="disabled",
        command=popup.destroy,
        font=("Segoe UI", 20, "bold"),
        padx=28,
        pady=14
    )
    continue_button.pack(anchor="center")

    popup.mainloop()


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
        dump_page_state(page, "login_page_loaded")

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


def open_add_company(page):
    log("PrzechodzÄ™ na stronÄ™ add company")
    page.goto(ADD_COMPANY_URL, wait_until="domcontentloaded")
    page.wait_for_timeout(MEDIUM_WAIT)
    dump_page_state(page, "add_company_loaded")


def fill_input(page, selector, value, label):
    log(f"UzupeĹ‚niam pole: {label} = {value}")
    loc = page.locator(selector).first
    loc.click(timeout=5000)
    loc.fill("")
    loc.type(value, delay=20)


def select_country(page, country):
    log(f"Ustawiam kraj z CSV: {country}")

    country_aliases = {
        "United States": "United States of America",
    }

    variants = [country]
    if country in country_aliases:
        variants.append(country_aliases[country])

    selects = page.locator("select")
    count = selects.count()
    log(f"Liczba selectĂłw na stronie: {count}")
    if count < 1:
        raise RuntimeError("Nie znalazĹ‚em listy wyboru kraju.")

    last_error = None

    for variant in variants:
        try:
            log(f"PrĂłba wyboru kraju wariantem: {variant}")
            selects.first.select_option(label=variant)
            page.wait_for_timeout(SHORT_WAIT)
            log(f"Wybrano kraj portalu: {variant}")
            return
        except Exception as e:
            last_error = e
            log(f"Nie udaĹ‚o siÄ™ wybraÄ‡ kraju wariantem '{variant}': {e}")

    raise RuntimeError(
        f"Nie udaĹ‚o siÄ™ ustawiÄ‡ kraju. CSV='{country}', variants={variants}, last_error={last_error}"
    )


def upload_file(page, file_path, label):
    log(f"PrĂłbujÄ™ wgraÄ‡ plik {label}: {file_path}")

    raw_path = Path(str(file_path).strip())

    if raw_path.is_absolute():
        p = raw_path
    else:
        normalized = str(file_path).replace("\\", "/").strip().lower()

        if label == "logo":
            if normalized.startswith("images/"):
                p = LOGO_DIR / Path(normalized).name
            else:
                p = LOGO_DIR / raw_path.name
        elif label == "banner":
            if normalized.startswith("images/"):
                p = BANNER_DIR / Path(normalized).name
            else:
                p = BANNER_DIR / raw_path.name
        else:
            p = raw_path

    log(f"ĹšcieĹĽka koĹ„cowa dla {label}: {p}")

    if not p.exists():
        raise RuntimeError(f"Nie znaleziono pliku {label}: {p}")

    file_inputs = page.locator('input[type="file"]')
    count = file_inputs.count()
    log(f"Liczba input[type=file]: {count}")

    if count == 0:
        raise RuntimeError(f"Nie znalazĹ‚em pola uploadu dla {label}.")

    return p, count


def upload_logo(page, file_path):
    resolved_path, _ = upload_file(page, file_path, "logo")
    file_inputs = page.locator('input[type="file"]')
    file_inputs.nth(0).set_input_files(str(resolved_path.resolve()))
    page.wait_for_timeout(MEDIUM_WAIT)
    log("Wgrano logo")


def upload_banner(page, file_path):
    resolved_path, count = upload_file(page, file_path, "banner")
    file_inputs = page.locator('input[type="file"]')
    index = 1 if count > 1 else 0
    file_inputs.nth(index).set_input_files(str(resolved_path.resolve()))
    page.wait_for_timeout(MEDIUM_WAIT)
    log("Wgrano banner")


def fill_description(page, value):
    log("UzupeĹ‚niam opis firmy")
    selectors = [
        'textarea',
        '[contenteditable="true"]'
    ]

    for selector in selectors:
        loc = page.locator(selector)
        count = loc.count()
        log(f"Selector description {selector} -> count={count}")
        if count > 0:
            try:
                loc.first.click(timeout=3000)
                loc.first.fill("")
                loc.first.type(value, delay=15)
                log(f"UzupeĹ‚niono opis selektorem: {selector}")
                return
            except Exception as e:
                log(f"Selector opisu {selector} nie zadziaĹ‚aĹ‚: {e}")

    raise RuntimeError("Nie znalazĹ‚em pola opisu firmy.")


def click_confirm(page):
    log("Klikam Confirm")
    btn = page.locator('button:has-text("Confirm")').first
    btn.scroll_into_view_if_needed()
    page.wait_for_timeout(SHORT_WAIT)
    btn.click(timeout=5000)
    page.wait_for_timeout(LONG_WAIT)


def detect_result(page):
    body_text = page.locator("body").inner_text()
    current_url = page.url.lower()

    if "/control-panel/my-companies" in current_url:
        return "success", "firma utworzona"

    dump_page_state(page, "after_confirm")

    if "Fill in the city!" in body_text:
        raise RuntimeError("Company form validation failed: portal returned 'Fill in the city!'.")

    body_text_lower = body_text.lower()

    if "success" in body_text_lower or "company has been created" in body_text_lower or "added" in body_text_lower:
        return "success", "firma utworzona"

    if "error" in body_text_lower or "required" in body_text_lower or "invalid" in body_text_lower:
        return "error", "formularz zwrĂłciĹ‚ bĹ‚Ä…d"

    return "unknown", f"nie wykryto jednoznacznego wyniku, URL: {page.url}"


def select_city(page, city, country="", _is_fallback=False):
    if _is_fallback:
        log(f"[FALLBACK] PrĂłbujÄ™ miasto zastÄ™pcze: {city}")
    log(f"Ustawiam miasto z CSV: {city}")
    normalized_input = normalize_city_label(city)
    search_variants = get_city_search_variants(city)
    log(f"City znormalizowane: {normalized_input}")
    log(f"Warianty wyszukiwania city: {search_variants}")

    loc = page.locator('input[placeholder="Enter text..."]').first

    candidate_locators = [
        page.locator('[role="option"]'),
        page.locator('[role="listbox"] [role="option"]'),
        page.locator('ul[role="listbox"] li'),
        page.locator('div[role="listbox"] div'),
        page.locator('li'),
    ]

    suggestion_locators = [
        page.locator('ul li'),
        page.locator('[role="option"]'),
        page.locator('.autocomplete-item'),
    ]

    for variant in search_variants:
        log(f"PrĂłba wyszukania city wariantem: {variant}")

        loc.click(timeout=5000)
        loc.fill("")
        loc.type(variant[:8], delay=80)
        page.wait_for_timeout(4000)

        debug_selectors = [
            ('[role="option"]', page.locator('[role="option"]')),
            ('[role="listbox"] [role="option"]', page.locator('[role="listbox"] [role="option"]')),
            ('ul[role="listbox"] li', page.locator('ul[role="listbox"] li')),
            ('div[role="listbox"] div', page.locator('div[role="listbox"] div')),
            ('ul li', page.locator('ul li')),
            ('li', page.locator('li')),
            ('.autocomplete-item', page.locator('.autocomplete-item')),
        ]
        for sel_name, sel_loc in debug_selectors:
            try:
                cnt = sel_loc.count()
                if cnt > 0:
                    texts = []
                    for i in range(min(cnt, 10)):
                        try:
                            t = sel_loc.nth(i).inner_text().strip()
                            texts.append(repr(t))
                        except Exception:
                            texts.append("<bĹ‚Ä…d odczytu>")
                    log(f"[DEBUG city] '{sel_name}' -> {cnt} elementĂłw: {', '.join(texts)}")
                else:
                    log(f"[DEBUG city] '{sel_name}' -> 0 elementĂłw")
            except Exception as _e:
                log(f"[DEBUG city] '{sel_name}' -> wyjÄ…tek: {_e}")
        # --- koniec DEBUG ---

        first_suggestion = None

        # Najpierw szukaj w ul li (potwierdzone przez debug), z dopasowaniem po tekĹ›cie
        ul_li_loc = page.locator('ul li')
        try:
            ul_li_count = ul_li_loc.count()
            if ul_li_count > 0:
                matched = None
                for i in range(ul_li_count):
                    try:
                        t = ul_li_loc.nth(i).inner_text().strip()
                        if normalize_city_label(t) == normalized_input:
                            matched = (ul_li_loc.nth(i), t)
                            break
                    except Exception:
                        continue
                if matched is None:
                    first_text = ul_li_loc.first.inner_text().strip()
                    matched = (ul_li_loc.first, first_text)
                first_suggestion = matched
        except Exception:
            pass

        # Fallback: pozostaĹ‚e selektory jeĹ›li ul li nic nie zwrĂłciĹ‚o
        if first_suggestion is None:
            for suggestion_locator in suggestion_locators:
                try:
                    count = suggestion_locator.count()
                    if count > 0:
                        candidate = suggestion_locator.first
                        text = candidate.inner_text().strip()
                        if text:
                            first_suggestion = (candidate, text)
                            break
                except Exception:
                    continue

        if first_suggestion is not None:
            item, portal_label = first_suggestion
            log(f"Klikam pierwszÄ… sugestiÄ™ autocomplete: '{portal_label}'")
            item.click(timeout=5000)
            page.wait_for_timeout(SHORT_WAIT)

            final_value = loc.input_value().strip()
            log(
                f"Finalnie wybrana etykieta portalu: '{portal_label}' | "
                f"wartoĹ›Ä‡ inputa po klikniÄ™ciu: '{final_value}'"
            )
            return

    if not _is_fallback:
        capital = COUNTRY_CAPITALS.get(country, "")
        if capital and capital.lower() != city.lower():
            log(f"[FALLBACK] Miasto '{city}' nie znalezione, prĂłbujÄ™ stolicÄ™: {capital}")
            try:
                return select_city(page, capital, country, _is_fallback=True)
            except Exception:
                pass
    raise RuntimeError(
        f"Nie udaĹ‚o siÄ™ dopasowaÄ‡ miasta do etykiety portalu. "
        f"CSV='{city}', normalized='{city.lower()}', fallback_tried='{COUNTRY_CAPITALS.get(country, 'brak')}'"
    )


def fill_company(page, row):
    log(f"=== START COMPANY dla: {row['email']} ===")
    open_add_company(page)

    fill_input(page, 'input[placeholder="Company Name"]', row["company_name"], "company_name")

    prefix_locator = page.locator('input[placeholder="Company Prefix"]')
    prefix_count = prefix_locator.count()
    log(f"Liczba pĂłl Company Prefix: {prefix_count}")

    if prefix_count > 0:
        fill_input(page, 'input[placeholder="Company Prefix"]', row["company_prefix"], "company_prefix")
    else:
        log("Pole Company Prefix nie istnieje w aktualnym formularzu - pomijam ten krok")

    select_country(page, row["country"])
    select_city(page, row["city"], row.get("country", ""))

    postal_locator = page.locator('input[placeholder="Enter postal code"]')
    street_locator = page.locator('input[placeholder="Enter street"]')
    apartment_locator = page.locator('input[placeholder="Enter number/apartment"]')
    address_locator = page.locator('input[placeholder="Address"]')

    log(
        f"Liczba pĂłl adresowych: postal={postal_locator.count()}, "
        f"street={street_locator.count()}, apartment={apartment_locator.count()}, "
        f"address={address_locator.count()}"
    )

    if postal_locator.count() > 0:
        fill_input(page, 'input[placeholder="Enter postal code"]', row["postal_code"], "postal_code")

    if street_locator.count() > 0:
        fill_input(page, 'input[placeholder="Enter street"]', row["street"], "street")

    if apartment_locator.count() > 0:
        fill_input(page, 'input[placeholder="Enter number/apartment"]', row["apartment_number"], "apartment_number")

    if address_locator.count() > 0:
        combined_address = (str(row.get("street", "")).strip() + " " + str(row.get("apartment_number", "")).strip()).strip()
        log(f"UzupeĹ‚niam pole Address (combined): {combined_address}")
        fill_input(page, 'input[placeholder="Address"]', combined_address, "address")
    selects = page.locator("select")
    if selects.count() >= 3:
        main_category = row["main_category"].strip()
        subcategory = row["subcategory"].strip()

        if not main_category or not subcategory:
            raise ValueError("Brak main_category lub subcategory w companies.csv")

        log(f"WybĂłr kategorii: main='{main_category}', sub='{subcategory}'")
        CATEGORY_ALIASES = {
            "For companies": "Business Services",
            "Gastronomy": "Catering",
            "Groceries": "Grocery Products",
            "Grocery products": "Grocery Products",
            "Banki": "Banks",
            "banki": "Banks",
        }

        def apply_alias(value):
            if value in CATEGORY_ALIASES:
                mapped = CATEGORY_ALIASES[value]
                log(f"Category alias applied: {value} -> {mapped}")
                return mapped
            return value

        def fuzzy_match(target, options):
            t = target.lower()
            t_words = [w for w in t.split() if len(w) > 3]
            for opt in options:
                if opt.lower() == t:
                    return opt
            for opt in options:
                o = opt.lower()
                if all(w in o for w in t.split()):
                    return opt
            for opt in options:
                o_words = opt.lower().split()
                if all(w in t for w in o_words):
                    return opt
            for opt in options:
                o = opt.lower()
                if any(w in o for w in t_words):
                    return opt
            return None

        main_category = apply_alias(main_category)
        subcategory = apply_alias(subcategory)

        selects.nth(1).click()
        page.wait_for_timeout(2000)
        main_options = page.evaluate("Array.from(document.querySelectorAll('select')[1].options).map(o => o.text)")
        matched_main = fuzzy_match(main_category, main_options)
        if matched_main:
            log(f"Category matched: '{main_category}' -> '{matched_main}'")
            selects.nth(1).select_option(label=matched_main)
            page.wait_for_timeout(3000)
            sub_options = page.evaluate("Array.from(document.querySelectorAll('select')[2].options).map(o => o.text)")
            matched_sub = fuzzy_match(subcategory, sub_options)
            if matched_sub:
                log(f"Category matched: '{subcategory}' -> '{matched_sub}'")
                selects.nth(2).select_option(label=matched_sub)
            else:
                log(f"SUBCATEGORY NOT FOUND: '{subcategory}'")
            page.wait_for_timeout(SHORT_WAIT)
        else:
            log(f"MAIN CATEGORY NOT FOUND: '{main_category}'")

    upload_logo(page, row["logo_path"])
    upload_banner(page, row["banner_path"])

    fill_description(page, "Company profile is currently being completed.")
    click_confirm(page)

    result = detect_result(page)
    log(f"=== KONIEC COMPANY dla: {row['email']} ===")
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
                log(f"Przetwarzam firmÄ™ dla uĹĽytkownika: {row['email']}")
                login(page, row)
                status, message = fill_company(page, row)
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
