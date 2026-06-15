import shutil
import subprocess
import sys
import threading
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext

from bc_paths import AVATAR_DIR, COMPANIES_CSV, LOGO_DIR, BANNER_DIR, ROOT_DIR

FILL_COMPANY = ROOT_DIR / "fill_company.py"
FILL_COMPANY_STEP2 = ROOT_DIR / "fill_company_step2.py"
REGISTER = ROOT_DIR / "register.py"
FILL_PROFILE = ROOT_DIR / "fill_profile.py"

USERS_CSV = ROOT_DIR / "Data" / "input_package" / "users.csv"


def choose_file():
    path = filedialog.askopenfilename(
        title="Wybierz plik companies.csv",
        filetypes=[("CSV files", "*.csv")],
    )
    if path:
        selected_csv.set(path)


def choose_users_file():
    path = filedialog.askopenfilename(
        title="Wybierz plik users.csv",
        filetypes=[("CSV files", "*.csv")],
    )
    if path:
        selected_users_csv.set(path)


def choose_image(var, title):
    path = filedialog.askopenfilename(
        title=title,
        filetypes=[("Image files", "*.png *.jpg *.jpeg")],
    )
    if path:
        var.set(path)


def choose_package_folder():
    folder = filedialog.askdirectory(title="Wskaż folder paczki")
    if not folder:
        return
    pkg = Path(folder) / "_runtime_pkg"
    mapping = [
        ("users.csv",                             selected_users_csv),
        ("companies.csv",                         selected_csv),
        ("images/avatar/identity_001_avatar.png", selected_avatar),
        ("images/logo/identity_001_logo.png",     selected_logo),
        ("images/banner/identity_001_banner.png", selected_banner),
    ]
    loaded, missing = [], []
    for rel, var in mapping:
        path = pkg / rel
        if path.exists():
            var.set(str(path))
            loaded.append(rel)
        else:
            missing.append(rel)
    summary = f"[Paczka] Załadowano: {', '.join(loaded) or 'brak'}"
    if missing:
        summary += f" | Brak: {', '.join(missing)}"
    log(summary + "\n")


def validate_and_run(script_path):
    csv_path = selected_csv.get()
    if not csv_path:
        messagebox.showerror("Błąd", "Nie wybrano pliku CSV.")
        return
    shutil.copy(csv_path, COMPANIES_CSV)
    log(f"Skopiowano {csv_path} → {COMPANIES_CSV}\n")
    logo_path = selected_logo.get()
    if logo_path:
        dest = LOGO_DIR / Path(logo_path).name
        shutil.copy(logo_path, dest)
        log(f"Skopiowano logo → {dest}\n")
    banner_path = selected_banner.get()
    if banner_path:
        dest = BANNER_DIR / Path(banner_path).name
        shutil.copy(banner_path, dest)
        log(f"Skopiowano banner → {dest}\n")
    threading.Thread(target=run_script, args=(script_path,), daemon=True).start()


def validate_and_run_users(script_path):
    csv_path = selected_users_csv.get()
    if not csv_path:
        messagebox.showerror("Błąd", "Nie wybrano pliku users.csv.")
        return
    USERS_CSV.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(csv_path, USERS_CSV)
    log(f"Skopiowano {csv_path} → {USERS_CSV}\n")
    avatar_path = selected_avatar.get()
    if avatar_path:
        AVATAR_DIR.mkdir(parents=True, exist_ok=True)
        dest = AVATAR_DIR / Path(avatar_path).name
        shutil.copy(avatar_path, dest)
        log(f"Skopiowano avatar → {dest}\n")
    threading.Thread(target=run_script, args=(script_path,), daemon=True).start()


