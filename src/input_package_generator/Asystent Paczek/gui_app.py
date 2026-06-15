import logging
import os
import tkinter as tk
from pathlib import Path
from tkinter import messagebox
from tkinter.scrolledtext import ScrolledText

from openai_helper import generate_identity_profile, save_identity_profile
from services.asset_assigner import collect_assets
from services.prompt_generator import generate_asset_prompts_file
from services.query_generator import generate_search_queries_file


IDENTITY_PROMPT = """Wpisz nazwę firmy z przygotowanej listy"""

EXPANSION_PROMPT = """Generate expansion_request.json for the approved identity_profile.json below.

Requirements:
- target_company_count = 15
- include the base company as the first item
- maximize country diversity
- maximize city diversity
- use realistic business addresses
- use realistic coordinates
- auto select categories only from categories_eng.csv
- different companies may use different valid main_category + subcategory pairs if they still realistically fit the base brand and service scope
- do not invent category names
- output only valid JSON

Approved identity_profile.json:
[paste full identity_profile.json here]
"""

LOGS_DIR = Path(__file__).resolve().parent / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

GUI_LOG_PATH = LOGS_DIR / "gui_wizard.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.FileHandler(GUI_LOG_PATH, encoding="utf-8"),
    ],
)

logger = logging.getLogger(__name__)


class PackageWizardApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Asystent Paczek - MVP")
        self.root.geometry("1450x820")
        self.root.minsize(1280, 760)

        self.base_dir = Path(__file__).resolve().parent
        self.workspace_dir = self.base_dir / "workspace"
        self.packages_dir = self.workspace_dir / "packages"
        self.incoming_assets_dir = self.workspace_dir / "incoming_assets"
        sidebar_candidates = [
            "fillator_app.png",
        ]
        success_candidates = [
            "fillator_sukces_ap.png"
        ]

        self.sidebar_image_path = next(
            (self.base_dir / name for name in sidebar_candidates if (self.base_dir / name).exists()),
            self.base_dir / "fillator_app.png",
        )
        self.success_image_path = next(
            (self.base_dir / name for name in success_candidates if (self.base_dir / name).exists()),
            self.base_dir / "fillator_sukces_ap.png",
        )
        self.sidebar_image = None

        self.selected_package_name: str | None = None
        self.current_prompt: str = ""

        self.step_var = tk.StringVar(value="Brak wybranej paczki")
        self.status_var = tk.StringVar(value="Gotowe")

        logger.info("START GUI WIZARD")
        logger.info("base_dir=%s", self.base_dir)
        logger.info("packages_dir=%s", self.packages_dir)
        logger.info("incoming_assets_dir=%s", self.incoming_assets_dir)

        self._build_ui()
        self._load_packages()

    def _build_ui(self) -> None:
        self.root.grid_columnconfigure(0, weight=0)
        self.root.grid_columnconfigure(1, weight=1)
        self.root.grid_rowconfigure(0, weight=1)

        left_frame = tk.Frame(self.root, padx=10, pady=10)
        left_frame.grid(row=0, column=0, sticky="ns")

        right_frame = tk.Frame(self.root, padx=10, pady=10)
        right_frame.grid(row=0, column=1, sticky="nsew")
        right_frame.grid_columnconfigure(0, weight=1, minsize=760)
        right_frame.grid_columnconfigure(1, weight=0, minsize=320)
        right_frame.grid_rowconfigure(1, weight=1)
        right_frame.grid_rowconfigure(2, weight=0)
        right_frame.grid_rowconfigure(3, weight=0)

        tk.Label(left_frame, text="Paczki").pack(anchor="w")
        self.package_listbox = tk.Listbox(left_frame, width=18, height=30, exportselection=False)
        self.package_listbox.pack(fill="y", expand=False, pady=(6, 8))
        self.package_listbox.bind("<<ListboxSelect>>", self._on_package_selected)

        tk.Button(
            left_frame,
            text="Odśwież listę",
            width=18,
            command=self._load_packages,
        ).pack(anchor="w", pady=(0, 12))

        tk.Label(right_frame, text="Bieżący krok", anchor="w").grid(
            row=0, column=0, columnspan=2, sticky="ew"
        )

        self.current_step_label = tk.Label(
            right_frame,
            textvariable=self.step_var,
            anchor="w",
            justify="left",
            bd=1,
            relief="solid",
            padx=8,
            pady=8,
            font=("Arial", 12, "bold"),
            bg="#f8d7da",
        )
        self.current_step_label.grid(
            row=0, column=0, columnspan=2, sticky="ew", pady=(22, 12)
        )

        self.image_frame = tk.Frame(right_frame, bd=1, relief="solid", padx=2, pady=2)
        self.image_frame.grid(row=1, column=0, sticky="nsew", padx=(0, 12), pady=(0, 12))

        self.image_title_label = tk.Label(self.image_frame, text="Fillator", anchor="w")
        self.image_title_label.pack(anchor="w", pady=(0, 8))

        self.image_label = tk.Label(
            self.image_frame,
            text="Brak pliku fillator_app.png",
            bd=0,
            anchor="center",
            justify="center",
        )
        self.image_label.pack(fill="both", expand=True)

        steps_frame = tk.Frame(right_frame)
        steps_frame.grid(row=1, column=1, sticky="ne", pady=(0, 12))

        tk.Label(steps_frame, text="Lista kroków", anchor="w").pack(anchor="w")
        self.steps_text = ScrolledText(steps_frame, wrap="none", width=34, height=10)
        self.steps_text.pack(fill="both", expand=False, pady=(4, 0))

        tk.Label(right_frame, text="Instrukcja", anchor="w").grid(
            row=2, column=0, columnspan=2, sticky="ew"
        )
        self.instruction_text = ScrolledText(right_frame, wrap="word", height=8)
        self.instruction_text.grid(row=2, column=0, columnspan=2, sticky="ew", pady=(22, 12))

        tk.Label(right_frame, text="Prompt / treść pomocnicza", anchor="w").grid(
            row=3, column=0, columnspan=2, sticky="ew"
        )
        self.prompt_text = ScrolledText(right_frame, wrap="word", height=4)
        self.prompt_text.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(22, 12))

        button_frame = tk.Frame(right_frame)
        button_frame.grid(row=4, column=0, columnspan=2, sticky="w")

        tk.Button(button_frame, text="Otwórz folder paczki", width=18, command=self._open_package_folder).pack(side="left", padx=(0, 8))
        tk.Button(button_frame, text="Otwórz incoming_assets", width=18, command=self._open_incoming_assets_folder).pack(side="left", padx=(0, 8))
        tk.Button(button_frame, text="Generate", width=12, command=self._run_generate_for_selected_package).pack(side="left", padx=(0, 8))
        tk.Button(button_frame, text="Collect now", width=12, command=self._run_collect_now).pack(side="left", padx=(0, 8))
        tk.Button(button_frame, text="Generuj AI", width=12, command=self._run_generate_ai).pack(side="left", padx=(0, 8))
        tk.Button(button_frame, text="Kopiuj prompt", width=12, command=self._copy_prompt).pack(side="left", padx=(0, 8))
        tk.Button(button_frame, text="Check status", width=12, command=self._check_status_popup).pack(side="left")

        status_bar = tk.Label(self.root, textvariable=self.status_var, anchor="w", bd=1, relief="sunken", padx=8)
        status_bar.grid(row=1, column=0, columnspan=2, sticky="ew")

        self._load_sidebar_image()
        self._set_readonly_text(self.instruction_text, "")
        self._set_readonly_text(self.prompt_text, "")
        self._render_steps_overview([])

    def _load_sidebar_image(self, image_path: Path | None = None) -> None:
        selected_image_path = image_path or self.sidebar_image_path

        if not selected_image_path.exists():
            self.image_label.config(
                image="",
                text=f"Brak pliku\n{selected_image_path.name}",
            )
            return

        try:
            self.root.update_idletasks()
            image = tk.PhotoImage(file=str(selected_image_path))

            original_width = image.width()
            original_height = image.height()

            available_width = self.image_frame.winfo_width() - 8
            available_height = self.image_frame.winfo_height() - 28

            if available_width < 50:
                available_width = 760
            if available_height < 50:
                available_height = 420

            factor_w = max(1, (original_width + available_width - 1) // available_width)
            factor_h = max(1, (original_height + available_height - 1) // available_height)
            factor = max(factor_w, factor_h)

            image = image.subsample(factor, factor)
            self.sidebar_image = image

            self.image_label.config(
                image=self.sidebar_image,
                text="",
            )
        except Exception as exc:
            self.image_label.config(
                image="",
                text=f"Błąd grafiki:\n{exc}",
            )

    def _load_packages(self) -> None:
        self.package_listbox.delete(0, tk.END)

        if not self.packages_dir.exists():
            logger.warning("Brak folderu paczek: %s", self.packages_dir)
            self.status_var.set(f"Brak folderu: {self.packages_dir}")
            return

        packages = sorted([p.name for p in self.packages_dir.iterdir() if p.is_dir()])
        logger.info("Wczytano listę paczek | count=%s", len(packages))

        for package_name in packages:
            self.package_listbox.insert(tk.END, package_name)

        if packages:
            self.package_listbox.selection_set(0)
            self.package_listbox.activate(0)
            self._show_package(packages[0])
            self.status_var.set(f"Wczytano paczki: {len(packages)}")
        else:
            self.selected_package_name = None
            self.step_var.set("Brak paczek")
            self._set_readonly_text(
                self.instruction_text,
                "Nie znaleziono folderów paczek w workspace/packages.",
            )
            self._set_readonly_text(self.prompt_text, "")
            self.status_var.set("Nie znaleziono paczek")

    def _on_package_selected(self, event=None) -> None:
        selection = self.package_listbox.curselection()
        if not selection:
            return

        package_name = self.package_listbox.get(selection[0])
        self._show_package(package_name)

    def _show_package(self, package_name: str) -> None:
        self.selected_package_name = package_name
        package_dir = self.packages_dir / package_name
        incoming_dir = self.incoming_assets_dir / package_name

        step_name, instruction, prompt, missing_items = self._build_package_view(
            package_name=package_name,
            package_dir=package_dir,
            incoming_dir=incoming_dir,
        )

        steps_overview = self._build_steps_overview(package_dir, incoming_dir)

        step_titles = {
            "identity_profile.json": "KROK 1: identity_profile.json",
            "expansion_request.json": "KROK 2: expansion_request.json",
            "generate": "KROK 3: generate",
            "avatar": "KROK 4: avatar",
            "logo": "KROK 5: logo",
            "banner": "KROK 6: banner",
            "COMPLETE": "KROK 7: COMPLETE",
        }
        current_step_title = step_titles.get(step_name, step_name)

        logger.info(
            "Wybrano paczkę | package=%s | step=%s | missing=%s",
            package_name,
            current_step_title,
            ", ".join(missing_items) if missing_items else "brak",
        )

        self.step_var.set(f"{package_name}\nAktualny krok: {current_step_title}")
        self.current_prompt = prompt
        self._render_steps_overview(steps_overview)
        self._set_readonly_text(self.instruction_text, instruction)
        self._set_readonly_text(self.prompt_text, prompt)

        if step_name == "COMPLETE":
            self._apply_current_step_style("done")
            self._load_sidebar_image(self.success_image_path)
            self.status_var.set("Status: COMPLETE")
        else:
            self._apply_current_step_style("current")
            self._load_sidebar_image(self.sidebar_image_path)
            self.status_var.set("Braki: " + ", ".join(missing_items))

    def _file_has_content(self, file_path: Path) -> bool:
        if not file_path.exists() or not file_path.is_file():
            return False

        try:
            return bool(file_path.read_text(encoding="utf-8", errors="ignore").strip())
        except Exception:
            try:
                return file_path.stat().st_size > 0
            except Exception:
                return False

    def _build_steps_overview(self, package_dir: Path, incoming_dir: Path) -> list[tuple[str, str]]:
        identity_ok = self._file_has_content(package_dir / "identity_profile.json")
        expansion_ok = self._file_has_content(package_dir / "expansion_request.json")
        generate_ok = (
            self._file_has_content(package_dir / "asset_prompts.txt")
            and self._file_has_content(package_dir / "search_queries.txt")
        )
        avatar_ok = self._asset_exists(incoming_dir / "avatar")
        logo_ok = self._asset_exists(incoming_dir / "logo")
        banner_ok = self._asset_exists(incoming_dir / "banner")
        package_complete = (
            (package_dir / "identity_001_avatar.png").exists()
            and (package_dir / "identity_001_logo.png").exists()
            and (package_dir / "identity_001_banner.png").exists()
        )

        checks = [
            ("KROK 1: identity_profile.json", identity_ok),
            ("KROK 2: expansion_request.json", expansion_ok),
            ("KROK 3: generate", generate_ok),
            ("KROK 4: avatar", avatar_ok),
            ("KROK 5: logo", logo_ok),
            ("KROK 6: banner", banner_ok),
            ("KROK 7: COMPLETE", identity_ok and expansion_ok and generate_ok and package_complete),
        ]

        first_not_done_index = None
        for index, (_, is_done) in enumerate(checks):
            if not is_done:
                first_not_done_index = index
                break

        rows: list[tuple[str, str]] = []
        for index, (label, _) in enumerate(checks):
            if first_not_done_index is None:
                status = "done"
            elif index < first_not_done_index:
                status = "done"
            elif index == first_not_done_index:
                status = "current"
            else:
                status = "pending"

            rows.append((label, status))

        return rows

    def _build_package_view(
        self,
        package_name: str,
        package_dir: Path,
        incoming_dir: Path,
    ) -> tuple[str, str, str, list[str]]:
        identity_path = package_dir / "identity_profile.json"
        expansion_path = package_dir / "expansion_request.json"
        asset_prompts_path = package_dir / "asset_prompts.txt"
        search_queries_path = package_dir / "search_queries.txt"

        identity_ready = self._file_has_content(identity_path)
        expansion_ready = self._file_has_content(expansion_path)
        asset_prompts_ready = self._file_has_content(asset_prompts_path)
        search_queries_ready = self._file_has_content(search_queries_path)
        generate_ready = asset_prompts_ready and search_queries_ready

        avatar_present = self._asset_exists(incoming_dir / "avatar")
        logo_present = self._asset_exists(incoming_dir / "logo")
        banner_present = self._asset_exists(incoming_dir / "banner")

        missing_items = []

        if not identity_ready:
            missing_items.append("identity_profile.json")
        if not expansion_ready:
            missing_items.append("expansion_request.json")
        if not asset_prompts_ready:
            missing_items.append("asset_prompts.txt")
        if not search_queries_ready:
            missing_items.append("search_queries.txt")
        if not avatar_present:
            missing_items.append("avatar")
        if not logo_present:
            missing_items.append("logo")
        if not banner_present:
            missing_items.append("banner")

        missing_text = ", ".join(missing_items) if missing_items else "brak"

        if not identity_ready:
            instruction = (
                "Krok 1: identity_profile.json\n\n"
                "TERAZ ZRÓB:\n"
                "1. Wygeneruj identity_profile.json ręcznie w GPT Identity.\n"
                f"2. Otwórz folder paczki:\n{package_dir}\n"
                "3. Wklej plik identity_profile.json do tego folderu.\n"
                "4. Kliknij Check status.\n\n"
                f"BRAKUJE:\n- {missing_text}\n\n"
                "NASTĘPNY KROK:\n"
                "Po wykryciu identity_profile.json GUI przejdzie do expansion_request.json."
            )
            return "identity_profile.json", instruction, IDENTITY_PROMPT, missing_items

        if not expansion_ready:
            instruction = (
                "Krok 2: expansion_request.json\n\n"
                "TERAZ ZRÓB:\n"
                "1. Skopiuj approved identity_profile.json do GPT Expansion.\n"
                "2. Użyj promptu z dolnego pola.\n"
                f"3. Wklej gotowy expansion_request.json do folderu:\n{package_dir}\n"
                "4. Kliknij Check status.\n\n"
                f"BRAKUJE:\n- {missing_text}\n\n"
                "NASTĘPNY KROK:\n"
                "Po wykryciu expansion_request.json uruchom Generate."
            )
            return "expansion_request.json", instruction, EXPANSION_PROMPT, missing_items

        if not generate_ready:
            instruction = (
                "Krok 3: generate\n\n"
                "TERAZ ZRÓB:\n"
                "1. Kliknij przycisk Generate.\n"
                "2. GUI uruchomi istniejący backend dla tej jednej paczki.\n"
                "3. Po generate kliknij Check status.\n\n"
                f"BRAKUJE:\n- {missing_text}\n\n"
                "NASTĘPNY KROK:\n"
                "Po wygenerowaniu asset_prompts.txt i search_queries.txt GUI przejdzie do avatara."
            )
            return "generate", instruction, "", missing_items

        asset_prompts_text = self._read_text_file(asset_prompts_path)

        if not avatar_present:
            instruction = (
                "Krok 4: avatar\n\n"
                "TERAZ ZRÓB:\n"
                "1. Skopiuj prompt z dolnego pola.\n"
                "2. Przygotuj i pobierz plik avatara.\n"
                f"3. Wrzuć plik do folderu:\n{incoming_dir / 'avatar'}\n"
                "4. Kliknij Check status.\n\n"
                f"BRAKUJE:\n- {missing_text}\n\n"
                "NASTĘPNY KROK:\n"
                "Po wykryciu avatara GUI przejdzie do logo.\n\n"
                "UWAGA:\n"
                "Na MVP pokazuję cały asset_prompts.txt, bez wycinania osobnej sekcji avatara."
            )
            return "avatar", instruction, asset_prompts_text, missing_items

        if not logo_present:
            instruction = (
                "Krok 5: logo\n\n"
                "TERAZ ZRÓB:\n"
                "1. Skopiuj prompt z dolnego pola.\n"
                "2. Przygotuj i pobierz plik logo.\n"
                f"3. Wrzuć plik do folderu:\n{incoming_dir / 'logo'}\n"
                "4. Kliknij Check status.\n\n"
                f"BRAKUJE:\n- {missing_text}\n\n"
                "NASTĘPNY KROK:\n"
                "Po wykryciu logo GUI przejdzie do bannera.\n\n"
                "UWAGA:\n"
                "Na MVP pokazuję cały asset_prompts.txt, bez wycinania osobnej sekcji logo."
            )
            return "logo", instruction, asset_prompts_text, missing_items

        if not banner_present:
            instruction = (
                "Krok 6: banner\n\n"
                "TERAZ ZRÓB:\n"
                "1. Skopiuj prompt z dolnego pola.\n"
                "2. Przygotuj i pobierz plik bannera.\n"
                f"3. Wrzuć plik do folderu:\n{incoming_dir / 'banner'}\n"
                "4. Kliknij Check status.\n\n"
                f"BRAKUJE:\n- {missing_text}\n\n"
                "NASTĘPNY KROK:\n"
                "Po wrzuceniu bannera kliknij Collect now, żeby pliki zostały skopiowane i nazwane poprawnie.\n\n"
                "UWAGA:\n"
                "Na MVP pokazuję cały asset_prompts.txt, bez wycinania osobnej sekcji bannera."
            )
            return "banner", instruction, asset_prompts_text, missing_items

        package_complete = (
            (package_dir / "identity_001_avatar.png").exists()
            and (package_dir / "identity_001_logo.png").exists()
            and (package_dir / "identity_001_banner.png").exists()
        )

        if not package_complete:
            instruction = (
                "Krok 7: collect now\n\n"
                "TERAZ ZRÓB:\n"
                "1. Upewnij się, że avatar, logo i banner są wrzucone do incoming_assets.\n"
                "2. Kliknij przycisk Collect now.\n"
                "3. GUI uruchomi backend collect.\n"
                "4. Pliki zostaną skopiowane do folderu paczki i dostaną właściwe nazwy.\n"
                "5. Kliknij Check status.\n\n"
                "BRAKUJE:\n- plików docelowych w folderze paczki\n\n"
                "NASTĘPNY KROK:\n"
                "Po collect paczka przejdzie na COMPLETE."
            )
            return "banner", instruction, "", []

        instruction = (
            "Krok 7: COMPLETE\n\n"
            "TERAZ ZRÓB:\n"
            "1. Paczka wygląda na kompletną.\n"
            "2. Możesz przejść do następnej paczki.\n\n"
            "BRAKUJE:\n- brak\n\n"
            "NASTĘPNY KROK:\n"
            "Wybierz kolejną paczkę z listy po lewej."
        )
        return "COMPLETE", instruction, "", []

    def _collect_missing_items(
        self,
        identity_path: Path,
        expansion_path: Path,
        asset_prompts_path: Path,
        search_queries_path: Path,
        avatar_present: bool,
        logo_present: bool,
        banner_present: bool,
    ) -> list[str]:
        missing = []

        if not identity_path.exists():
            missing.append("identity_profile.json")
        if not expansion_path.exists():
            missing.append("expansion_request.json")
        if not asset_prompts_path.exists():
            missing.append("asset_prompts.txt")
        if not search_queries_path.exists():
            missing.append("search_queries.txt")
        if not avatar_present:
            missing.append("avatar")
        if not logo_present:
            missing.append("logo")
        if not banner_present:
            missing.append("banner")

        return missing

    def _asset_exists(self, asset_dir: Path) -> bool:
        if not asset_dir.exists():
            return False

        for path in asset_dir.rglob("*"):
            if path.is_file():
                return True

        return False

    def _read_text_file(self, file_path: Path) -> str:
        try:
            return file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return file_path.read_text(encoding="utf-8", errors="replace")
        except Exception as exc:
            return f"Nie udało się odczytać pliku:\n{file_path}\n\n{exc}"

    def _set_readonly_text(self, widget: ScrolledText, value: str) -> None:
        widget.config(state="normal")
        widget.delete("1.0", tk.END)
        widget.insert("1.0", value)
        widget.config(state="disabled")

    def _render_steps_overview(self, rows: list[tuple[str, str]]) -> None:
        self.steps_text.config(state="normal")
        self.steps_text.delete("1.0", tk.END)

        self.steps_text.tag_configure("done_dot", foreground="#1f7a1f")
        self.steps_text.tag_configure("current_dot", foreground="#d97706")
        self.steps_text.tag_configure("pending_dot", foreground="#c62828")
        self.steps_text.tag_configure("step_text", foreground="#111111")
        self.steps_text.tag_configure("legend_done", foreground="#1f7a1f")
        self.steps_text.tag_configure("legend_current", foreground="#d97706")
        self.steps_text.tag_configure("legend_pending", foreground="#c62828")

        dot_tags = {
            "done": "done_dot",
            "current": "current_dot",
            "pending": "pending_dot",
        }

        for label, status in rows:
            self.steps_text.insert(tk.END, "● ", dot_tags[status])
            self.steps_text.insert(tk.END, f"{label}\n", "step_text")

        self.steps_text.insert(tk.END, "\nLegenda:\n", "step_text")
        self.steps_text.insert(tk.END, "● ", "legend_done")
        self.steps_text.insert(tk.END, "zakończony\n", "step_text")
        self.steps_text.insert(tk.END, "● ", "legend_current")
        self.steps_text.insert(tk.END, "bieżący krok\n", "step_text")
        self.steps_text.insert(tk.END, "● ", "legend_pending")
        self.steps_text.insert(tk.END, "jeszcze niegotowy / brak", "step_text")

        self.steps_text.config(state="disabled")

    def _apply_current_step_style(self, status: str) -> None:
        colors = {
            "done": "#d9f2d9",
            "current": "#ffe8b3",
            "pending": "#f8d7da",
        }
        self.current_step_label.config(bg=colors.get(status, "#f8d7da"))

    def _open_package_folder(self) -> None:
        if not self.selected_package_name:
            messagebox.showwarning("Brak paczki", "Najpierw wybierz paczkę.")
            return

        folder = self.packages_dir / self.selected_package_name
        self._open_folder(folder)

    def _open_incoming_assets_folder(self) -> None:
        if not self.selected_package_name:
            messagebox.showwarning("Brak paczki", "Najpierw wybierz paczkę.")
            return

        folder = self.incoming_assets_dir / self.selected_package_name
        folder.mkdir(parents=True, exist_ok=True)
        self._open_folder(folder)

    def _open_folder(self, folder: Path) -> None:
        try:
            logger.info("Open folder | path=%s", folder)
            os.startfile(str(folder))
        except AttributeError:
            logger.info("Open folder fallback | path=%s", folder)
            messagebox.showinfo("Folder", str(folder))
        except FileNotFoundError:
            logger.exception("Folder nie istnieje | path=%s", folder)
            messagebox.showerror("Błąd", f"Folder nie istnieje:\n{folder}")
        except Exception as exc:
            logger.exception("Nie udało się otworzyć folderu | path=%s", folder)
            messagebox.showerror("Błąd", f"Nie udało się otworzyć folderu:\n{folder}\n\n{exc}")
    
    def _run_generate_for_selected_package(self) -> None:
        if not self.selected_package_name:
            logger.warning("Generate kliknięty bez wybranej paczki")
            messagebox.showwarning("Brak paczki", "Najpierw wybierz paczkę.")
            return

        package_dir = self.packages_dir / self.selected_package_name

        if not package_dir.exists():
            logger.error("Generate - brak folderu paczki | path=%s", package_dir)
            messagebox.showerror("Błąd", f"Folder paczki nie istnieje:\n{package_dir}")
            return

        try:
            logger.info("Generate START | package=%s", self.selected_package_name)
            generate_asset_prompts_file(package_dir)
            generate_search_queries_file(package_dir)
            logger.info("Generate OK | package=%s", self.selected_package_name)

            self._show_package(self.selected_package_name)
            self.status_var.set(f"Generate OK: {self.selected_package_name}")
            messagebox.showinfo(
                "Generate",
                f"Wygenerowano:\n- asset_prompts.txt\n- search_queries.txt\n\nPaczka: {self.selected_package_name}"
            )
        except Exception as exc:
            logger.exception("Generate ERROR | package=%s", self.selected_package_name)
            messagebox.showerror(
                "Generate - błąd",
                f"Nie udało się wykonać generate dla paczki:\n{self.selected_package_name}\n\n{exc}"
            )

    def _run_collect_now(self) -> None:
        if not self.selected_package_name:
            logger.warning("Collect now kliknięty bez wybranej paczki")
            messagebox.showwarning("Brak paczki", "Najpierw wybierz paczkę.")
            return

        try:
            logger.info("Collect START | selected_package=%s", self.selected_package_name)
            result = collect_assets(self.incoming_assets_dir, self.packages_dir)
            logger.info(
                "Collect OK | selected_package=%s | packages_found=%s | assets_copied=%s | assets_missing=%s",
                self.selected_package_name,
                result["packages_found"],
                result["assets_copied"],
                result["assets_missing"],
            )

            self._show_package(self.selected_package_name)
            self.status_var.set(f"Collect OK: {self.selected_package_name}")
            messagebox.showinfo(
                "Collect now",
                f"Packages found: {result['packages_found']}\n"
                f"Assets copied: {result['assets_copied']}\n"
                f"Assets missing: {result['assets_missing']}"
            )
        except Exception as exc:
            logger.exception("Collect ERROR | selected_package=%s", self.selected_package_name)
            messagebox.showerror(
                "Collect now - błąd",
                f"Nie udało się wykonać collect.\n\n{exc}"
            )
    def _run_generate_ai(self) -> None:
        if not self.selected_package_name:
            messagebox.showwarning("Brak paczki", "Najpierw wybierz paczkę.")
            return

        package_dir = self.packages_dir / self.selected_package_name
        output_path = package_dir / "identity_profile.json"

        if output_path.exists():
            overwrite = messagebox.askyesno(
                "Plik już istnieje",
                f"identity_profile.json już istnieje w tej paczce.\n\nCzy chcesz go nadpisać?",
            )
            if not overwrite:
                return

        try:
            logger.info("Generuj AI START | package=%s", self.selected_package_name)
            self.status_var.set("Generuję identity_profile.json...")
            self.root.update_idletasks()

            profile = generate_identity_profile({"company": self.selected_package_name})
            save_identity_profile(profile, str(output_path))

            logger.info("Generuj AI OK | package=%s | output=%s", self.selected_package_name, output_path)
            self._show_package(self.selected_package_name)
            self.status_var.set(f"Generuj AI OK: {self.selected_package_name}")
            messagebox.showinfo(
                "Generuj AI",
                f"Wygenerowano identity_profile.json\n\nPaczka: {self.selected_package_name}\nPlik: {output_path}",
            )
        except Exception as exc:
            logger.exception("Generuj AI ERROR | package=%s", self.selected_package_name)
            self.status_var.set("Błąd generowania AI")
            messagebox.showerror(
                "Generuj AI — błąd",
                f"Nie udało się wygenerować profilu dla:\n{self.selected_package_name}\n\n{exc}",
            )

    def _copy_prompt(self) -> None:
        if not self.current_prompt.strip():
            messagebox.showinfo("Brak promptu", "Dla tego kroku nie ma promptu do skopiowania.")
            return

        self.root.clipboard_clear()
        self.root.clipboard_append(self.current_prompt)
        self.root.update()
        self.status_var.set("Prompt skopiowany do schowka")

    def _check_status_popup(self) -> None:
        if not self.selected_package_name:
            logger.warning("Check status kliknięty bez wybranej paczki")
            messagebox.showwarning("Brak paczki", "Najpierw wybierz paczkę.")
            return

        package_dir = self.packages_dir / self.selected_package_name
        incoming_dir = self.incoming_assets_dir / self.selected_package_name

        step_name, _, _, missing_items = self._build_package_view(
            package_name=self.selected_package_name,
            package_dir=package_dir,
            incoming_dir=incoming_dir,
        )

        logger.info(
            "Check status | package=%s | step=%s | missing=%s",
            self.selected_package_name,
            step_name,
            ", ".join(missing_items) if missing_items else "brak",
        )

        self._show_package(self.selected_package_name)

        if step_name == "COMPLETE":
            messagebox.showinfo("Status", f"{self.selected_package_name}\n\nCOMPLETE")
            return

        messagebox.showinfo(
            "Status",
            f"{self.selected_package_name}\n\nBieżący krok: {step_name}\nBraki: {', '.join(missing_items)}",
        )


def main() -> None:
    try:
        logger.info("main() START")
        root = tk.Tk()
        PackageWizardApp(root)
        root.mainloop()
        logger.info("main() STOP")
    except Exception:
        logger.exception("FATAL GUI ERROR")
        raise


if __name__ == "__main__":
    main()