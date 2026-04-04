"""
Traycer VLM Analysis Service

Providers:
  - gemini   : Google Gemini API (default for demo)
  - lmstudio : Local LM Studio (OpenAI-compatible, optional)
  - mock     : Fixed response, no model needed

Run:
  pip install -r requirements.txt
  VLM_PROVIDER=mock     uvicorn main:app --port 8100
  VLM_PROVIDER=gemini   GEMINI_API_KEY=xxx uvicorn main:app --port 8100
  VLM_PROVIDER=lmstudio uvicorn main:app --port 8100
"""

import base64
import io
import json
import os
import re
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Traycer VLM Service", version="0.2.0")

# ── Config ──

VLM_PROVIDER = os.environ.get("VLM_PROVIDER", "mock")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-pro-preview")
LMSTUDIO_BASE_URL = os.environ.get("LMSTUDIO_BASE_URL", "http://127.0.0.1:1234")
LMSTUDIO_MODEL = os.environ.get("LMSTUDIO_MODEL", "gemma-4-e4b-it")

# ── Prompt ──

VLM_PROMPT = """You analyze a photo of a returned cafeteria tray or plate.

Your task is to identify only the meaningful leftover food items that are still visibly present in a significant way.

Return STRICT valid JSON only.
Do not use markdown.
Do not add explanations.
Do not add any text before or after the JSON.

Use this exact schema:
{
  "items": [
    {
      "name": "string",
      "category": "protein | starch | vegetable | fruit | dairy | bread | dessert | beverage | other",
      "estimated_percent_left": 0,
      "consumption_state": "fully_eaten | mostly_eaten | half_left | mostly_left | untouched",
      "confidence": 0.0
    }
  ],
  "tray_completeness": "full_tray | partial | empty_tray",
  "overall_confidence": 0.0,
  "notes": "string"
}

Rules:
- Only include food or drink items that are meaningfully present.
- Ignore tiny traces, crumbs, sauce residue, a few grains of rice, a few isolated pasta pieces, and any negligible leftovers.
- If an item is present only as a trace, do not include it.
- estimated_percent_left must be an integer between 0 and 100.
- confidence and overall_confidence must be numbers between 0.0 and 1.0.
- Use short, simple item names in English.
- If category is unclear, use "other".
- If the tray is almost empty and only trace residues remain, return an empty items array.
- Be conservative and do not invent unseen items."""

# ── Pydantic models ──


class AnalyzeRequest(BaseModel):
    image_base64: str


class AnalysisItem(BaseModel):
    name: str
    category: str = "other"
    estimated_percent_left: int = 0
    consumption_state: str = "fully_eaten"
    confidence: float = 0.5


class AnalyzeResponse(BaseModel):
    items: list[AnalysisItem]
    tray_completeness: str = "partial"
    overall_confidence: float = 0.0
    notes: str = ""
    raw_model_output: str | None = None


# ── Mock ──

MOCK_RESPONSE = AnalyzeResponse(
    items=[
        AnalysisItem(
            name="pasta bolognese",
            category="starch",
            estimated_percent_left=10,
            consumption_state="mostly_eaten",
            confidence=0.92,
        ),
        AnalysisItem(
            name="green salad",
            category="vegetable",
            estimated_percent_left=40,
            consumption_state="half_left",
            confidence=0.85,
        ),
        AnalysisItem(
            name="bread roll",
            category="bread",
            estimated_percent_left=60,
            consumption_state="half_left",
            confidence=0.82,
        ),
    ],
    tray_completeness="full_tray",
    overall_confidence=0.86,
    notes="Mock analysis — main dish mostly eaten, salad and bread partially left.",
)


# ── JSON parsing ──


def extract_json(raw: str) -> dict:
    """Extract JSON from model output, handling markdown fences and extra text."""
    text = raw.strip()

    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}") + 1
    if start != -1 and end > start:
        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not parse JSON from model output: {text[:300]}")


def build_response(parsed: dict, raw: str) -> AnalyzeResponse:
    items = []
    for item in parsed.get("items", []):
        try:
            items.append(AnalysisItem(**item))
        except Exception:
            continue

    return AnalyzeResponse(
        items=items,
        tray_completeness=parsed.get("tray_completeness", "partial"),
        overall_confidence=parsed.get("overall_confidence", 0.0),
        notes=parsed.get("notes", ""),
        raw_model_output=raw,
    )


# ── Gemini provider ──


def analyze_gemini(image_b64: str) -> AnalyzeResponse:
    from google import genai
    from PIL import Image

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set")

    client = genai.Client(api_key=GEMINI_API_KEY)

    image_data = base64.b64decode(image_b64)
    image = Image.open(io.BytesIO(image_data)).convert("RGB")

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[image, VLM_PROMPT],
    )

    raw = response.text.strip()
    print(f"[VLM/gemini] Raw output ({len(raw)} chars): {raw[:300]}")

    parsed = extract_json(raw)
    return build_response(parsed, raw)


# ── LM Studio provider ──


def analyze_lmstudio(image_b64: str) -> AnalyzeResponse:
    from openai import OpenAI

    client = OpenAI(base_url=f"{LMSTUDIO_BASE_URL}/v1", api_key="lm-studio")

    response = client.chat.completions.create(
        model=LMSTUDIO_MODEL,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{image_b64}"
                        },
                    },
                    {"type": "text", "text": VLM_PROMPT},
                ],
            }
        ],
        max_tokens=1024,
        temperature=0.1,
    )

    raw = (response.choices[0].message.content or "").strip()
    print(f"[VLM/lmstudio] Raw output ({len(raw)} chars): {raw[:300]}")

    parsed = extract_json(raw)
    return build_response(parsed, raw)


# ── Routes ──


@app.get("/health")
def health():
    model = (
        GEMINI_MODEL
        if VLM_PROVIDER == "gemini"
        else LMSTUDIO_MODEL
        if VLM_PROVIDER == "lmstudio"
        else "mock"
    )
    return {"status": "ok", "provider": VLM_PROVIDER, "model": model}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    print(f"[VLM] Analyzing with provider: {VLM_PROVIDER}")

    if VLM_PROVIDER == "mock":
        time.sleep(0.3)
        return MOCK_RESPONSE

    try:
        if VLM_PROVIDER == "gemini":
            return analyze_gemini(req.image_base64)
        elif VLM_PROVIDER == "lmstudio":
            return analyze_lmstudio(req.image_base64)
        else:
            raise HTTPException(
                status_code=500, detail=f"Unknown provider: {VLM_PROVIDER}"
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[VLM] Error ({type(e).__name__}): {e}")
        raise HTTPException(status_code=500, detail=str(e))