def run_script(script_path):
    log(f"Uruchamiam: {script_path.name}\n")
    try:
        proc = subprocess.Popen(
            [sys.executable, str(script_path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            cwd=str(ROOT_DIR),
        )
        for line in proc.stdout:
            log(line)
        proc.wait()
        log(f"\n[Zakończono z kodem {proc.returncode}]\n")
    except Exception as exc:
        log(f"[Błąd]: {exc}\n")


def log(text):
    log_area.config(state=tk.NORMAL)
    log_area.insert(tk.END, text)
    log_area.see(tk.END)
    log_area.config(state=tk.DISABLED)
    _log_file.write(text)
    _log_file.flush()


root = tk.Tk()
root.title("BC Manual Runner")
root.geometry("780x440")
root.resizable(False, False)

selected_csv = tk.StringVar()
selected_users_csv = tk.StringVar()
selected_avatar = tk.StringVar()
selected_logo = tk.StringVar()
selected_banner = tk.StringVar()

_log_dir = ROOT_DIR / "logs" / "manual_runner"
_log_dir.mkdir(parents=True, exist_ok=True)
_log_file = open(
    _log_dir / f"manual_runner_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.log",
    "w",
    encoding="utf-8",
)

# --- Package folder picker ---
pkg_folder_frame = tk.Frame(root, pady=6, padx=8)
pkg_folder_frame.pack(fill=tk.X)

tk.Button(
    pkg_folder_frame,
    text="Wskaż folder paczki",
    command=choose_package_folder,
    bg="#2c3e50",
    fg="white",
    width=22,
).pack(side=tk.LEFT, padx=(0, 6))
tk.Label(pkg_folder_frame, text="Automatycznie ładuje users.csv, companies.csv, avatar, logo, banner z _runtime_pkg", fg="gray", font=("TkDefaultFont", 8)).pack(side=tk.LEFT)

# --- File picker row (companies.csv) ---
file_frame = tk.Frame(root, pady=6, padx=8)
file_frame.pack(fill=tk.X)

tk.Label(file_frame, text="Plik companies.csv:").pack(side=tk.LEFT)
tk.Button(file_frame, text="Wybierz plik", command=choose_file).pack(side=tk.LEFT, padx=6)
tk.Label(file_frame, textvariable=selected_csv, fg="navy", wraplength=360, anchor="w").pack(
    side=tk.LEFT, fill=tk.X, expand=True
)

# --- File picker row (users.csv) ---
users_frame = tk.Frame(root, pady=2, padx=8)
users_frame.pack(fill=tk.X)

tk.Label(users_frame, text="Plik users.csv:      ").pack(side=tk.LEFT)
tk.Button(users_frame, text="Wybierz plik", command=choose_users_file).pack(side=tk.LEFT, padx=6)
tk.Label(users_frame, textvariable=selected_users_csv, fg="navy", wraplength=360, anchor="w").pack(
    side=tk.LEFT, fill=tk.X, expand=True
)

# --- Avatar picker row ---
avatar_frame = tk.Frame(root, pady=2, padx=8)
avatar_frame.pack(fill=tk.X)

tk.Label(avatar_frame, text="Plik avatar:        ").pack(side=tk.LEFT)
tk.Button(avatar_frame, text="Wybierz avatar", command=lambda: choose_image(selected_avatar, "Wybierz avatar")).pack(side=tk.LEFT, padx=6)
tk.Label(avatar_frame, textvariable=selected_avatar, fg="navy", wraplength=360, anchor="w").pack(
    side=tk.LEFT, fill=tk.X, expand=True
)

# --- Logo picker row ---
logo_frame = tk.Frame(root, pady=2, padx=8)
logo_frame.pack(fill=tk.X)

tk.Label(logo_frame, text="Plik logo:          ").pack(side=tk.LEFT)
tk.Button(logo_frame, text="Wybierz logo", command=lambda: choose_image(selected_logo, "Wybierz logo")).pack(side=tk.LEFT, padx=6)
tk.Label(logo_frame, textvariable=selected_logo, fg="navy", wraplength=360, anchor="w").pack(
    side=tk.LEFT, fill=tk.X, expand=True
)

# --- Banner picker row ---
banner_frame = tk.Frame(root, pady=2, padx=8)
banner_frame.pack(fill=tk.X)

tk.Label(banner_frame, text="Plik banner:      ").pack(side=tk.LEFT)
tk.Button(banner_frame, text="Wybierz banner", command=lambda: choose_image(selected_banner, "Wybierz banner")).pack(side=tk.LEFT, padx=6)
tk.Label(banner_frame, textvariable=selected_banner, fg="navy", wraplength=360, anchor="w").pack(
    side=tk.LEFT, fill=tk.X, expand=True
)

# --- Action buttons row ---
btn_frame = tk.Frame(root, pady=4, padx=8)
btn_frame.pack(fill=tk.X)

tk.Button(
    btn_frame,
    text="REGISTER USERS",
    width=22,
    bg="#e67e22",
    fg="white",
    command=lambda: validate_and_run_users(REGISTER),
).pack(side=tk.LEFT, padx=(0, 6))

tk.Button(
    btn_frame,
    text="FILL USER PROFILES",
    width=22,
    bg="#8e44ad",
    fg="white",
    command=lambda: validate_and_run_users(FILL_PROFILE),
).pack(side=tk.LEFT, padx=(0, 6))

tk.Button(
    btn_frame,
    text="FILL COMPANY (krok 1)",
    width=22,
    bg="#4a90d9",
    fg="white",
    command=lambda: validate_and_run(FILL_COMPANY),
).pack(side=tk.LEFT, padx=(0, 6))

tk.Button(
    btn_frame,
    text="FILL COMPANY STEP 2",
    width=22,
    bg="#27ae60",
    fg="white",
    command=lambda: validate_and_run(FILL_COMPANY_STEP2),
).pack(side=tk.LEFT)

# --- Log area ---
log_frame = tk.Frame(root, padx=8, pady=4)
log_frame.pack(fill=tk.BOTH, expand=True)

tk.Label(log_frame, text="Log:", anchor="w").pack(fill=tk.X)
log_area = scrolledtext.ScrolledText(log_frame, state=tk.DISABLED, height=16, font=("Consolas", 9))
log_area.pack(fill=tk.BOTH, expand=True)

root.mainloop()
