# Traycer VLM Service

FastAPI service for tray image analysis. Supports **Gemini** (demo default), **LM Studio** (local), and **mock** mode.

## Quick start

```bash
cd vlm-service
pip install -r requirements.txt

# Mock mode (no API key needed)
VLM_PROVIDER=mock uvicorn main:app --port 8100

# Gemini mode (demo)
VLM_PROVIDER=gemini GEMINI_API_KEY=your_key uvicorn main:app --port 8100
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VLM_PROVIDER` | `mock` | `gemini`, `lmstudio`, or `mock` |
| `GEMINI_API_KEY` | — | Google AI API key (required for gemini) |
| `GEMINI_MODEL` | `gemini-2.5-flash-preview-04-17` | Gemini model name |
| `LMSTUDIO_BASE_URL` | `http://127.0.0.1:1234` | LM Studio server URL |
| `LMSTUDIO_MODEL` | `gemma-4-e4b-it` | Model loaded in LM Studio |

## Traycer integration

The Next.js backend calls this service via `POST /analyze`.

In Traycer's `.env.local`:
```
ANALYZER_PROVIDER=vlm
VLM_SERVICE_URL=http://localhost:8100
```

Set `ANALYZER_PROVIDER=mock` to skip the VLM service entirely.

## Test manually

```bash
# Health check
curl http://localhost:8100/health

# Analyze (mock)
curl -X POST http://localhost:8100/analyze \
  -H "Content-Type: application/json" \
  -d '{"image_base64": "..."}'
```

## LM Studio setup (optional)

1. Download [LM Studio](https://lmstudio.ai)
2. Load a vision model (e.g. `gemma-4-e4b-it`)
3. Start the local server (default port 1234)
4. Run with `VLM_PROVIDER=lmstudio`

## Response schema

```json
{
  "items": [
    {
      "name": "pasta bolognese",
      "category": "starch",
      "estimated_percent_left": 10,
      "consumption_state": "mostly_eaten",
      "confidence": 0.92
    }
  ],
  "tray_completeness": "full_tray",
  "overall_confidence": 0.86,
  "notes": "Main dish mostly eaten."
}
```
