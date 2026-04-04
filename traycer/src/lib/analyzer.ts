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

export type ItemCourse = "main" | "side" | "dessert" | "drink";

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
  course: ItemCourse;
  estimated_percent_left: number; // 0-100
  consumption_state: ConsumptionState;
  confidence: number; // 0.0-1.0
}

export interface TrayAnalysis {
  items: TrayItem[];
  tray_completeness: TrayCompleteness;
  overall_confidence: number; // 0.0-1.0
  notes: string;
}

// ── VLM prompt (used by real providers) ──

export const VLM_PROMPT = `You analyze a photo of a returned cafeteria tray.
Identify each visible food item and assess how much was consumed.
Return ONLY valid JSON, no markdown, no explanation.

JSON schema:
{
  "items": [
    {
      "name": "string (descriptive, e.g. 'orange slices')",
      "category": "protein | starch | vegetable | fruit | dairy | bread | dessert | beverage | other",
      "course": "main | side | dessert | drink",
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
- List ALL visible food items separately
- estimated_percent_left: integer 0-100 (0 = fully eaten)
- consumption_state must match estimated_percent_left logically
- confidence: float 0.0-1.0 per item and overall
- category and course: pick the closest match
- tray_completeness: "full_tray" if multiple items visible, "partial" if few, "empty_tray" if tray is basically clean
- If an item is ambiguous, use "other" for category and lower confidence
- Output valid JSON only`;

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
          course: "main",
          estimated_percent_left: 10,
          consumption_state: "mostly_eaten",
          confidence: 0.92,
        },
        {
          name: "green salad",
          category: "vegetable",
          course: "side",
          estimated_percent_left: 40,
          consumption_state: "half_left",
          confidence: 0.85,
        },
        {
          name: "orange slices",
          category: "fruit",
          course: "side",
          estimated_percent_left: 85,
          consumption_state: "mostly_left",
          confidence: 0.88,
        },
        {
          name: "yogurt cup",
          category: "dairy",
          course: "dessert",
          estimated_percent_left: 0,
          consumption_state: "fully_eaten",
          confidence: 0.95,
        },
        {
          name: "bread roll",
          category: "bread",
          course: "side",
          estimated_percent_left: 60,
          consumption_state: "half_left",
          confidence: 0.82,
        },
      ],
      tray_completeness: "full_tray",
      overall_confidence: 0.88,
      notes: "Main dish well consumed. Orange slices mostly untouched — common pattern for citrus sides.",
    };
  },
};

// ── Qwen VLM Provider ──

const VLM_SERVICE_URL = process.env.VLM_SERVICE_URL || "http://localhost:8100";

const qwenProvider: AnalyzerProvider = {
  name: "qwen-vlm",
  async analyze(imageBase64: string): Promise<TrayAnalysis> {
    const res = await fetch(`${VLM_SERVICE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: imageBase64 }),
    });

    if (!res.ok) {
      throw new Error(`VLM service error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    return {
      items: (data.items ?? []).map((item: Record<string, unknown>) => ({
        name: item.name ?? "unknown",
        category: item.category ?? "other",
        course: item.course ?? "side",
        estimated_percent_left: item.estimated_percent_left ?? 0,
        consumption_state: item.consumption_state ?? "fully_eaten",
        confidence: item.confidence ?? 0.5,
      })),
      tray_completeness: data.tray_completeness ?? "partial",
      overall_confidence: data.overall_confidence ?? 0,
      notes: data.notes ?? "",
    };
  },
};

// ── Provider selection ──

function getProvider(): AnalyzerProvider {
  const mode = process.env.ANALYZER_PROVIDER || "mock";
  if (mode === "qwen") return qwenProvider;
  return mockProvider;
}

export async function analyzeImage(imageBase64: string): Promise<TrayAnalysis> {
  const provider = getProvider();
  console.log(`[Analyzer] Using provider: ${provider.name}`);
  return provider.analyze(imageBase64);
}

// ── Scoring ──
// Participation-based: you return your tray = you earn. No moral judgment.

export function computeScore(_analysis: TrayAnalysis | null): number {
  return 10;
}
