"""
Traycer VLM Analysis Service
Qwen2.5-VL-3B self-hosted on AWS GPU

Run locally (mock mode):
    uvicorn main:app --host 0.0.0.0 --port 8100

Run with real model:
    MOCK_MODE=0 uvicorn main:app --host 0.0.0.0 --port 8100
"""

import base64
import io
import json
import os
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Traycer VLM Service", version="0.1.0")

MOCK_MODE = os.environ.get("MOCK_MODE", "1") == "1"
MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"

VLM_PROMPT = """You analyze a tray return image from a cafeteria.
Return JSON only.
Do not add markdown.
Estimate what food items are visible and how much is left.
Determine whether sorting looks correct.
Determine whether the tray looks clean enough to count as a clean return.

Required JSON schema:
{
  "items": [
    {
      "name": "string",
      "estimated_percent_left": 0,
      "category": "food | packaging | drink | unknown"
    }
  ],
  "waste_percent": 0,
  "sorting_correct": true,
  "clean_return": false,
  "confidence": 0.0,
  "notes": "string"
}

Rules:
- estimated_percent_left is an integer from 0 to 100
- waste_percent is an integer from 0 to 100
- confidence is a float from 0.0 to 1.0
- if unsure, use "unknown"
- output valid JSON only"""

# Lazy-loaded model references
_model = None
_processor = None


def load_model():
    """Load Qwen2.5-VL-3B model (called once at first request or startup)."""
    global _model, _processor
    if _model is not None:
        return

    print(f"[VLM] Loading model {MODEL_ID}…")
    from transformers import Qwen2_5_VLForConditionalGeneration, AutoProcessor
    import torch

    _processor = AutoProcessor.from_pretrained(MODEL_ID)
    _model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float16,
        device_map="auto",
    )
    print("[VLM] Model loaded.")


class AnalyzeRequest(BaseModel):
    image_base64: str


class AnalysisItem(BaseModel):
    name: str
    estimated_percent_left: int
    category: str


class AnalyzeResponse(BaseModel):
    items: list[AnalysisItem]
    waste_percent: int
    sorting_correct: bool
    clean_return: bool
    confidence: float
    notes: str
    raw_model_output: str | None = None


MOCK_RESPONSE = AnalyzeResponse(
    items=[
        AnalysisItem(name="rice", estimated_percent_left=15, category="food"),
        AnalysisItem(name="salad", estimated_percent_left=30, category="food"),
        AnalysisItem(name="bread", estimated_percent_left=70, category="food"),
        AnalysisItem(name="yogurt cup", estimated_percent_left=0, category="packaging"),
    ],
    waste_percent=28,
    sorting_correct=True,
    clean_return=False,
    confidence=0.85,
    notes="Mock analysis — mostly finished meal, bread left over",
    raw_model_output=None,
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "mock_mode": MOCK_MODE,
    }


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    if MOCK_MODE:
        time.sleep(0.3)
        return MOCK_RESPONSE

    load_model()

    from PIL import Image

    try:
        image_data = base64.b64decode(req.image_base64)
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": VLM_PROMPT},
            ],
        }
    ]

    text_input = _processor.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = _processor(
        text=[text_input],
        images=[image],
        return_tensors="pt",
    ).to(_model.device)

    output_ids = _model.generate(**inputs, max_new_tokens=512)
    generated = output_ids[0][inputs.input_ids.shape[1]:]
    raw_output = _processor.decode(generated, skip_special_tokens=True).strip()

    try:
        parsed = json.loads(raw_output)
    except json.JSONDecodeError:
        start = raw_output.find("{")
        end = raw_output.rfind("}") + 1
        if start != -1 and end > start:
            parsed = json.loads(raw_output[start:end])
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Model output is not valid JSON: {raw_output[:200]}",
            )

    return AnalyzeResponse(
        items=[
            AnalysisItem(**item)
            for item in parsed.get("items", [])
        ],
        waste_percent=parsed.get("waste_percent", 0),
        sorting_correct=parsed.get("sorting_correct", False),
        clean_return=parsed.get("clean_return", False),
        confidence=parsed.get("confidence", 0.0),
        notes=parsed.get("notes", ""),
        raw_model_output=raw_output,
    )
