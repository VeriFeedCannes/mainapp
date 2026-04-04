import { NextRequest, NextResponse } from "next/server";
import { analyzeImage } from "@/lib/analyzer";

export async function POST(req: NextRequest) {
  try {
    const { photo_base64 } = await req.json();

    if (!photo_base64) {
      return NextResponse.json(
        { error: "photo_base64 is required" },
        { status: 400 },
      );
    }

    console.log("[SERVER /api/analyze] Analyzing image…");
    const analysis = await analyzeImage(photo_base64);
    console.log("[SERVER /api/analyze] Result:", JSON.stringify(analysis).slice(0, 200));

    return NextResponse.json(analysis);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    console.error("[SERVER /api/analyze] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
