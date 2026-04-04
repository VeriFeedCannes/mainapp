export interface AnalysisItem {
  name: string;
  estimated_percent_left: number;
  category: "food" | "packaging" | "drink" | "unknown";
}

export interface AnalysisResult {
  items: AnalysisItem[];
  waste_percent: number;
  sorting_correct: boolean;
  clean_return: boolean;
  confidence: number;
  notes: string;
  raw_model_output?: string;
}

export const VLM_PROMPT = `You analyze a tray return image from a cafeteria.
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
- output valid JSON only`;

interface AnalyzerProvider {
  name: string;
  analyze(imageBase64: string): Promise<AnalysisResult>;
}

// --- Mock Provider (used until Qwen VLM is wired) ---

const mockProvider: AnalyzerProvider = {
  name: "mock",
  async analyze(_imageBase64: string): Promise<AnalysisResult> {
    await new Promise((r) => setTimeout(r, 300));
    return {
      items: [
        { name: "rice", estimated_percent_left: 15, category: "food" },
        { name: "salad", estimated_percent_left: 30, category: "food" },
        { name: "bread", estimated_percent_left: 70, category: "food" },
        { name: "yogurt cup", estimated_percent_left: 0, category: "packaging" },
      ],
      waste_percent: 28,
      sorting_correct: true,
      clean_return: false,
      confidence: 0.85,
      notes: "Mock analysis — mostly finished meal, bread left over",
    };
  },
};

// --- Qwen VLM Provider (calls self-hosted FastAPI service) ---

const VLM_SERVICE_URL = process.env.VLM_SERVICE_URL || "http://localhost:8100";

const qwenProvider: AnalyzerProvider = {
  name: "qwen-vlm",
  async analyze(imageBase64: string): Promise<AnalysisResult> {
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
      items: data.items ?? [],
      waste_percent: data.waste_percent ?? 0,
      sorting_correct: data.sorting_correct ?? false,
      clean_return: data.clean_return ?? false,
      confidence: data.confidence ?? 0,
      notes: data.notes ?? "",
      raw_model_output: data.raw_model_output,
    };
  },
};

// --- Provider selection ---

function getProvider(): AnalyzerProvider {
  const mode = process.env.ANALYZER_PROVIDER || "mock";
  if (mode === "qwen") return qwenProvider;
  return mockProvider;
}

export async function analyzeImage(imageBase64: string): Promise<AnalysisResult> {
  const provider = getProvider();
  console.log(`[Analyzer] Using provider: ${provider.name}`);
  return provider.analyze(imageBase64);
}

export function computeScore(analysis: AnalysisResult): number {
  let score = 10; // base: tray returned
  if (analysis.waste_percent < 25) score += 5;
  if (analysis.waste_percent < 10) score += 3;
  if (analysis.sorting_correct) score += 3;
  if (analysis.clean_return) score += 4;
  return score;
}
