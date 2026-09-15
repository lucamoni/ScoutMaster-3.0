import io
import os
import re
from datetime import date, datetime
from typing import Any

import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from paddleocr import PaddleOCR

MAX_FILE_BYTES = 5 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
DATE_PATTERNS = (
    re.compile(r"(?<!\d)(\d{2})[./-](\d{2})[./-](\d{2,4})(?!\d)"),
    re.compile(r"(?<!\d)(\d{4})[./-](\d{2})[./-](\d{2})(?!\d)"),
)
AMOUNT_RE = re.compile(r"(?<!\d)(\d{1,6}(?:[.,]\d{2}))(?!\d)")
TOTAL_WORDS = ("totale", "total", "importo", "da pagare", "pagato")
EXCLUDED_AMOUNT_WORDS = ("subtotale", "iva", "imponibile", "resto", "sconto")
FOOD_WORDS = ("aliment", "supermerc", "market", "coop", "conad", "esselunga", "pane", "frutta", "kambu")
TOOLS_WORDS = ("ferrament", "brico", "leroy", "legno", "vite", "utensil", "attrezz")
IGNORE_SUPPLIER_WORDS = ("scontrino", "documento commerciale", "partita iva", "p.iva", "codice fiscale", "totale")

app = FastAPI(title="ScoutMaster PaddleOCR", version="1.0.0")
ocr = PaddleOCR(
    lang="it",
    ocr_version="PP-OCRv5",
    use_doc_orientation_classify=True,
    use_doc_unwarping=True,
    use_textline_orientation=True,
)


def require_token(token: str | None) -> None:
    configured = os.getenv("OCR_SERVICE_TOKEN", "").strip()
    if configured and token != configured:
        raise HTTPException(status_code=401, detail="Token OCR non valido")


def result_payload(result: Any) -> dict[str, Any]:
    payload = getattr(result, "json", result)
    if callable(payload):
        payload = payload()
    if isinstance(payload, str):
        import json
        payload = json.loads(payload)
    if isinstance(payload, dict) and isinstance(payload.get("res"), dict):
        return payload["res"]
    return payload if isinstance(payload, dict) else {}


def recognize(image: np.ndarray) -> tuple[list[str], float]:
    lines: list[str] = []
    scores: list[float] = []
    for result in ocr.predict(image):
        payload = result_payload(result)
        texts = payload.get("rec_texts") or []
        confidences = payload.get("rec_scores") or []
        for index, value in enumerate(texts):
            text = str(value).strip()
            if not text:
                continue
            lines.append(text)
            if index < len(confidences):
                scores.append(float(confidences[index]))
    confidence = sum(scores) / len(scores) if scores else 0.0
    return lines, round(confidence, 4)


def parse_date(lines: list[str]) -> str | None:
    for line in lines:
        for index, pattern in enumerate(DATE_PATTERNS):
            match = pattern.search(line)
            if not match:
                continue
            try:
                if index == 0:
                    day, month, year = match.groups()
                    year_num = int(year)
                    if year_num < 100:
                        year_num += 2000
                    parsed = date(year_num, int(month), int(day))
                else:
                    year, month, day = match.groups()
                    parsed = date(int(year), int(month), int(day))
                if date(2000, 1, 1) <= parsed <= date.today():
                    return parsed.isoformat()
            except ValueError:
                continue
    return None


def parse_amount(lines: list[str]) -> float | None:
    ranked: list[tuple[int, int, float]] = []
    for line_index, line in enumerate(lines):
        lowered = line.lower()
        if any(word in lowered for word in EXCLUDED_AMOUNT_WORDS):
            continue
        priority = 2 if any(word in lowered for word in TOTAL_WORDS) else 1
        for raw in AMOUNT_RE.findall(line):
            value = float(raw.replace(".", "").replace(",", ".") if "," in raw else raw)
            if 0 < value < 100000:
                ranked.append((priority, line_index, value))
    if not ranked:
        return None
    ranked.sort(key=lambda item: (item[0], item[1], item[2]))
    return round(ranked[-1][2], 2)


def parse_supplier(lines: list[str]) -> str | None:
    for line in lines[:10]:
        cleaned = re.sub(r"\s+", " ", line).strip(" -*")
        lowered = cleaned.lower()
        if len(cleaned) < 3 or not any(character.isalpha() for character in cleaned):
            continue
        if any(word in lowered for word in IGNORE_SUPPLIER_WORDS):
            continue
        if AMOUNT_RE.search(cleaned) or any(pattern.search(cleaned) for pattern in DATE_PATTERNS):
            continue
        return cleaned[:120]
    return None


def choose_category(lines: list[str], categories: list[str]) -> str:
    if not categories:
        return "Altro"
    text = " ".join(lines).lower()

    def find_category(words: tuple[str, ...], preferred: tuple[str, ...]) -> str | None:
        if not any(word in text for word in words):
            return None
        for category in categories:
            lowered = category.lower()
            if any(word in lowered for word in preferred):
                return category
        return None

    food = find_category(FOOD_WORDS, ("kambu", "aliment", "vitto", "cibo"))
    if food:
        return food
    tools = find_category(TOOLS_WORDS, ("materiale", "attrezz", "ferrament"))
    if tools:
        return tools
    return next((category for category in categories if category.lower() == "altro"), categories[0])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "engine": "PaddleOCR"}


@app.post("/v1/receipts/parse")
async def parse_receipt(
    file: UploadFile = File(...),
    categories: str = Form("[]"),
    x_ocr_token: str | None = Header(default=None),
) -> dict[str, Any]:
    require_token(x_ocr_token)
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Tipo di file non consentito")

    raw = await file.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File troppo grande")

    try:
        image = Image.open(io.BytesIO(raw))
        image.verify()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=415, detail="Immagine non valida")

    try:
        import json
        parsed_categories = json.loads(categories)
        if not isinstance(parsed_categories, list):
            parsed_categories = []
        safe_categories = [str(value)[:100] for value in parsed_categories[:100]]
    except ValueError:
        safe_categories = []

    lines, confidence = recognize(np.asarray(image))
    if not lines:
        raise HTTPException(status_code=422, detail="Nessun testo riconosciuto")

    return {
        "provider": "paddleocr",
        "importo": parse_amount(lines),
        "data": parse_date(lines),
        "fornitore": parse_supplier(lines),
        "voce_spesa": choose_category(lines, safe_categories),
        "confidence": confidence,
        "raw_text": "\n".join(lines)[:12000],
    }
