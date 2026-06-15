#!/usr/bin/env python3
"""
BC Automation — GUI v2
Light-theme Tkinter app for generating BC packages.

Run with:  python gui_app_v2.py
"""

import json
import random
import re
import subprocess
import threading
import time
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox
from tkinter.scrolledtext import ScrolledText

# pip install Pillow
from PIL import Image, ImageTk

import openai_helper
from openai_helper import assemble_packages
import company_registry

# ─────────────────────────────────────────────────────────────────────────────
# ASSETS
# ─────────────────────────────────────────────────────────────────────────────
_HERE     = Path(__file__).resolve().parent
_ASYSTENT = _HERE / "input_package_generator" / "Asystent Paczek"

IMG_APP     = _ASYSTENT / "fillator_app.png"
IMG_SUCCESS = _ASYSTENT / "fillator_sukces.png"

# ─────────────────────────────────────────────────────────────────────────────
# THEME  (light)
# ─────────────────────────────────────────────────────────────────────────────
BG    = "#f0f4f8"
PANEL = "#ffffff"
FIELD = "#e8ecf0"
BLUE  = "#0969da"
GREEN = "#1a7f37"
RED   = "#cf222e"
GOLD  = "#9a6700"
TEXT  = "#1f2328"
MUTED = "#656d76"
FONT  = "Consolas"

HURDLE_PENDING = "#8b949e"
HURDLE_DONE    = "#1a7f37"

SPINNER_CHARS = ["◐", "◓", "◑", "◒"]

# jump arc: y-offsets (negative = up) over 9 frames
JUMP_ARC = [0, -4, -8, -12, -14, -12, -8, -4, 0]


# ─────────────────────────────────────────────────────────────────────────────
# MOCK FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

# TODO: replace with real OpenAI API call
def _mock_identity(params: dict) -> dict:
    time.sleep(random.uniform(1.2, 2.0))
    return {
        "company_name": "Lumex Consulting Group",
        "industry": "Business Consulting",
        "main_category": "Professional Services",
        "subcategory": "Management Consulting",
        "description": (
            "A global consulting firm specialising in digital transformation "
            "and operational excellence."
        ),
        "founder": {
            "first_name": "Alexandra",
            "last_name": "Torres",
            "gender": "female",
            "ethnicity": "Hispanic",
        },
        "brand_colors": {"primary": "#1a237e", "secondary": "#e3f2fd"},
        "tone": "professional, innovative, trustworthy",
        "generated_by": "MOCK",
        "status": "ok",
    }


# TODO: replace with real OpenAI API call
def _mock_expansion(params: dict) -> dict:
    time.sleep(random.uniform(1.2, 2.0))
    n = params.get("num_locations", 3)
    all_locations = [
        {"city": "New York",  "country": "USA",        "address": "350 Fifth Ave, Suite 4100",  "lat":  40.7484, "lng":  -73.9967},
        {"city": "London",    "country": "UK",          "address": "1 Canada Square, E14 5AB",   "lat":  51.5047, "lng":   -0.0197},
        {"city": "Singapore", "country": "Singapore",   "address": "1 Raffles Place #20-61",      "lat":   1.2844, "lng":  103.8513},
        {"city": "Dubai",     "country": "UAE",         "address": "DIFC Gate Building, L5",     "lat":  25.2092, "lng":   55.2742},
        {"city": "Tokyo",     "country": "Japan",       "address": "1-1-2 Otemachi, Chiyoda",    "lat":  35.6863, "lng":  139.7642},
        {"city": "Sydney",    "country": "Australia",   "address": "1 Martin Place, Level 20",   "lat": -33.8674, "lng":  151.2070},
        {"city": "Toronto",   "country": "Canada",      "address": "100 King St W, Suite 5600",  "lat":  43.6481, "lng":  -79.3820},
        {"city": "Berlin",    "country": "Germany",     "address": "Unter den Linden 26-30",     "lat":  52.5170, "lng":   13.3889},
        {"city": "São Paulo", "country": "Brazil",      "address": "Av. Paulista 1374, 16° and", "lat": -23.5614, "lng":  -46.6561},
        {"city": "Nairobi",   "country": "Kenya",       "address": "Upper Hill Road, Kilimani",  "lat":  -1.2921, "lng":   36.8219},
    ]
    return {
        "base_company": "Lumex Consulting Group",
        "target_company_count": params.get("num_companies", 5),
        "locations": all_locations[:n],
        "generated_by": "MOCK",
        "status": "ok",
    }


# TODO: replace with real OpenAI API call
def _mock_graphics(params: dict) -> dict:
    time.sleep(random.uniform(1.5, 2.5))
    return {
        "avatar": "identity_001_avatar.png",
        "logo":   "identity_001_logo.png",
        "banner": "identity_001_banner.png",
        "style":  "modern minimalist, dark blue palette",
        "prompt_used": (
            "Professional consulting firm logo, dark navy and electric blue, "
            "geometric shapes, sans-serif wordmark"
        ),
        "generated_by": "MOCK",
        "status": "ok",
    }


# TODO: replace with real OpenAI API call
def _mock_packages(params: dict) -> dict:
    time.sleep(random.uniform(0.8, 1.4))
    n = params.get("num_companies", 3)
    return {
        "packages_created": n,
        "folders": [f"{str(i + 1).zfill(3)}_lumex_location_{i + 1}/" for i in range(n)],
        "files_per_package": [
            "identity_profile.json",
            "expansion_request.json",
            "identity_001_avatar.png",
            "identity_001_logo.png",
            "identity_001_banner.png",
        ],
        "generated_by": "MOCK",
        "status": "ok",
    }


def _run_packages(params: dict) -> dict:
    step_results = params.get("_step_results", [])
    identity = step_results[0] if len(step_results) > 0 else {}
    expansion = step_results[1] if len(step_results) > 1 else {}
    images = step_results[2] if len(step_results) > 2 else {}
    output_folder = params.get("output_folder", Path("output") / "package")
    return assemble_packages(identity, expansion, images, Path(output_folder))


STEPS = [
    {"icon": "🏢", "name": "identity_profile.json",  "desc": "Generate company identity",       "fn": _mock_identity},
    {"icon": "🌍", "name": "expansion_request.json", "desc": "Plan expansion locations",        "fn": _mock_expansion},
    {"icon": "🎨", "name": "Graphics",               "desc": "Generate avatar / logo / banner", "fn": _mock_graphics},
    {"icon": "📦", "name": "Input packages",         "desc": "Assemble final packages",         "fn": _run_packages},
]

LAUNCHER_SCRIPT = Path(__file__).resolve().parent / "launcher_orchestrator.py"


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _load_image(path: Path, max_w: int, max_h: int) -> ImageTk.PhotoImage | None:
    """Load a PNG with PIL and resize to fit within max_w × max_h (aspect-ratio preserved)."""
    if not path.exists():
        return None
    try:
        img = Image.open(str(path))
        img.thumbnail((max_w, max_h), Image.LANCZOS)
        return ImageTk.PhotoImage(img)
    except Exception:
        return None


def _load_image_cover(path: Path, w: int, h: int) -> ImageTk.PhotoImage | None:
    """Load a PNG and resize/crop to cover exactly w × h (fills completely, crops if needed)."""
    if not path.exists() or w < 1 or h < 1:
        return None
    try:
        img    = Image.open(str(path))
        iw, ih = img.size
        scale  = max(w / iw, h / ih)
        new_w  = int(iw * scale)
        new_h  = int(ih * scale)
        img    = img.resize((new_w, new_h), Image.LANCZOS)
        left   = (new_w - w) // 2
        top    = (new_h - h) // 2
        img    = img.crop((left, top, left + w, top + h))
        return ImageTk.PhotoImage(img)
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# APPLICATION
# ─────────────────────────────────────────────────────────────────────────────

