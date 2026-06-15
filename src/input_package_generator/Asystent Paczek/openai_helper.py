# openai_helper.py
# Ten moduł odpowiada za generowanie identity_profile.json przez OpenAI API
# Na razie działa w trybie MOCK (bez prawdziwego wywołania API)

import json
import os

MOCK_MODE = True  # Zmień na False gdy będziesz gotowy użyć prawdziwego API

def generate_identity_profile(input_data: dict) -> dict:
    """
    Przyjmuje dane wejściowe (np. imię, firma, email)
    i zwraca wygenerowany identity_profile jako słownik Python.
    """
    if MOCK_MODE:
        # Zwracamy przykładowy JSON — idealny do testowania GUI
        profile = {
            "first_name": input_data.get("first_name", "Jan"),
            "last_name": input_data.get("last_name", "Kowalski"),
            "email": input_data.get("email", "jan.kowalski@example.com"),
            "company": input_data.get("company", "Przykładowa Firma"),
            "generated_by": "MOCK",
            "status": "ok"
        }
        return profile
    else:
        # Tu będzie prawdziwe wywołanie OpenAI — na razie puste
        raise NotImplementedError("Prawdziwe API jeszcze nie podpięte")

def save_identity_profile(profile: dict, output_path: str = "identity_profile.json"):
    """
    Zapisuje wygenerowany profil do pliku JSON.
    """
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2, ensure_ascii=False)
    print(f"Zapisano: {output_path}")