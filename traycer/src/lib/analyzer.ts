import { GoogleGenAI } from "@google/genai";

// ── Item-level tray analysis ──

export type ItemCategory =
  | "protein"
  | "starch"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "bread"
  | "dessert"
  | "beverage"
  | "other";

export type ConsumptionState =
  | "fully_eaten"
  | "mostly_eaten"
  | "half_left"
  | "mostly_left"
  | "untouched";

export type TrayCompleteness = "full_tray" | "partial" | "empty_tray";

export interface TrayItem {
  name: string;
  category: ItemCategory;
  estimated_percent_left: number; // 0-100
  estimated_cost_usd: number;
  consumption_state: ConsumptionState;
  confidence: number; // 0.0-1.0
}

export interface TrayAnalysis {
  items: TrayItem[];
  tray_completeness: TrayCompleteness;
  overall_confidence: number; // 0.0-1.0
  estimated_total_waste_usd: number;
  notes: string;
}

// ── Provider interface ──

interface AnalyzerProvider {
  name: string;
  analyze(imageBase64: string): Promise<TrayAnalysis>;
}

// ── Mock Provider ──

const mockProvider: AnalyzerProvider = {
  name: "mock",
  async analyze(_imageBase64: string): Promise<TrayAnalysis> {
    await new Promise((r) => setTimeout(r, 300));
    return {
      items: [
        {
          name: "pasta bolognese",
          category: "starch",
          estimated_percent_left: 10,
          estimated_cost_usd: 0.35,
          consumption_state: "mostly_eaten",
          confidence: 0.92,
        },
        {
          name: "green salad",
          category: "vegetable",
          estimated_percent_left: 40,
          estimated_cost_usd: 0.60,
          consumption_state: "half_left",
          confidence: 0.85,
        },
        {
          name: "bread roll",
          category: "bread",
          estimated_percent_left: 60,
          estimated_cost_usd: 0.18,
          consumption_state: "half_left",
          confidence: 0.82,
        },
      ],
      tray_completeness: "full_tray",
      overall_confidence: 0.86,
      estimated_total_waste_usd: 1.13,
      notes: "Mock analysis — main dish mostly eaten, salad and bread partially left.",
    };
  },
};

// ── Gemini Provider ──

const GEMINI_PROMPT = `You analyze a photo of a returned cafeteria tray or plate.

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
      "estimated_cost_usd": 0.0,
      "consumption_state": "fully_eaten | mostly_eaten | half_left | mostly_left | untouched",
      "confidence": 0.0
    }
  ],
  "tray_completeness": "full_tray | partial | empty_tray",
  "overall_confidence": 0.0,
  "estimated_total_waste_usd": 0.0,
  "notes": "string"
}

Rules:
- Only include food or drink items that are meaningfully present.
- Ignore tiny traces, crumbs, sauce residue, a few grains of rice, a few isolated pasta pieces, and any negligible leftovers.
- If an item is present only as a trace, do not include it.
- estimated_percent_left must be an integer between 0 and 100.
- estimated_cost_usd is the cost of the WASTED portion only (not the full item), based on typical French cafeteria pricing (e.g. a full main dish ~3-4 USD, salad ~1.50, bread ~0.30, dessert ~1.50, beverage ~1.00). Multiply the full item price by estimated_percent_left / 100.
- estimated_total_waste_usd is the sum of all estimated_cost_usd values.
- confidence and overall_confidence must be numbers between 0.0 and 1.0.
- Use short, simple item names in English.
- If category is unclear, use "other".
- If the tray is almost empty and only trace residues remain, return an empty items array.
- Be conservative and do not invent unseen items.`;

function extractJson(raw: string): Record<string, unknown> {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  try { return JSON.parse(text); } catch { /* continue */ }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}") + 1;
  if (start !== -1 && end > start) {
    return JSON.parse(text.slice(start, end));
  }
  throw new Error(`Could not parse JSON from model output: ${text.slice(0, 200)}`);
}

function parseVlmResult(parsed: Record<string, unknown>, provider: string): TrayAnalysis {
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const mappedItems = items.map((item: Record<string, unknown>) => ({
    name: String(item.name ?? "unknown"),
    category: String(item.category ?? "other") as ItemCategory,
    estimated_percent_left: Number(item.estimated_percent_left ?? 0),
    estimated_cost_usd: Number(item.estimated_cost_usd ?? 0),
    consumption_state: String(item.consumption_state ?? "fully_eaten") as ConsumptionState,
    confidence: Number(item.confidence ?? 0.5),
  }));
  const totalWaste = Number(parsed.estimated_total_waste_usd ?? 0) ||
    mappedItems.reduce((s: number, i: { estimated_cost_usd: number }) => s + i.estimated_cost_usd, 0);
  const result: TrayAnalysis = {
    items: mappedItems,
    tray_completeness: String(parsed.tray_completeness ?? "partial") as TrayCompleteness,
    overall_confidence: Number(parsed.overall_confidence ?? 0),
    estimated_total_waste_usd: Math.round(totalWaste * 100) / 100,
    notes: String(parsed.notes ?? ""),
  };
  console.log(
    `[Analyzer/${provider}] Parsed: ${result.items.length} items, ` +
    `completeness=${result.tray_completeness}, confidence=${result.overall_confidence}`,
  );
  for (const it of result.items) {
    console.log(
      `[Analyzer/${provider}]   → ${it.name} (${it.category}) ${it.estimated_percent_left}% left, ${it.consumption_state}, conf=${it.confidence}`,
    );
  }
  return result;
}