class BCAutomationApp:

    # ── init ─────────────────────────────────────────────────────────────────
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("BC Automation v2")
        self.root.configure(bg=BG)
        self.root.geometry("1100x720")
        self.root.minsize(860, 600)

        # form variables
        self.num_companies = tk.IntVar(value=1)
        self.num_locations = tk.IntVar(value=1)
        self.industry_div  = tk.BooleanVar(value=False)
        self.mode          = tk.StringVar(value="auto")
        self.mock_mode     = tk.BooleanVar(value=False)

        # runtime state
        self._params: dict               = {}
        self._stop_flag                  = False
        self._approve_event              = threading.Event()
        self._step_results: list[dict | None] = [None] * len(STEPS)
        self._output_path: Path | None   = None

        # track animation
        self._runner_pos      = 0.0
        self._runner_y_offset = 0.0       # for hurdle jump (negative = up)
        self._runner_anim_id: str | None  = None
        self._jump_anim_id:   str | None  = None
        self._hurdles_done: list[bool]    = [False] * len(STEPS)

        # spinner per step
        self._spinner_after_ids: list[str | None] = [None] * len(STEPS)
        self._spinner_frame_idx: list[int]         = [0]    * len(STEPS)

        # image references (keep alive so GC doesn't collect)
        self._img_app:     ImageTk.PhotoImage | None = None
        self._img_success: ImageTk.PhotoImage | None = None
        self._hero_canvas: tk.Canvas          | None = None
        self._img_app_path = IMG_APP

        # image preview popup
        self._preview_images: list[ImageTk.PhotoImage] = []
        self._preview_approve_event = threading.Event()
        self._checkpoint_event = threading.Event()
        self._checkpoint_btn: tk.Button | None = None
        self._launcher_btn: tk.Button | None = None

        # hero resize debounce
        self._hero_resize_after: str | None = None

        # screen frames
        self._screen1: tk.Frame | None = None
        self._screen2: tk.Frame | None = None

        # step-row widgets
        self._row_frames:    list[tk.Frame]  = []
        self._status_labels: list[tk.Label]  = []
        self._approve_btns:  list[tk.Button] = []
        self._eye_btns:      list[tk.Button] = []

        # screen-2 text widgets
        self._json_text:    ScrolledText | None = None
        self._log_text:     ScrolledText | None = None
        self._canvas:       tk.Canvas    | None = None
        self._track_frame:  tk.Frame     | None = None
        self._output_label: tk.Label     | None = None

        # company entry fields (screen 1)
        self._company_entries:    list[tk.Entry] = []
        self._entries_container:  tk.Frame | None = None
        self._entries_frame:      tk.Frame | None = None

        # generated packages — persist across button clicks; populated from disk on startup
        self._generated_packages: list[Path] = []
        self._playwright_btn:     tk.Button | None = None

        self._build_screen1()
        self._scan_existing_packages()

    # ══════════════════════════════════════════════════════════════════════════
    # SCREEN 1 — Input form
    # ══════════════════════════════════════════════════════════════════════════

    def _build_screen1(self) -> None:
        from tkinter import ttk
        self._screen1 = tk.Frame(self.root, bg=BG)
        self._screen1.pack(fill="both", expand=True)

        style = ttk.Style()
        style.theme_use("default")
        style.configure("BC.TNotebook", background=BG, borderwidth=0)
        style.configure("BC.TNotebook.Tab", font=(FONT, 11), padding=(16, 6),
                        background=FIELD, foreground=MUTED)
        style.map("BC.TNotebook.Tab",
                  background=[("selected", PANEL)],
                  foreground=[("selected", BLUE)])

        self._notebook = ttk.Notebook(self._screen1, style="BC.TNotebook")
        self._notebook.pack(fill="both", expand=True)

        tab_generator = tk.Frame(self._notebook, bg=BG)
        self._notebook.add(tab_generator, text="  Generator  ")

        tab_historia = tk.Frame(self._notebook, bg=BG)
        self._notebook.add(tab_historia, text="  Historia  ")

        self._tab_historia = tab_historia

        # FIX 5: 45 % hero / 55 % form
        tab_generator.grid_columnconfigure(0, weight=1)
        tab_generator.grid_columnconfigure(1, weight=1)
        tab_generator.grid_rowconfigure(0, weight=1)

        # ── left: hero image ─────────────────────────────────────────────────
        self._hero_canvas = tk.Canvas(tab_generator, bg=BG, highlightthickness=0)
        self._hero_canvas.grid(row=0, column=0, sticky="nsew")
        self._hero_canvas.bind("<Configure>", self._on_hero_resize)

        # ── right: form ───────────────────────────────────────────────────────
        form = tk.Frame(tab_generator, bg=BG)
        form.grid(row=0, column=1, sticky="nsew")
        form.grid_rowconfigure(0, weight=1)
        form.grid_columnconfigure(0, weight=1)

        wrap = tk.Frame(form, bg=BG)
        wrap.pack(fill="both", expand=True, padx=(20, 40), pady=40)

        # title
        tk.Label(wrap, text="BC Automation",
                 font=(FONT, 26, "bold"), bg=BG, fg=BLUE).pack(anchor="w", pady=(0, 2))
        tk.Label(wrap, text="Business Communicator — package generator",
                 font=(FONT, 11), bg=BG, fg=MUTED).pack(anchor="w", pady=(0, 24))

        # spinboxes
        spin_row = tk.Frame(wrap, bg=BG)
        spin_row.pack(anchor="w", pady=(0, 12))
        self._add_spinbox(spin_row, "Liczba firm",          self.num_companies, 1, 50)
        tk.Frame(spin_row, bg=BG, width=24).pack(side="left")
        self._add_spinbox(spin_row, "Lokalizacje na firmę", self.num_locations, 1, 10)

        # company name entry fields — rebuilt when num_companies changes
        tk.Label(wrap, text="Nazwy firm", font=(FONT, 11), bg=BG, fg=TEXT, anchor="w").pack(fill="x", pady=(0, 4))
        self._entries_container = tk.Frame(wrap, bg=BG)
        self._entries_container.pack(fill="x", pady=(0, 14))
        self.num_companies.trace_add("write", self._rebuild_company_entries)
        self._rebuild_company_entries()

        # FIX 2: checkboxes — vertical layout, Polish labels
        check_col = tk.Frame(wrap, bg=BG)
        check_col.pack(anchor="w", pady=(0, 18))
        for label, var in [
            ("Różnorodność branż",    self.industry_div),
        ]:
            tk.Checkbutton(
                check_col, text=label, variable=var,
                font=(FONT, 11), bg=BG, fg=TEXT,
                activebackground=BG, activeforeground=TEXT,
                selectcolor=PANEL, relief="flat",
            ).pack(anchor="w", pady=(0, 3))

        # radio buttons
        radio_row = tk.Frame(wrap, bg=BG)
        radio_row.pack(anchor="w", pady=(0, 20))
        tk.Label(radio_row, text="Tryb:", font=(FONT, 11), bg=BG, fg=MUTED).pack(side="left", padx=(0, 10))
        for label, value in [
            ("Auto (generuj wszystko naraz)",         "auto"),
            ("Krok po kroku (zatwierdź każdy etap)",  "stepbystep"),
        ]:
            tk.Radiobutton(
                radio_row, text=label, variable=self.mode, value=value,
                font=(FONT, 11), bg=BG, fg=TEXT,
                activebackground=BG, activeforeground=TEXT,
                selectcolor=PANEL, relief="flat",
            ).pack(side="left", padx=(0, 20))

        mock_row = tk.Frame(wrap, bg=BG)
        mock_row.pack(anchor="w", pady=(0, 16))
        tk.Checkbutton(
            mock_row,
            text="🔧 MOCK — pomiń generowanie AI, użyj ostatniego folderu output",
            variable=self.mock_mode,
            font=(FONT, 10), bg=BG, fg=GOLD,
            activebackground=BG, activeforeground=GOLD,
            selectcolor=PANEL, relief="flat",
        ).pack(anchor="w")

        # Action buttons
        btn_row = tk.Frame(wrap, bg=BG)
        btn_row.pack(fill="x", pady=(0, 4))
        tk.Button(
            btn_row, text="▶ GENERUJ PACZKI",
            font=(FONT, 14, "bold"),
            bg=BLUE, fg="#ffffff",
            activebackground="#0860ca", activeforeground="#ffffff",
            relief="flat", padx=24, pady=10,
            cursor="hand2",
            command=self._start_generate,
        ).pack(side="left", padx=(0, 12), fill="x", expand=True)
        self._playwright_btn = tk.Button(
            btn_row, text="▶ URUCHOM PLAYWRIGHT",
            font=(FONT, 14, "bold"),
            bg=GREEN, fg="#ffffff",
            activebackground="#166430", activeforeground="#ffffff",
            relief="flat", padx=24, pady=10,
            cursor="hand2",
            state="disabled",
            command=self._start_playwright,
        )
        self._playwright_btn.pack(side="left", fill="x", expand=True)

        # FIX 1: output path label (shown after START)
        self._output_label = tk.Label(
            wrap, text="",
            font=(FONT, 9), bg=BG, fg=BLUE,
            anchor="w", wraplength=520, justify="left",
        )
        self._output_label.pack(anchor="w", pady=(8, 0))

        self._build_historia_tab()

    def _build_historia_tab(self) -> None:
        from tkinter import ttk
        parent = self._tab_historia

        # header row
        header = tk.Frame(parent, bg=BG)
        header.pack(fill="x", padx=24, pady=(20, 8))
        tk.Label(
            header, text="Historia wgranych firm",
            font=(FONT, 15, "bold"), bg=BG, fg=BLUE,
        ).pack(side="left")
        tk.Button(
            header, text="🔄 Odśwież",
            font=(FONT, 10), bg=FIELD, fg=TEXT,
            relief="flat", padx=10, pady=4, cursor="hand2",
            command=self._refresh_historia,
        ).pack(side="right", padx=(6, 0))

        def _export_csv():
            path = filedialog.asksaveasfilename(
                title="Eksportuj rejestr do CSV",
                defaultextension=".csv",
                filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            )
            if not path:
                return
            ok = company_registry.export_to_csv(path)
            if ok:
                messagebox.showinfo("Eksport zakończony", f"Rejestr wyeksportowany do:\n{path}")
            else:
                messagebox.showerror("Błąd eksportu", "Nie udało się wyeksportować rejestru.\nSprawdź logi w konsoli.")

        def _import_csv():
            path = filedialog.askopenfilename(
                title="Importuj rejestr z CSV",
                filetypes=[("CSV files", "*.csv"), ("All files", "*.*")],
            )
            if not path:
                return
            count = company_registry.import_from_csv(path)
            messagebox.showinfo(
                "Import zakończony",
                f"Zaimportowano {count} nowych firm.\nDuplikaty zostały pominięte.",
            )
            self._refresh_historia()

        tk.Button(
            header, text="📥 Import CSV",
            font=(FONT, 10), bg=FIELD, fg=TEXT,
            relief="flat", padx=10, pady=4, cursor="hand2",
            command=_import_csv,
        ).pack(side="right", padx=(6, 0))
        tk.Button(
            header, text="📤 Eksport CSV",
            font=(FONT, 10), bg=FIELD, fg=TEXT,
            relief="flat", padx=10, pady=4, cursor="hand2",
            command=_export_csv,
        ).pack(side="right", padx=(6, 0))

        # table frame
        table_frame = tk.Frame(parent, bg=BG)
        table_frame.pack(fill="both", expand=True, padx=24, pady=(0, 16))
        table_frame.grid_rowconfigure(0, weight=1)
        table_frame.grid_columnconfigure(0, weight=1)

        cols = ("company_name", "country", "date_added", "status")
        self._historia_tree = ttk.Treeview(
            table_frame,
            columns=cols,
            show="headings",
            selectmode="browse",
        )

        col_cfg = [
            ("company_name", "Nazwa firmy",   260),
            ("country",      "Kraj",          140),
            ("date_added",   "Data wgrania",  160),
            ("status",       "Status",        100),
        ]
        for cid, heading, width in col_cfg:
            self._historia_tree.heading(cid, text=heading, anchor="w")
            self._historia_tree.column(cid, width=width, anchor="w", stretch=True)

        vsb = ttk.Scrollbar(table_frame, orient="vertical",
                             command=self._historia_tree.yview)
        self._historia_tree.configure(yscrollcommand=vsb.set)

        self._historia_tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")

        # remove button
        btn_row = tk.Frame(parent, bg=BG)
        btn_row.pack(fill="x", padx=24, pady=(0, 20))
        tk.Button(
            btn_row, text="🗑 Usuń zaznaczoną z rejestru",
            font=(FONT, 10), bg=RED, fg="#ffffff",
            activebackground="#a0191f", activeforeground="#ffffff",
            relief="flat", padx=12, pady=5, cursor="hand2",
            command=self._remove_from_historia,
        ).pack(side="left")
        tk.Label(
            btn_row,
            text="Usuń tylko jeśli firma została dodana przez pomyłkę.",
            font=(FONT, 9), bg=BG, fg=MUTED,
        ).pack(side="left", padx=(12, 0))

        self._refresh_historia()

    def _refresh_historia(self) -> None:
        if not hasattr(self, "_historia_tree"):
            return
        for row in self._historia_tree.get_children():
            self._historia_tree.delete(row)
        records = company_registry.get_all()
        if not records:
            self._historia_tree.insert(
                "", "end",
                values=("(brak wgranych firm)", "", "", ""),
            )
            return
        for rec in reversed(records):
            self._historia_tree.insert(
                "", "end",
                values=(
                    rec.get("company_name", ""),
                    rec.get("country", ""),
                    rec.get("date_added", ""),
                    rec.get("status", ""),
                ),
            )

    def _remove_from_historia(self) -> None:
        if not hasattr(self, "_historia_tree"):
            return
        selected = self._historia_tree.selection()
        if not selected:
            messagebox.showwarning("Brak zaznaczenia", "Zaznacz firmę którą chcesz usunąć z rejestru.")
            return
        values = self._historia_tree.item(selected[0], "values")
        company_name = values[0] if values else ""
        if not company_name or company_name == "(brak wgranych firm)":
            return
        confirm = messagebox.askyesno(
            "Potwierdź usunięcie",
            f"Czy na pewno chcesz usunąć '{company_name}' z rejestru?\n\nFirma pozostanie na portalu — usuwasz tylko wpis lokalny.",
        )
        if confirm:
            removed = company_registry.remove_company(company_name)
            if removed:
                self._refresh_historia()
                self._log(f"Usunięto z rejestru: {company_name}", "info")
            else:
                messagebox.showerror("Błąd", f"Nie znaleziono '{company_name}' w rejestrze.")

    # ── FIX 5: hero image — debounced resize ──────────────────────────────────
    def _on_hero_resize(self, event: tk.Event) -> None:
        if self._hero_resize_after:
            self.root.after_cancel(self._hero_resize_after)
        w, h = event.width, event.height
        self._hero_resize_after = self.root.after(80, lambda: self._redraw_hero(w, h))

    def _redraw_hero(self, w: int, h: int) -> None:
        self._hero_resize_after = None
        if w < 10 or h < 10 or self._hero_canvas is None:
            return
        photo = _load_image_cover(self._img_app_path, w, h)
        self._hero_canvas.delete("all")
        if photo:
            self._img_app = photo
            self._hero_canvas.create_image(w // 2, h // 2, image=self._img_app, anchor="center")
        else:
            self._hero_canvas.create_text(w // 2, h // 2, text="[image not found]",
                                          font=(FONT, 11), fill=MUTED)

    def _add_spinbox(self, parent: tk.Frame, label: str, var: tk.IntVar, from_: int, to: int) -> None:
        f = tk.Frame(parent, bg=BG)
        f.pack(side="left")
        tk.Label(f, text=label, font=(FONT, 10), bg=BG, fg=MUTED).pack(anchor="w")
        tk.Spinbox(
            f, from_=from_, to=to, textvariable=var,
            width=7, font=(FONT, 12),
            bg=PANEL, fg=TEXT, buttonbackground=FIELD,
            insertbackground=TEXT, relief="flat",
            highlightbackground="#d0d7de", highlightthickness=1,
        ).pack(pady=(2, 0))

    # ══════════════════════════════════════════════════════════════════════════
    # COMPANY ENTRY FIELDS
    # ══════════════════════════════════════════════════════════════════════════

    def _rebuild_company_entries(self, *_) -> None:
        """Rebuild company name entry fields to match num_companies spinner value."""
        if self._entries_container is None:
            return

        # Destroy previous inner frame
        if self._entries_frame is not None:
            self._entries_frame.destroy()
            self._entries_frame = None

        existing_values = []
        for e in self._company_entries:
            try:
                existing_values.append(e.get())
            except Exception:
                existing_values.append("")
        self._company_entries = []

        try:
            count = self.num_companies.get()
        except tk.TclError:
            return

        MAX_VISIBLE = 5
        ENTRY_H = 36

        outer = tk.Frame(self._entries_container, bg=BG)
        outer.pack(fill="x")
        self._entries_frame = outer

        if count > MAX_VISIBLE:
            canvas_h = MAX_VISIBLE * ENTRY_H
            cv = tk.Canvas(outer, bg=BG, height=canvas_h, highlightthickness=0)
            sb = tk.Scrollbar(outer, orient="vertical", command=cv.yview)
            inner = tk.Frame(cv, bg=BG)

            inner.bind("<Configure>", lambda e: cv.configure(scrollregion=cv.bbox("all")))
            win_id = cv.create_window((0, 0), window=inner, anchor="nw")
            cv.configure(yscrollcommand=sb.set)
            cv.bind("<Configure>", lambda e: cv.itemconfig(win_id, width=e.width))

            cv.pack(side="left", fill="x", expand=True)
            sb.pack(side="right", fill="y")
        else:
            inner = tk.Frame(outer, bg=BG)
            inner.pack(fill="x")

        for i in range(count):
            row = tk.Frame(inner, bg=BG)
            row.pack(fill="x", pady=(0, 4))
            tk.Label(
                row, text=f"Company {i + 1}",
                font=(FONT, 10), bg=BG, fg=MUTED, width=10, anchor="w",
            ).pack(side="left")
            entry = tk.Entry(
                row,
                font=(FONT, 11), bg=PANEL, fg=TEXT,
                insertbackground=TEXT, relief="flat",
                highlightbackground="#d0d7de", highlightcolor=BLUE, highlightthickness=1,
            )
            entry.pack(side="left", fill="x", expand=True, ipady=6)
            if i < len(existing_values) and existing_values[i]:
                entry.insert(0, existing_values[i])
            self._company_entries.append(entry)

    # ══════════════════════════════════════════════════════════════════════════
    # GENERATE button
    # ══════════════════════════════════════════════════════════════════════════

    def _start_generate(self) -> None:
        company_queue = [e.get().strip() for e in self._company_entries]
        company_queue = [c for c in company_queue if c]
        if not company_queue:
            messagebox.showerror("Błąd", "Please enter at least one company name")
            return

        duplicates = [c for c in company_queue if company_registry.is_duplicate(c)]
        if duplicates:
            names = "\n".join(f"• {c}" for c in duplicates)
            messagebox.showerror(
                "Firma już istnieje w rejestrze",
                f"Poniższe firmy zostały już wgrane do portalu i nie mogą być dodane ponownie:\n\n{names}\n\nUsuń je z listy lub sprawdź zakładkę Historia."
            )
            return

        self._company_queue = company_queue

        self._params = {
            "description":   company_queue[0],
            "num_companies": self.num_companies.get(),
            "num_locations": self.num_locations.get(),
            "industry_div":  self.industry_div.get(),
            "mode":          self.mode.get(),
            "mock_mode":     self.mock_mode.get(),
        }
        self._stop_flag    = False
        self._step_results = [None] * len(STEPS)
        self._runner_pos   = 0.0
        self._hurdles_done = [False] * len(STEPS)
        self._output_path  = None

        self._screen1.pack_forget()
        self._build_screen2()

        self._log(
            f"GENERUJ PACZKI — tryb={self._params['mode']}, "
            f"lokalizacje={self._params['num_locations']}",
            "info",
        )
        queue_preview = ", ".join(self._company_queue)
        self._log(f"Queue loaded: {len(self._company_queue)} companies — {queue_preview}", "info")
        threading.Thread(target=self._run_generate_queue, daemon=True).start()

    # ══════════════════════════════════════════════════════════════════════════
    # PLAYWRIGHT button
    # ══════════════════════════════════════════════════════════════════════════

    def _start_playwright(self) -> None:
        if not self._generated_packages:
            messagebox.showerror("Błąd", "No packages ready. Generate first.")
            return

        self._params = {
            "mock_mode": self.mock_mode.get(),
            "mode":      self.mode.get(),
        }
        self._stop_flag = False

        self._screen1.pack_forget()
        self._build_screen2()

        self._log(f"URUCHOM PLAYWRIGHT — {len(self._generated_packages)} packages", "info")
        for p in self._generated_packages:
            self._log(f"  • {p.name}", "info")
        threading.Thread(target=self._run_playwright_queue, daemon=True).start()

    # ══════════════════════════════════════════════════════════════════════════
    # SCREEN 2 — Progress
    # ══════════════════════════════════════════════════════════════════════════

    def _build_screen2(self) -> None:
        self._screen2 = tk.Frame(self.root, bg=BG)
        self._screen2.pack(fill="both", expand=True)
        self._screen2.grid_columnconfigure(0, weight=1)
        self._screen2.grid_rowconfigure(2, weight=1)

        # ── top bar ──────────────────────────────────────────────────────────
        top = tk.Frame(self._screen2, bg=PANEL, padx=18, pady=10,
                       highlightbackground="#d0d7de", highlightthickness=1)
        top.grid(row=0, column=0, sticky="ew")
        tk.Label(top, text="BC Automation", font=(FONT, 13, "bold"), bg=PANEL, fg=BLUE).pack(side="left")
        tk.Label(top, text=" — running",    font=(FONT, 12),          bg=PANEL, fg=MUTED).pack(side="left")
        tk.Button(
            top, text="← Back",
            font=(FONT, 10), bg=FIELD, fg=MUTED,
            activebackground=FIELD, activeforeground=TEXT,
            relief="flat", padx=10, pady=3, cursor="hand2",
            command=self._go_back,
        ).pack(side="right")

        # ── track area ────────────────────────────────────────────────────────
        self._track_frame = tk.Frame(self._screen2, bg=BG)
        self._track_frame.grid(row=1, column=0, sticky="ew", padx=18, pady=(14, 0))

        self._canvas = tk.Canvas(self._track_frame, height=110, bg=PANEL, highlightthickness=0)
        self._canvas.pack(fill="x", expand=True)
        self._canvas.bind("<Configure>", self._draw_track)

        # ── middle ────────────────────────────────────────────────────────────
        mid = tk.Frame(self._screen2, bg=BG)
        mid.grid(row=2, column=0, sticky="nsew", padx=18, pady=14)
        mid.grid_columnconfigure(0, weight=3, minsize=520)
        mid.grid_columnconfigure(1, weight=2, minsize=360)
        mid.grid_rowconfigure(0, weight=1)

        # ── steps ─────────────────────────────────────────────────────────────
        steps_col = tk.Frame(mid, bg=BG)
        steps_col.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        tk.Label(steps_col, text="Kroki", font=(FONT, 11, "bold"), bg=BG, fg=MUTED, anchor="w").pack(fill="x", pady=(0, 8))

        self._row_frames    = []
        self._status_labels = []
        self._approve_btns  = []
        self._eye_btns      = []

        for i, step in enumerate(STEPS):
            row = tk.Frame(
                steps_col, bg=PANEL, padx=16, pady=14,
                highlightbackground="#d0d7de", highlightthickness=1,
            )
            row.pack(fill="x", pady=(0, 6))
            self._row_frames.append(row)

            left = tk.Frame(row, bg=PANEL)
            left.pack(side="left", fill="x", expand=True)
            tk.Label(left, text=f"{step['icon']}  {step['name']}", font=(FONT, 12, "bold"), bg=PANEL, fg=TEXT,  anchor="w").pack(anchor="w")
            tk.Label(left, text=step["desc"],                       font=(FONT, 10),          bg=PANEL, fg=MUTED, anchor="w").pack(anchor="w", pady=(2, 0))

            right = tk.Frame(row, bg=PANEL)
            right.pack(side="right")

            status_lbl = tk.Label(right, text="·", font=(FONT, 18), bg=PANEL, fg=MUTED, width=3)
            status_lbl.pack(side="left", padx=(0, 8))
            self._status_labels.append(status_lbl)

            eye = tk.Button(
                right, text="👁",
                font=(FONT, 11), bg=FIELD, fg=MUTED,
                activebackground=FIELD, activeforeground=TEXT,
                relief="flat", padx=8, pady=2, cursor="hand2",
                state="disabled",
                command=lambda idx=i: self._preview_step(idx),
            )
            eye.pack(side="left", padx=(0, 6))
            self._eye_btns.append(eye)

            # FIX 3: APPROVE — orange, bold, border, larger; hidden by default
            approve = tk.Button(
                right, text="APPROVE",
                font=(FONT, 10, "bold"),
                bg="#f0a500", fg="black",
                activebackground="#d4920a", activeforeground="black",
                relief="solid", bd=2, padx=16, pady=6,
                cursor="hand2",
                state="disabled",
                command=self._approve,
            )
            # NOT packed — shown only when needed via _enable_approve
            self._approve_btns.append(approve)

        # ── right column: JSON + Log ──────────────────────────────────────────
        right_col = tk.Frame(mid, bg=BG)
        right_col.grid(row=0, column=1, sticky="nsew")
        right_col.grid_rowconfigure(0, weight=1)
        right_col.grid_rowconfigure(1, weight=1)
        right_col.grid_columnconfigure(0, weight=1)

        for row_idx, (title, attr, fg_color) in enumerate([
            ("JSON Preview", "_json_text", GREEN),
            ("Log",          "_log_text",  TEXT),
        ]):
            frame = tk.Frame(
                right_col, bg=PANEL, padx=12, pady=10,
                highlightbackground="#d0d7de", highlightthickness=1,
            )
            frame.grid(row=row_idx, column=0, sticky="nsew", pady=(0, 6) if row_idx == 0 else 0)
            frame.grid_rowconfigure(1, weight=1)
            frame.grid_columnconfigure(0, weight=1)
            tk.Label(frame, text=title, font=(FONT, 10, "bold"), bg=PANEL, fg=MUTED, anchor="w").grid(row=0, column=0, sticky="w", pady=(0, 4))
            widget = ScrolledText(
                frame,
                font=(FONT, 9), bg=FIELD, fg=fg_color,
                insertbackground=TEXT, relief="flat",
                wrap="none" if attr == "_json_text" else "word",
                state="disabled",
            )
            widget.grid(row=1, column=0, sticky="nsew")
            setattr(self, attr, widget)

        self._log_text.tag_configure("info",  foreground=BLUE)
        self._log_text.tag_configure("ok",    foreground=GREEN)
        self._log_text.tag_configure("error", foreground=RED)
        self._log_text.tag_configure("ts",    foreground=MUTED)

    # ══════════════════════════════════════════════════════════════════════════
    # TRACK + HURDLE ANIMATION  (FIX 4)
    # ══════════════════════════════════════════════════════════════════════════

    def _draw_track(self, event=None) -> None:
        c = self._canvas
        if c is None:
            return
        c.delete("all")
        w = c.winfo_width()
        if w < 120:
            w = 900
        pad    = 52
        y_line = 72
        y_text = 88

        track_w = w - 2 * pad
        fill_x  = pad + self._runner_pos * track_w

        # background track
        c.create_line(pad, y_line, w - pad, y_line, fill="#d0d7de", width=6, capstyle="round")
        # filled portion
        if fill_x > pad:
            c.create_line(pad, y_line, fill_x, y_line, fill=BLUE, width=6, capstyle="round")

        # checkpoints + hurdles (FIX 4)
        n = len(STEPS)
        for i in range(n):
            frac  = (i + 1) / (n + 1)
            cx    = pad + track_w * frac
            done  = self._hurdles_done[i]

            # checkpoint dot
            dot_color = BLUE if self._runner_pos >= frac else "#d0d7de"
            c.create_oval(cx - 7, y_line - 7, cx + 7, y_line + 7,
                          fill=dot_color, outline=PANEL, width=2)
            c.create_text(cx, y_text, text=f"Step {i + 1}",
                          font=(FONT, 8), fill=MUTED, anchor="n")

            # hurdle bar
            hurdle_color = HURDLE_DONE if done else HURDLE_PENDING
            c.create_rectangle(cx - 3, y_line - 12, cx + 3, y_line + 6,
                                fill=hurdle_color, outline="")

        # flags
        c.create_text(pad,     y_line - 26, text="🚩", font=("", 18), anchor="center")
        c.create_text(w - pad, y_line - 26, text="🏁", font=("", 18), anchor="center")

        # runner (y adjusted by jump offset)
        rx = pad + self._runner_pos * track_w
        ry = y_line - 26 + self._runner_y_offset
        c.create_text(rx, ry, text="🏃", font=("", 22), anchor="center", tags="runner")

    def _animate_runner_to(self, target: float, on_done=None) -> None:
        if self._runner_anim_id is not None:
            self.root.after_cancel(self._runner_anim_id)
            self._runner_anim_id = None

        start  = self._runner_pos
        frames = 28
        step   = [0]
        delta  = (target - start) / frames

        def _tick():
            step[0] += 1
            self._runner_pos = min(start + delta * step[0], target)
            self._draw_track()
            if step[0] < frames:
                self._runner_anim_id = self.root.after(18, _tick)
            else:
                self._runner_pos = target
                self._draw_track()
                if on_done:
                    on_done()

        _tick()

    def _jump_at_checkpoint(self, idx: int) -> None:
        """Play jump arc animation then mark hurdle as done."""
        if self._jump_anim_id is not None:
            self.root.after_cancel(self._jump_anim_id)
        frame = [0]

        def _tick():
            if frame[0] < len(JUMP_ARC):
                self._runner_y_offset = JUMP_ARC[frame[0]]
                frame[0] += 1
                self._draw_track()
                self._jump_anim_id = self.root.after(30, _tick)
            else:
                self._runner_y_offset = 0.0
                self._hurdles_done[idx] = True
                self._draw_track()

        _tick()

    # ── success panel ─────────────────────────────────────────────────────────
    def _show_success_panel(self) -> None:
        if self._canvas:
            self._canvas.destroy()
            self._canvas = None

        panel = tk.Frame(self._track_frame, bg="#0d1117", height=120)
        panel.pack(fill="x", expand=True)
        panel.pack_propagate(False)

        self._img_success = _load_image(IMG_SUCCESS, 110, 110)

        inner = tk.Frame(panel, bg="#0d1117")
        inner.place(relx=0.5, rely=0.5, anchor="center")

        if self._img_success:
            tk.Label(inner, image=self._img_success, bg="#0d1117", bd=0).pack(side="left", padx=(0, 18))

        txt = tk.Frame(inner, bg="#0d1117")
        txt.pack(side="left")
        tk.Label(txt, text="MISJA ZAKOŃCZONA SUKCESEM.",
                 font=(FONT, 16, "bold"), bg="#0d1117", fg="#f5a623").pack(anchor="w")
        tk.Label(txt, text="Fillator 2077 kończy operację.",
                 font=(FONT, 11), bg="#0d1117", fg="#58a6ff").pack(anchor="w", pady=(4, 0))
        if self._output_path:
            tk.Label(txt, text=f"📁 {self._output_path.resolve()}",
                     font=(FONT, 9), bg="#0d1117", fg="#58a6ff").pack(anchor="w", pady=(6, 0))

    # ══════════════════════════════════════════════════════════════════════════
    # STEP EXECUTION  (worker thread)
    def _find_last_output_folder(self) -> Path | None:
        output_dir = _HERE / "output"
        if not output_dir.exists():
            return None
        folders = sorted(
            [f for f in output_dir.iterdir() if f.is_dir()],
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )
        return folders[0] if folders else None

    # ══════════════════════════════════════════════════════════════════════════

    def _reset_steps_ui(self) -> None:
        """Reset all step indicators to their initial (pending) state."""
        for idx in range(len(STEPS)):
            try:
                aid = self._spinner_after_ids[idx]
                if aid:
                    self.root.after_cancel(aid)
                    self._spinner_after_ids[idx] = None
                self._spinner_frame_idx[idx] = 0
                self._status_labels[idx].config(text="·", fg=MUTED)
                self._row_frames[idx].config(bg=PANEL, highlightbackground="#d0d7de")
                for child in self._row_frames[idx].winfo_children():
                    try:
                        child.config(bg=PANEL)
                        for gc in child.winfo_children():
                            try:
                                gc.config(bg=PANEL)
                            except tk.TclError:
                                pass
                    except tk.TclError:
                        pass
                self._eye_btns[idx].config(state="disabled", fg=MUTED, bg=FIELD)
            except (tk.TclError, AttributeError, IndexError):
                pass

    def _scan_existing_packages(self) -> None:
        """On startup, populate self._generated_packages from existing output folders."""
        output_dir = _HERE / "output"
        if not output_dir.exists():
            return
        for folder in sorted(output_dir.iterdir()):
            if folder.is_dir() and not company_registry.is_package_done(folder.name):
                self._generated_packages.append(folder)
        if self._generated_packages and self._playwright_btn:
            try:
                self._playwright_btn.config(state="normal")
            except tk.TclError:
                pass

    def _enable_playwright_btn(self) -> None:
        if self._playwright_btn:
            try:
                self._playwright_btn.config(state="normal")
            except tk.TclError:
                pass

    def _run_generate_queue(self) -> None:
        """AI generation pipeline for each company in the queue."""
        total = len(self._company_queue)
        for idx, company_name in enumerate(self._company_queue):
            if self._stop_flag:
                return
            package_success = False
            self._log(f"--- Generating package {idx + 1}/{total}: {company_name} ---", "info")

            self._params["description"] = company_name
            if not self._clear_generator_output():
                self._log(f"--- Package FAILED {idx + 1}/{total}: {company_name} ---", "error")
                continue

            # Fresh timestamped folder — _rename_output_folder appends brand name after step 0
            self._output_path = _HERE / "output" / datetime.now().strftime("%Y%m%d_%H%M%S")
            self._output_path.mkdir(parents=True, exist_ok=True)
            self._log(f"Output: {self._output_path.resolve()}", "info")

            # Reset pipeline state and step indicators
            self._step_results = [None] * len(STEPS)
            self._runner_pos   = 0.0
            self._hurdles_done = [False] * len(STEPS)
            self.root.after(0, self._reset_steps_ui)

            package_success = self._run_steps()

            if self._stop_flag:
                return

            # Snapshot input_package_generator/output/ alongside the company folder
            if not package_success or not self._save_runtime_package():
                self._log(f"--- Package FAILED {idx + 1}/{total}: {company_name} ---", "error")
                continue

            if self._output_path and self._output_path.exists():
                self._generated_packages.append(self._output_path)
                self.root.after(0, self._enable_playwright_btn)

            self._log(f"--- Package ready {idx + 1}/{total}: {company_name} ---", "ok")

        self._log("✓ All packages generated. Ready for Playwright.", "ok")

    def _clear_generator_output(self) -> bool:
        """Remove stale generator output before building the next package."""
        import shutil

        pkg_output = _HERE / "input_package_generator" / "output"
        try:
            if pkg_output.exists():
                shutil.rmtree(str(pkg_output))
            pkg_output.mkdir(parents=True, exist_ok=True)
            return True
        except Exception as exc:
            self._log(f"Błąd czyszczenia input_package_generator/output: {exc}", "error")
            return False

    def _save_runtime_package(self) -> bool:
        """Copy input_package_generator/output/ into _runtime_pkg/ inside the company folder."""
        import csv
        import json
        import shutil
        from input_package_generator.mapper import build_email_from_brand
        pkg_output = _HERE / "input_package_generator" / "output"
        if self._output_path is None:
            self._log("Nie można zapisać _runtime_pkg — brak folderu paczki.", "error")
            return False
        if not pkg_output.exists():
            self._log("Nie można zapisać _runtime_pkg — brak input_package_generator/output.", "error")
            return False
        files_present = [f.name for f in pkg_output.rglob("*") if f.is_file()]
        self._log(f"[_save_runtime_package] Pliki w pkg_output przed kopią: {files_present}", "info")

        # Validate that the email in output/users.csv matches this package's expected email.
        pkg_folder = self._output_path
        identity_path = pkg_folder / "identity_profile.json"
        output_users_csv = pkg_output / "users.csv"
        output_companies_csv = pkg_output / "companies.csv"
        if not output_users_csv.exists():
            self._log("Nie można zapisać _runtime_pkg — brak users.csv w generator output.", "error")
            return False
        if not output_companies_csv.exists():
            self._log("Nie można zapisać _runtime_pkg — brak companies.csv w generator output.", "error")
            return False
        if not identity_path.exists():
            self._log("Nie można zapisać _runtime_pkg — brak identity_profile.json paczki.", "error")
            return False
        if identity_path.exists() and output_users_csv.exists():
            try:
                with identity_path.open(encoding="utf-8") as fh:
                    identity_data = json.load(fh)
                base_brand_name = identity_data.get("brand", {}).get("base_brand_name", "").strip()
                expected_email = build_email_from_brand(base_brand_name)
                with output_users_csv.open(encoding="utf-8", newline="") as fh:
                    output_email = next(csv.DictReader(fh)).get("email", "").strip()
                if output_email != expected_email:
                    self._log(
                        f"Błąd — email w output ({output_email}) nie pasuje do paczki {pkg_folder.name} ({expected_email}). _runtime_pkg nie zostanie zapisany.",
                        "error",
                    )
                    return False
            except Exception as exc:
                self._log(f"Błąd — nie można zweryfikować emaila przed zapisem _runtime_pkg: {exc}", "error")
                shutil.rmtree(str(pkg_output), ignore_errors=True)
                pkg_output.mkdir(parents=True, exist_ok=True)
                return False

        runtime_pkg = self._output_path / "_runtime_pkg"
        try:
            if runtime_pkg.exists():
                shutil.rmtree(str(runtime_pkg))
            shutil.copytree(str(pkg_output), str(runtime_pkg))
            self._log("Runtime package saved to _runtime_pkg/", "ok")
            return True
        except Exception as exc:
            self._log(f"Błąd — nie udało się zapisać _runtime_pkg: {exc}", "error")
            return False

    def _append_accounts_export(self, pkg_folder: Path) -> None:
        import csv
        from datetime import datetime

        _ACCOUNTS_CSV = _HERE / "baza_danych" / "accounts_export.csv"
        _COLUMNS = ["email", "password", "first_name", "last_name", "company_name", "country", "city", "created_at"]

        users_csv = pkg_folder / "_runtime_pkg" / "users.csv"
        companies_csv = pkg_folder / "_runtime_pkg" / "companies.csv"

        with users_csv.open(encoding="utf-8", newline="") as fh:
            user = next(csv.DictReader(fh))

        with companies_csv.open(encoding="utf-8", newline="") as fh:
            base_company = next(csv.DictReader(fh))

        row = {
            "email":        user.get("email", "").strip(),
            "password":     user.get("password", "").strip(),
            "first_name":   user.get("first_name", "").strip(),
            "last_name":    user.get("last_name", "").strip(),
            "company_name": base_company.get("company_name", "").strip(),
            "country":      user.get("country", "").strip(),
            "city":         user.get("city", "").strip(),
            "created_at":   datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }

        _ACCOUNTS_CSV.parent.mkdir(parents=True, exist_ok=True)

        existing_rows: list[dict] = []
        if _ACCOUNTS_CSV.exists():
            with _ACCOUNTS_CSV.open(encoding="utf-8", newline="") as fh:
                existing_rows = list(csv.DictReader(fh))

        updated = False
        for i, existing in enumerate(existing_rows):
            if existing.get("email", "").strip() == row["email"]:
                existing_rows[i] = row
                updated = True
                break
        if not updated:
            existing_rows.append(row)

        with _ACCOUNTS_CSV.open("w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=_COLUMNS)
            writer.writeheader()
            writer.writerows(existing_rows)

        action = "Zaktualizowano" if updated else "Dodano"
        self._log(f"{action} w accounts_export.csv: {row['email']} / {row['company_name']}", "ok")

    def _run_playwright_queue(self) -> None:
        """Run Playwright pipeline for every package in self._generated_packages.

        Per-package: COPY PACKAGE TO RUNTIME → REGISTER USERS → FILL USER PROFILES → FILL COMPANY STEP 1.
        Checkpoint:  one shared wait.
        Per-package: FILL COMPANY STEP 2 → GENERATE REGISTRY REPORT.
        """
        import shutil
        import sys

        scripts = {
            "COPY PACKAGE TO RUNTIME":  _HERE / "input_package_generator" / "copy_package_to_runtime.py",
            "REGISTER USERS":           _HERE / "register.py",
            "FILL USER PROFILES":       _HERE / "fill_profile.py",
            "FILL COMPANY STEP 1":      _HERE / "fill_company.py",
            "FILL COMPANY STEP 2":      _HERE / "fill_company_step2.py",
            "GENERATE REGISTRY REPORT": _HERE / "reporting" / "generate_registry_report.py",
        }

        per_pkg_post_steps = ["FILL COMPANY STEP 2", "GENERATE REGISTRY REPORT"]

        pkg_output = _HERE / "input_package_generator" / "output"
        total = len(self._generated_packages)
        failed_packages:    list[Path] = []   # failed any step — skip all subsequent steps
        done_packages:      set[Path]  = set() # already processed (is_package_done) — skip phase 1
        succeeded_packages: list[Path] = []   # completed all 4 pre-steps — go to phase 2

        def _restore(pkg_folder: Path) -> bool:
            runtime_pkg = pkg_folder / "_runtime_pkg"
            self._log(f"[Restore] runtime_pkg path : {runtime_pkg}", "info")
            self._log(f"[Restore] runtime_pkg exists: {runtime_pkg.exists()}", "info")
            self._log(f"[Restore] pkg_output path  : {pkg_output}", "info")
            if runtime_pkg.exists():
                try:
                    if pkg_output.exists():
                        shutil.rmtree(str(pkg_output))
                    shutil.copytree(str(runtime_pkg), str(pkg_output))
                    restored_files = [f.name for f in pkg_output.rglob("*") if f.is_file()]
                    self._log(f"[Restore] Pliki w pkg_output: {restored_files}", "ok")
                    self._cleanup_runtime_csv(pkg_folder, pkg_output)
                    self._log("Runtime package restored.", "ok")
                    return True
                except Exception as exc:
                    self._log(f"BŁĄD przywracania paczki: {exc}", "error")
                    return False
            else:
                self._log(f"Ostrzeżenie — brak _runtime_pkg w {pkg_folder.name}, kontynuuję bez przywracania", "error")
                return True  # non-fatal

        def _run_script(step_name: str) -> bool:
            self._log(f"[Playwright] Start: {step_name}", "info")
            result = subprocess.run(
                [sys.executable, str(scripts[step_name])],
                cwd=str(scripts[step_name].parent),
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                self._log(f"[Playwright] BŁĄD: {step_name}\n{result.stderr or result.stdout}", "error")
                return False
            self._log(f"[Playwright] Gotowe: {step_name}", "ok")
            return True

        # ── Phase 1: all 4 pre-steps per package ─────────────────────────────
        self._log(f"=== FAZA 1: pre-checkpoint ({total} paczek) ===", "info")

        for idx, pkg_folder in enumerate(self._generated_packages):
            if self._stop_flag:
                return
            if pkg_folder in failed_packages:
                continue

            self._log(f"--- Faza 1 [{idx + 1}/{total}]: {pkg_folder.name} ---", "info")

            # Restore before first step (runtime state must be clean for skip check)
            if not _restore(pkg_folder):
                failed_packages.append(pkg_folder)
                continue

            # Guard: _runtime_pkg subdirectory must exist
            if not (pkg_folder / "_runtime_pkg").is_dir():
                self._log(f"Pominięto paczkę — brak _runtime_pkg: {pkg_folder.name}", "warning")
                failed_packages.append(pkg_folder)
                continue

            # Skip if already fully processed
            if company_registry.is_package_done(pkg_folder.name):
                self._log(f"Pominięto fazę 1 — już przetworzona: {pkg_folder.name}", "info")
                done_packages.add(pkg_folder)
                continue

            # Guard: users.csv must exist in _runtime_pkg before any script runs
            if not (pkg_folder / "_runtime_pkg" / "users.csv").exists():
                self._log(f"Pominięto paczkę — brak users.csv w _runtime_pkg: {pkg_folder.name}", "error")
                failed_packages.append(pkg_folder)
                continue

            # COPY PACKAGE TO RUNTIME
            if not _run_script("COPY PACKAGE TO RUNTIME"):
                failed_packages.append(pkg_folder)
                continue

            # Restore → REGISTER USERS
            if not _restore(pkg_folder):
                failed_packages.append(pkg_folder)
                continue
            if not _run_script("REGISTER USERS"):
                failed_packages.append(pkg_folder)
                continue

            # Restore → FILL USER PROFILES
            if not _restore(pkg_folder):
                failed_packages.append(pkg_folder)
                continue
            if not _run_script("FILL USER PROFILES"):
                failed_packages.append(pkg_folder)
                continue

            # Restore → FILL COMPANY STEP 1
            if not _restore(pkg_folder):
                failed_packages.append(pkg_folder)
                continue
            if not _run_script("FILL COMPANY STEP 1"):
                failed_packages.append(pkg_folder)
                continue

            # Register company after FILL COMPANY STEP 1 succeeds
            try:
                identity_path = pkg_folder / "identity_profile.json"
                identity_data = json.loads(identity_path.read_text(encoding="utf-8"))
                company_name = identity_data.get("brand", {}).get("base_brand_name", "").strip()
                country = identity_data.get("identity", {}).get("country", "").strip()
                if company_name:
                    company_registry.add_company(company_name, country=country)
                    company_registry.mark_package_done(pkg_folder.name)
                    self._log(f"Zapisano do rejestru: {company_name}", "ok")
                    try:
                        self._append_accounts_export(pkg_folder)
                    except Exception as _exp_exc:
                        self._log(f"Ostrzeżenie — nie udało się zapisać do accounts_export.csv: {_exp_exc}", "error")
                else:
                    self._log(f"Ostrzeżenie — brak company_name w identity_profile.json: {pkg_folder.name}", "error")
            except Exception as _reg_exc:
                self._log(f"Ostrzeżenie — nie udało się zapisać do rejestru: {_reg_exc}", "error")

            succeeded_packages.append(pkg_folder)

        self._log(
            f"=== Faza 1 zakończona: {len(succeeded_packages)} OK, {len(failed_packages)} błędów ===",
            "ok" if not failed_packages else "error",
        )

        # ── Checkpoint — one shared wait ──────────────────────────────────────
        if not succeeded_packages:
            self._log("Brak paczek po fazie 1 — pomijam checkpoint i fazę 2.", "error")
            self._log("🏁 Koniec. Żadna paczka nie przeszła przez pełny pipeline.", "error")
            return

        self._log("Checkpoint — doładuj środki dla wszystkich kont", "info")
        self._checkpoint_event.clear()
        self.root.after(0, self._show_checkpoint_button)
        self._checkpoint_event.wait()
        self.root.after(0, self._hide_checkpoint_button)

        # ── Phase 2: per-package post-checkpoint steps ────────────────────────
        self._log(f"=== FAZA 2: post-checkpoint ({len(succeeded_packages)} paczek) ===", "info")
        phase2_failed: list[Path] = []

        for idx, pkg_folder in enumerate(succeeded_packages):
            if self._stop_flag:
                return
            self._log(f"--- Faza 2 [{idx + 1}/{len(succeeded_packages)}]: {pkg_folder.name} ---", "info")

            pkg_ok = True
            for step_name in per_pkg_post_steps:
                if self._stop_flag:
                    return
                if not _restore(pkg_folder):
                    phase2_failed.append(pkg_folder)
                    pkg_ok = False
                    break
                if not _run_script(step_name):
                    phase2_failed.append(pkg_folder)
                    pkg_ok = False
                    break

            if not pkg_ok:
                self._log(f"--- Faza 2 BŁĄD: {pkg_folder.name} ---", "error")

        fully_completed = len(succeeded_packages) - len(phase2_failed)
        self._log(
            f"🏁 All done. Pełny pipeline: {fully_completed}/{total} paczek.",
            "ok",
        )

    def _show_company_picker(self, candidates: list[dict], company_name: str) -> dict | None:
        from tkinter import ttk
        result_holder = [None]
        TIMEOUT = 40
        remaining = [TIMEOUT]
        after_id  = [None]

        win = tk.Toplevel(self.root)
        win.title("Wybierz właściwą firmę")
        win.geometry("600x450")
        win.resizable(False, False)
        win.attributes("-topmost", True)
        win.grab_set()

        tk.Label(
            win,
            text=f"Znaleziono kilka firm dla: {company_name}\nWybierz właściwą:",
            font=(FONT, 11), bg=BG, fg=TEXT, justify="left",
        ).pack(anchor="w", padx=16, pady=(16, 4))

        countdown_label = tk.Label(
            win,
            text=f"Automatyczny wybór za: {remaining[0]} s",
            font=(FONT, 9), bg=BG, fg=MUTED,
        )
        countdown_label.pack(anchor="w", padx=16, pady=(0, 6))

        tree_frame = tk.Frame(win, bg=BG)
        tree_frame.pack(fill="both", expand=True, padx=16, pady=(0, 8))
        tree_frame.grid_rowconfigure(0, weight=1)
        tree_frame.grid_columnconfigure(0, weight=1)

        cols = ("name", "country", "city", "ceo", "industry")
        tree = ttk.Treeview(tree_frame, columns=cols, show="headings", selectmode="browse")
        col_cfg = [
            ("name",     "Nazwa",   170),
            ("country",  "Kraj",    90),
            ("city",     "Miasto",  90),
            ("ceo",      "CEO",     110),
            ("industry", "Branża",  110),
        ]
        for cid, heading, width in col_cfg:
            tree.heading(cid, text=heading, anchor="w")
            tree.column(cid, width=width, anchor="w", stretch=True)

        vsb = ttk.Scrollbar(tree_frame, orient="vertical", command=tree.yview)
        tree.configure(yscrollcommand=vsb.set)
        tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")

        for c in candidates:
            tree.insert("", "end", values=(
                c.get("name", ""),
                c.get("country", ""),
                c.get("city", ""),
                c.get("ceo", ""),
                c.get("industry", ""),
            ))
        if tree.get_children():
            tree.selection_set(tree.get_children()[0])

        def _first_safe_candidate() -> dict | None:
            first = candidates[0] if candidates else None
            if first and openai_helper.is_strong_company_match(company_name, first.get("name", "")):
                return first
            return None

        def _cancel_timer():
            if after_id[0] is not None:
                win.after_cancel(after_id[0])
                after_id[0] = None

        def _on_select():
            _cancel_timer()
            sel = tree.selection()
            if sel:
                vals = tree.item(sel[0], "values")
                result_holder[0] = {
                    "name": vals[0], "country": vals[1],
                    "city": vals[2], "ceo": vals[3], "industry": vals[4],
                }
            win.destroy()

        def _on_skip():
            _cancel_timer()
            result_holder[0] = _first_safe_candidate()
            win.destroy()

        def _on_timeout():
            result_holder[0] = _first_safe_candidate()
            if result_holder[0] is None:
                company_registry.save_alert(
                    company_name=company_name,
                    alert_type="candidate_rejected",
                    message="Automatyczny wybór pominięty: pierwszy kandydat nie spełnił silnego dopasowania nazwy.",
                )
                win.destroy()
                return
            first_name = candidates[0].get("name", company_name) if candidates else company_name
            company_registry.save_alert(
                company_name=company_name,
                alert_type="auto_selected",
                message=(
                    f"Pierwszy kandydat '{first_name}' został wybrany automatycznie, "
                    f"ponieważ operator nie dokonał wyboru w ciągu {TIMEOUT} sekund."
                ),
            )
            win.destroy()

        def _tick():
            remaining[0] -= 1
            if remaining[0] <= 0:
                after_id[0] = None
                _on_timeout()
                return
            countdown_label.config(text=f"Automatyczny wybór za: {remaining[0]} s")
            after_id[0] = win.after(1000, _tick)

        after_id[0] = win.after(1000, _tick)

        win.protocol("WM_DELETE_WINDOW", win.destroy)

        btn_row = tk.Frame(win, bg=BG)
        btn_row.pack(fill="x", padx=16, pady=(0, 14))
        tk.Button(
            btn_row, text="✅ Wybierz zaznaczoną",
            font=(FONT, 10, "bold"), bg=BLUE, fg="#ffffff",
            activebackground="#0860ca", activeforeground="#ffffff",
            relief="flat", padx=12, pady=6, cursor="hand2",
            command=_on_select,
        ).pack(side="left", padx=(0, 10))
        tk.Button(
            btn_row, text="⏭ Pomiń — użyj pierwszego wyniku",
            font=(FONT, 10), bg=FIELD, fg=TEXT,
            relief="flat", padx=12, pady=6, cursor="hand2",
            command=_on_skip,
        ).pack(side="left")

        win.wait_window()
        return result_holder[0]

    def _run_steps(self) -> bool:
        n = len(STEPS)
        for i, step in enumerate(STEPS):
            if self._stop_flag:
                return False

            # MOCK MODE: skip all 4 AI steps, load from last output folder
            if self._params.get("mock_mode"):
                import threading as _threading
                chosen_folder: list[Path | None] = [None]

                def _ask_folder():
                    result = filedialog.askdirectory(
                        title="Wybierz folder paczki (np. output/001_nike_inc)",
                        initialdir=str(_HERE / "output"),
                    )
                    chosen_folder[0] = Path(result) if result else None

                done_evt = _threading.Event()
                def _ask_and_set():
                    _ask_folder()
                    done_evt.set()

                self.root.after(0, _ask_and_set)
                done_evt.wait()

                last_folder = chosen_folder[0]
                if last_folder is None:
                    self._log("MOCK: Anulowano wybór folderu", "error")
                    return False

                self._output_path = last_folder
                self._log(f"MOCK: Używam folderu {last_folder.name}", "info")

                # load identity
                identity_path = last_folder / "identity_profile.json"
                expansion_path = last_folder / "expansion_request.json"
                if not (last_folder / "identity_profile.json").exists() or not (last_folder / "expansion_request.json").exists():
                    self._log("MOCK: Brak identity_profile.json lub expansion_request.json!", "error")
                    return False
                import json as _json
                identity = _json.loads(identity_path.read_text(encoding="utf-8"))
                expansion = _json.loads(expansion_path.read_text(encoding="utf-8"))
                images = {
                    "avatar": str(last_folder / identity.get("assets", {}).get("avatar_filename", "identity_001_avatar.png")),
                    "logo":   str(last_folder / identity.get("assets", {}).get("logo_filename",   "identity_001_logo.png")),
                    "banner": str(last_folder / identity.get("assets", {}).get("banner_filename", "identity_001_banner.png")),
                }
                self._step_results[0] = identity
                self._step_results[1] = expansion
                self._step_results[2] = images
                self._step_results[3] = {"status": "ok", "generated_by": "MOCK"}

                for idx in range(len(STEPS)):
                    self.root.after(0, lambda x=idx: self._set_step_done(x))

                self._log("MOCK: Wszystkie kroki AI pominięte", "ok")
                break

            target_frac = (i + 1) / (n + 1)
            self.root.after(0, lambda tf=target_frac: self._animate_runner_to(tf))
            self.root.after(0, lambda idx=i: self._set_step_running(idx))
            self._log(f"[{i + 1}/{n}] Start: {step['name']}", "info")

            try:
                if i == 0:
                    self._log("⚡ Searching for company candidates...", "info")
                    candidates = openai_helper.search_company_candidates(
                        self._params["description"]
                    )
                    chosen = None
                    if candidates:
                        pick_event = threading.Event()
                        pick_result = [None]
                        def _show_picker():
                            pick_result[0] = self._show_company_picker(
                                candidates, self._params["description"]
                            )
                            pick_event.set()
                        self.root.after(0, _show_picker)
                        pick_event.wait()
                        chosen = pick_result[0]
                    if chosen:
                        description = f"{chosen.get('name', self._params['description'])}, {chosen.get('country', '')}, {chosen.get('city', '')}, CEO: {chosen.get('ceo', '')}, industry: {chosen.get('industry', '')}"
                        self._log(f"Wybrano firmę: {chosen.get('name')}", "ok")
                    else:
                        description = self._params["description"]
                        self._log("Brak wyboru — używam oryginalnej nazwy", "info")
                    self._log("⚡ Calling OpenAI API...", "info")
                    result = openai_helper.generate_identity(
                        description,
                        self._params["num_companies"],
                        self._params["num_locations"],
                    )
                    self._log("✅ API response received", "ok")
                elif i == 1:
                    self._log("⚡ Calling OpenAI API...", "info")
                    result = openai_helper.generate_expansion(
                        self._step_results[0] or {},
                        self._params["num_companies"],
                        self._params["num_locations"],
                        industry_div=self._params.get("industry_div", False),
                    )
                    self._log("✅ API response received", "ok")
                elif i == 2:
                    self._log("⚡ Generating images with DALL-E 3...", "info")
                    result = openai_helper.generate_images(
                        self._step_results[0] or {},
                        self._output_path,
                    )
                    self._log("✅ Images saved", "ok")
                else:
                    enriched_params = {
                        **self._params,
                        "_step_results": list(self._step_results),
                        "output_folder": str(self._output_path) if self._output_path else "",
                    }
                    result = step["fn"](enriched_params)
            except Exception as exc:
                self._log(f"BŁĄD w kroku {i + 1}: {exc}", "error")
                self.root.after(0, lambda idx=i: self._set_step_error(idx))
                return False

            if self._stop_flag:
                return False

            if isinstance(result, dict) and "error" in result:
                self._log(f"API error (krok {i + 1}): {result['error']}", "error")
                self.root.after(0, lambda idx=i: self._set_step_error(idx))
                self._log(f"Błąd walidacji: {result['error']}", "error")
                time.sleep(5)
                return False

            self._step_results[i] = result

            # FIX 1: save to disk
            self._save_step_result(i, result)

            if i == 0:
                self._rename_output_folder(result)

            if i == 2:
                self._preview_approve_event.clear()
                if not self._params.get("mock_mode") and self._params.get("mode") == "auto":
                    self._preview_approve_event.set()
                    self._log("Grafiki zatwierdzone automatycznie (tryb auto)", "ok")
                else:
                    captured = (result, self._output_path)
                    self.root.after(0, lambda c=captured: self._show_image_preview(c[0], c[1]))
                    self._log("Oczekiwanie na zatwierdzenie grafik...", "info")
                    self._preview_approve_event.wait()
                    if self._stop_flag:
                        return False
                    self._log("Grafiki zatwierdzone", "ok")

            self.root.after(0, lambda idx=i: self._set_step_done(idx))
            self.root.after(0, lambda idx=i: self._show_json_for_step(idx))
            self._log(f"[{i + 1}/{n}] Gotowe: {step['name']}", "ok")

            if self._params.get("mode") == "stepbystep":
                self.root.after(0, lambda idx=i: self._enable_approve(idx))
                self._log(f"Oczekiwanie na APPROVE (krok {i + 1})…", "info")
                self._approve_event.clear()
                self._approve_event.wait()
                if self._stop_flag:
                    return False
                self._log(f"Zatwierdzono krok {i + 1}", "ok")
                self.root.after(0, lambda idx=i: self._disable_approve(idx))

        # Open output folder in Explorer
        if self._output_path:
            path_str = str(self._output_path.resolve())
            subprocess.Popen(f'explorer "{path_str}"')

        self._log("✓  Wszystkie kroki zakończone!", "ok")
        return all(isinstance(result, dict) and "error" not in result for result in self._step_results)

    def _run_launcher(self) -> None:
        """Runs launcher_orchestrator.py in a separate thread after step 4 completes."""
        import subprocess
        import sys

        def _worker():
            # Step A: run everything up to and including FILL COMPANY STEP 1
            steps_before_checkpoint = [
                "COPY PACKAGE TO RUNTIME",
                "REGISTER USERS",
                "FILL USER PROFILES",
                "FILL COMPANY STEP 1",
            ]
            for step_name in steps_before_checkpoint:
                if self._stop_flag:
                    return
                self._log(f"[Playwright] Start: {step_name}", "info")
                script_map = {
                    "COPY PACKAGE TO RUNTIME": Path(__file__).resolve().parent / "input_package_generator" / "copy_package_to_runtime.py",
                    "REGISTER USERS":          Path(__file__).resolve().parent / "register.py",
                    "FILL USER PROFILES":      Path(__file__).resolve().parent / "fill_profile.py",
                    "FILL COMPANY STEP 1":     Path(__file__).resolve().parent / "fill_company.py",
                }
                script = script_map[step_name]
                result = subprocess.run(
                    [sys.executable, str(script)],
                    cwd=str(script.parent),
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    self._log(f"[Playwright] BŁĄD: {step_name}\n{result.stderr or result.stdout}", "error")
                    return
                self._log(f"[Playwright] Gotowe: {step_name}", "ok")

            # Step B: fill_company.py already handles its own confirmation popup
            # internally — set checkpoint automatically and continue immediately.
            self._checkpoint_event.set()
            self._log("Checkpoint automatyczny — fill_company zakończony", "ok")

            # Step C: run FILL COMPANY STEP 2 and REPORT
            steps_after_checkpoint = [
                "FILL COMPANY STEP 2",
                "GENERATE REGISTRY REPORT",
            ]
            script_map2 = {
                "FILL COMPANY STEP 2":       Path(__file__).resolve().parent / "fill_company_step2.py",
                "GENERATE REGISTRY REPORT":  Path(__file__).resolve().parent / "reporting" / "generate_registry_report.py",
            }
            for step_name in steps_after_checkpoint:
                if self._stop_flag:
                    return
                self._log(f"[Playwright] Start: {step_name}", "info")
                script = script_map2[step_name]
                result = subprocess.run(
                    [sys.executable, str(script)],
                    cwd=str(script.parent),
                    capture_output=True,
                    text=True,
                )
                if result.returncode != 0:
                    self._log(f"[Playwright] BŁĄD: {step_name}\n{result.stderr or result.stdout}", "error")
                    return
                self._log(f"[Playwright] Gotowe: {step_name}", "ok")

            self._log("🏁 Playwright zakończony sukcesem!", "ok")

        threading.Thread(target=_worker, daemon=True).start()

    def _cleanup_runtime_csv(self, pkg_folder: Path, pkg_output: Path) -> None:
        """Keep only rows whose email appears in the canonical _runtime_pkg/users.csv."""
        import csv

        canonical_users_csv = pkg_folder / "_runtime_pkg" / "users.csv"
        try:
            if not canonical_users_csv.exists():
                self._log("[CSV cleanup] Brak _runtime_pkg/users.csv — pomijam czyszczenie CSV.", "info")
                return
            with canonical_users_csv.open(encoding="utf-8", newline="") as fh:
                canonical_emails = {
                    row.get("email", "").strip()
                    for row in csv.DictReader(fh)
                    if row.get("email", "").strip()
                }
            if not canonical_emails:
                self._log("[CSV cleanup] Brak emaili w _runtime_pkg/users.csv — pomijam czyszczenie CSV.", "info")
                return
            self._log(f"[CSV cleanup] Kanoniczne emaile: {canonical_emails}", "info")
        except Exception as exc:
            self._log(f"[CSV cleanup] Ostrzeżenie — nie można odczytać _runtime_pkg/users.csv: {exc}", "error")
            return

        for csv_name in ("users.csv", "companies.csv"):
            csv_path = pkg_output / csv_name
            if not csv_path.exists():
                self._log(f"[CSV cleanup] Nie znaleziono {csv_name} — pomijam.", "info")
                continue
            try:
                with csv_path.open(encoding="utf-8", newline="") as fh:
                    reader = csv.DictReader(fh)
                    fieldnames = reader.fieldnames or []
                    all_rows = list(reader)

                kept = [r for r in all_rows if r.get("email", "").strip() in canonical_emails]
                removed = len(all_rows) - len(kept)

                with csv_path.open("w", encoding="utf-8", newline="") as fh:
                    writer = csv.DictWriter(fh, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(kept)

                self._log(
                    f"[CSV cleanup] {csv_name}: zachowano {len(kept)}, usunięto {removed} wierszy.",
                    "ok",
                )
            except Exception as exc:
                self._log(f"[CSV cleanup] Ostrzeżenie — błąd przy czyszczeniu {csv_name}: {exc}", "error")

    def _show_checkpoint_button(self) -> None:
        if not hasattr(self, "_checkpoint_btn") or self._checkpoint_btn is None:
            self._checkpoint_btn = tk.Button(
                self._log_text.master,
                text="✅ Doładowałem środki — kontynuuj",
                font=(FONT, 13, "bold"),
                bg="#f0a500", fg="black",
                activebackground="#d4920a", activeforeground="black",
                relief="solid", bd=2, padx=24, pady=10,
                cursor="hand2",
                command=self._confirm_checkpoint,
            )
        self._checkpoint_btn.pack(pady=(8, 0))

        import winsound
        winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)

        popup = tk.Toplevel(self.root)
        popup.title("Checkpoint")
        popup.geometry("500x280")
        popup.attributes("-topmost", True)
        popup.resizable(False, False)
        popup.configure(bg="#0d1117")
        tk.Label(
            popup,
            text="DOŁADUJ ŚRODKI",
            font=(FONT, 18, "bold"),
            bg="#0d1117", fg="#f5a623",
        ).pack(padx=32, pady=(28, 8))
        tk.Label(
            popup,
            text="Uzupełnij środki na wszystkich kontach,\nnastępnie kliknij KONTYNUUJ w głównym oknie.",
            font=(FONT, 11),
            bg="#0d1117", fg="#58a6ff",
            justify="center",
        ).pack(padx=32, pady=(0, 20))
        popup.update_idletasks()
        w = popup.winfo_width()
        h = popup.winfo_height()
        x = (popup.winfo_screenwidth() // 2) - (w // 2)
        y = (popup.winfo_screenheight() // 2) - (h // 2)
        popup.geometry(f"{w}x{h}+{x}+{y}")
        self._checkpoint_popup = popup

    def _hide_checkpoint_button(self) -> None:
        if hasattr(self, "_checkpoint_btn") and self._checkpoint_btn:
            self._checkpoint_btn.pack_forget()
        if hasattr(self, "_checkpoint_popup") and self._checkpoint_popup:
            self._checkpoint_popup.destroy()
            self._checkpoint_popup = None

    def _confirm_checkpoint(self) -> None:
        self._checkpoint_event.set()

    def _show_run_launcher_button(self) -> None:
        if not hasattr(self, "_launcher_btn") or self._launcher_btn is None:
            self._launcher_btn = tk.Button(
                self._log_text.master,
                text="▶ Uruchom Playwright",
                font=(FONT, 13, "bold"),
                bg=BLUE, fg="white",
                activebackground="#0860ca", activeforeground="white",
                relief="flat", padx=24, pady=10,
                cursor="hand2",
                command=self._on_run_launcher_clicked,
            )
        self._launcher_btn.pack(pady=(8, 0))

    def _on_run_launcher_clicked(self) -> None:
        if hasattr(self, "_launcher_btn") and self._launcher_btn:
            self._launcher_btn.pack_forget()
        self._run_launcher()

    # FIX 1: save step result to output folder
    def _save_step_result(self, idx: int, result: dict) -> None:
        if self._output_path is None:
            return
        raw_name = STEPS[idx]["name"].replace(" ", "_").replace("/", "_")
        safe_name = raw_name.replace(".json", "")
        file_path = self._output_path / f"{idx + 1:02d}_{safe_name}.json"
        try:
            file_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")
            self._log(f"Zapisano: {file_path.resolve()}", "ok")
        except Exception as exc:
            self._log(f"Błąd zapisu: {exc}", "error")

    def _rename_output_folder(self, identity: dict) -> None:
        """Rename output folder to 001_<company_name> after identity step."""
        if self._output_path is None:
            return
        raw_name = (
            identity.get("brand", {}).get("base_brand_name", "")
            or identity.get("company_name", "")
        )
        if not raw_name:
            return
        clean = re.sub(r"[^a-z0-9_]", "", raw_name.lower().replace(" ", "_"))
        if not clean:
            return
        new_path = self._output_path.parent / f"{self._output_path.name}_{clean}"
        try:
            if new_path.exists():
                import shutil
                shutil.rmtree(new_path)
            self._output_path.rename(new_path)
            self._output_path = new_path
            self._log(f"Folder: 001_{clean}", "ok")
            abs_path = new_path.resolve()
            self.root.after(0, lambda: self._output_label.config(text=f"📁 {abs_path}") if self._output_label else None)
        except Exception as exc:
            self._log(f"Błąd zmiany nazwy folderu: {exc}", "error")

    # ══════════════════════════════════════════════════════════════════════════
    # STEP STATE HELPERS  (main thread via after())
    # ══════════════════════════════════════════════════════════════════════════

    def _set_step_running(self, idx: int) -> None:
        try:
            self._row_frames[idx].config(bg=PANEL, highlightbackground="#d0d7de")
            self._status_labels[idx].config(fg=GOLD)
            self._spinner_frame_idx[idx] = 0
            self._spin(idx)
        except tk.TclError:
            pass

    def _spin(self, idx: int) -> None:
        try:
            lbl = self._status_labels[idx]
            if lbl.cget("fg") == GOLD:
                lbl.config(text=SPINNER_CHARS[self._spinner_frame_idx[idx] % len(SPINNER_CHARS)])
                self._spinner_frame_idx[idx] += 1
                self._spinner_after_ids[idx] = self.root.after(110, lambda: self._spin(idx))
        except tk.TclError:
            pass

    def _set_step_done(self, idx: int) -> None:
        try:
            aid = self._spinner_after_ids[idx]
            if aid:
                self.root.after_cancel(aid)
                self._spinner_after_ids[idx] = None
            self._status_labels[idx].config(text="✓", fg=GREEN)
            done_bg = "#dafbe1"
            self._row_frames[idx].config(bg=done_bg, highlightbackground="#82e0aa")
            for child in self._row_frames[idx].winfo_children():
                try:
                    child.config(bg=done_bg)
                    for gc in child.winfo_children():
                        try:
                            gc.config(bg=done_bg)
                        except tk.TclError:
                            pass
                except tk.TclError:
                    pass
            self._eye_btns[idx].config(state="normal", fg=BLUE, bg=FIELD)
            # FIX 3: hide approve when done
            self._approve_btns[idx].pack_forget()
            # FIX 4: hurdle jump
            self._jump_at_checkpoint(idx)
        except tk.TclError:
            pass

    def _set_step_error(self, idx: int) -> None:
        try:
            aid = self._spinner_after_ids[idx]
            if aid:
                self.root.after_cancel(aid)
                self._spinner_after_ids[idx] = None
            self._status_labels[idx].config(text="✗", fg=RED)
            self._row_frames[idx].config(bg="#ffebe9", highlightbackground="#f78166")
        except tk.TclError:
            pass

    # FIX 3: show / hide APPROVE
    def _enable_approve(self, idx: int) -> None:
        try:
            btn = self._approve_btns[idx]
            btn.config(state="normal")
            btn.pack(side="left")
        except tk.TclError:
            pass

    def _disable_approve(self, idx: int) -> None:
        try:
            self._approve_btns[idx].pack_forget()
        except tk.TclError:
            pass

    def _approve(self) -> None:
        self._approve_event.set()

    # ══════════════════════════════════════════════════════════════════════════
    # JSON PREVIEW
    # ══════════════════════════════════════════════════════════════════════════

    def _show_json_for_step(self, idx: int) -> None:
        result = self._step_results[idx]
        if result is not None:
            self._render_json(result, label=STEPS[idx]["name"])

    def _preview_step(self, idx: int) -> None:
        result = self._step_results[idx]
        if result is not None:
            self._render_json(result, label=STEPS[idx]["name"])

    def _render_json(self, data: dict, label: str = "") -> None:
        try:
            header = f"// {label}\n\n" if label else ""
            text   = header + json.dumps(data, indent=2, ensure_ascii=False)
            w = self._json_text
            w.config(state="normal")
            w.delete("1.0", "end")
            w.insert("1.0", text)
            w.config(state="disabled")
        except tk.TclError:
            pass

    # ══════════════════════════════════════════════════════════════════════════
    # LOG
    # ══════════════════════════════════════════════════════════════════════════

    def _log(self, msg: str, level: str = "info") -> None:
        def _insert():
            try:
                w = self._log_text
                w.config(state="normal")
                w.insert("end", f"[{_ts()}] ", "ts")
                w.insert("end", msg + "\n", level)
                w.see("end")
                w.config(state="disabled")
            except tk.TclError:
                pass
        self.root.after(0, _insert)

    # ══════════════════════════════════════════════════════════════════════════
    # IMAGE PREVIEW POPUP  (after step 2)
    # ══════════════════════════════════════════════════════════════════════════

    _DARK  = "#0d1117"
    _CARD  = "#161b22"
    _EDGE  = "#30363d"
    _FGMUT = "#8b949e"
    _FGLIT = "#c9d1d9"

    def _show_image_preview(self, step_result: dict, output_path: Path) -> None:
        win = tk.Toplevel(self.root)
        win.title("Podgląd grafik — zatwierdź lub wygeneruj ponownie")
        win.geometry("900x600")
        win.configure(bg=self._DARK)
        import winsound
        winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
        win.attributes("-topmost", True)
        win.lift()
        win.focus_force()
        win.grab_set()

        tk.Label(
            win, text="Sprawdź wygenerowane grafiki",
            font=(FONT, 14, "bold"), bg=self._DARK, fg=BLUE,
        ).pack(pady=(16, 12))

        cards_frame = tk.Frame(win, bg=self._DARK)
        cards_frame.pack(fill="both", expand=True, padx=20)

        specs = [
            ("avatar", "Avatar", 200, 200),
            ("logo",   "Logo",   200, 200),
            ("banner", "Banner", 300, 100),
        ]

        for col, (asset_type, title, img_w, img_h) in enumerate(specs):
            cards_frame.grid_columnconfigure(col, weight=1)

            card = tk.Frame(
                cards_frame, bg=self._CARD,
                highlightbackground=self._EDGE, highlightthickness=1,
                padx=12, pady=12,
            )
            card.grid(row=0, column=col, padx=8, sticky="nsew")

            tk.Label(
                card, text=title,
                font=(FONT, 11, "bold"), bg=self._CARD, fg=self._FGLIT,
            ).pack(pady=(0, 6))

            # load image
            path_str = step_result.get(asset_type, "")
            photo = None
            if path_str and not path_str.startswith("ERROR"):
                try:
                    img = Image.open(path_str)
                    img.thumbnail((img_w, img_h), Image.LANCZOS)
                    photo = ImageTk.PhotoImage(img)
                    self._preview_images.append(photo)
                except Exception:
                    pass

            img_lbl = tk.Label(card, bg=self._CARD, width=img_w, height=img_h)
            if photo:
                img_lbl.config(image=photo)
            else:
                img_lbl.config(text="[brak obrazu]", fg=self._FGMUT, font=(FONT, 10))
            img_lbl.pack()

            tk.Button(
                card, text="🔄 Wygeneruj ponownie",
                font=(FONT, 9), bg="#21262d", fg=self._FGLIT,
                activebackground=self._EDGE, activeforeground=self._FGLIT,
                relief="flat", padx=8, pady=4, cursor="hand2",
                command=lambda at=asset_type, cf=card, il=img_lbl, op=output_path,
                               iw=img_w, ih=img_h:
                    self._regenerate_single_image(at, cf, il, op, iw, ih),
            ).pack(pady=(8, 0))

        def _approve():
            win.destroy()
            self._preview_approve_event.set()

        tk.Button(
            win, text="✅ Zatwierdź wszystkie i kontynuuj",
            font=(FONT, 13, "bold"),
            bg=GREEN, fg="#ffffff",
            activebackground="#116329", activeforeground="#ffffff",
            relief="flat", padx=24, pady=10, cursor="hand2",
            command=_approve,
        ).pack(pady=16)

    def _regenerate_single_image(
        self,
        asset_type: str,
        card_frame: tk.Frame,
        image_label: tk.Label,
        output_path: Path,
        img_w: int,
        img_h: int,
    ) -> None:
        status_lbl = tk.Label(
            card_frame, text="⟳ Generuję...",
            font=(FONT, 10), bg=self._CARD, fg=GOLD,
        )
        status_lbl.pack()

        def _worker():
            result = openai_helper.generate_single_image(
                identity=self._step_results[0] or {},
                asset_type=asset_type,
                output_folder=output_path,
            )

            def _update():
                try:
                    status_lbl.destroy()
                except tk.TclError:
                    pass
                path_str = result.get(asset_type, "")
                if result.get("status") == "ok" and path_str and not path_str.startswith("ERROR"):
                    try:
                        img = Image.open(path_str)
                        img.thumbnail((img_w, img_h), Image.LANCZOS)
                        photo = ImageTk.PhotoImage(img)
                        self._preview_images.append(photo)
                        image_label.config(image=photo, text="")
                        self._log(f"🔄 Wygenerowano ponownie: {asset_type}", "ok")
                    except Exception as e:
                        image_label.config(text="[błąd podglądu]", fg=self._FGMUT)
                        self._log(f"Błąd podglądu {asset_type}: {e}", "error")
                else:
                    err = result.get("error", "nieznany błąd")
                    image_label.config(text="[błąd]", fg=self._FGMUT)
                    self._log(f"Błąd regeneracji {asset_type}: {err}", "error")

            self.root.after(0, _update)

        threading.Thread(target=_worker, daemon=True).start()

    # ══════════════════════════════════════════════════════════════════════════
    # NAVIGATION
    # ══════════════════════════════════════════════════════════════════════════

    def _go_back(self) -> None:
        self._stop_flag = True
        self._approve_event.set()
        self._preview_approve_event.set()
        self._preview_images.clear()

        if self._runner_anim_id:
            self.root.after_cancel(self._runner_anim_id)
            self._runner_anim_id = None
        if self._jump_anim_id:
            self.root.after_cancel(self._jump_anim_id)
            self._jump_anim_id = None
        for aid in self._spinner_after_ids:
            if aid:
                self.root.after_cancel(aid)
        self._spinner_after_ids = [None] * len(STEPS)

        if self._screen2:
            self._screen2.destroy()
            self._screen2 = None

        self._step_results    = [None] * len(STEPS)
        self._runner_pos      = 0.0
        self._runner_y_offset = 0.0
        self._hurdles_done    = [False] * len(STEPS)
        self._canvas          = None
        self._track_frame     = None
        self._json_text       = None
        self._log_text        = None

        if self._screen1:
            self._screen1.pack(fill="both", expand=True)
            if self._generated_packages and self._playwright_btn:
                try:
                    self._playwright_btn.config(state="normal")
                except tk.TclError:
                    pass


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    root = tk.Tk()
    BCAutomationApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