const geminiProvider: AnalyzerProvider = {
  name: "gemini",
  async analyze(imageBase64: string): Promise<TrayAnalysis> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY not set");

    const model = process.env.GEMINI_MODEL || "gemini-3-pro-preview";
    console.log(`[Analyzer/gemini] Calling model=${model}, image size=${imageBase64.length} chars`);
    const t0 = Date.now();

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
            { text: GEMINI_PROMPT },
          ],
        },
      ],
    });

    const raw = response.text?.trim() ?? "";
    console.log(`[Analyzer/gemini] Response in ${Date.now() - t0}ms (${raw.length} chars): ${raw.slice(0, 300)}`);

    const parsed = extractJson(raw);
    return parseVlmResult(parsed, "gemini");
  },
};

// ── LM Studio Provider ──

const LMSTUDIO_BASE_URL = process.env.LMSTUDIO_BASE_URL || "http://127.0.0.1:1234";
const LMSTUDIO_MODEL = process.env.LMSTUDIO_MODEL || "gemma-4-e4b-it";

const lmstudioProvider: AnalyzerProvider = {
  name: "lmstudio",
  async analyze(imageBase64: string): Promise<TrayAnalysis> {
    console.log(`[Analyzer/lmstudio] Calling ${LMSTUDIO_BASE_URL} model=${LMSTUDIO_MODEL}, image size=${imageBase64.length} chars`);
    const t0 = Date.now();

    const res = await fetch(`${LMSTUDIO_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer lm-studio",
      },
      body: JSON.stringify({
        model: LMSTUDIO_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
              { type: "text", text: GEMINI_PROMPT },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`LM Studio error ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const raw: string = data.choices?.[0]?.message?.content?.trim() ?? "";
    console.log(`[Analyzer/lmstudio] Response in ${Date.now() - t0}ms (${raw.length} chars): ${raw.slice(0, 300)}`);

    const parsed = extractJson(raw);
    return parseVlmResult(parsed, "lmstudio");
  },
};

// ── VLM Service Provider ──

const VLM_SERVICE_URL = process.env.VLM_SERVICE_URL || "http://localhost:8100";
const VLM_TIMEOUT_MS = 30_000;

const vlmProvider: AnalyzerProvider = {
  name: "vlm",
  async analyze(imageBase64: string): Promise<TrayAnalysis> {
    console.log(`[Analyzer/vlm] Calling ${VLM_SERVICE_URL}/analyze, image size=${imageBase64.length} chars`);
    const t0 = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VLM_TIMEOUT_MS);

    try {
      const res = await fetch(`${VLM_SERVICE_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: imageBase64 }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`VLM service error ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      console.log(`[Analyzer/vlm] Response in ${Date.now() - t0}ms`);
      return parseVlmResult(data as Record<string, unknown>, "vlm");
    } finally {
      clearTimeout(timeout);
    }
  },
};

// ── Provider selection ──

function getProvider(): AnalyzerProvider {
  const mode = process.env.ANALYZER_PROVIDER || "mock";
  if (mode === "gemini") return geminiProvider;
  if (mode === "lmstudio") return lmstudioProvider;
  if (mode === "vlm") return vlmProvider;
  return mockProvider;
}

export async function analyzeImage(imageBase64: string): Promise<TrayAnalysis> {
  const mode = process.env.ANALYZER_PROVIDER || "mock";
  const provider = getProvider();
  console.log(`[Analyzer] ANALYZER_PROVIDER=${mode} → using provider: ${provider.name}`);

  try {
    const result = await provider.analyze(imageBase64);
    console.log(`[Analyzer] ${provider.name} succeeded`);
    return result;
  } catch (error) {
    if (provider.name !== "mock") {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Analyzer] ${provider.name} FAILED: ${msg}`);
      console.error(`[Analyzer] Falling back to mock`);
      return mockProvider.analyze(imageBase64);
    }
    throw error;
  }
}

// ── Scoring ──

export function computeScore(_analysis: TrayAnalysis | null): number {
  return 10;
}
