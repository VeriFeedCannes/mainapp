import { NextRequest, NextResponse } from "next/server";
import { verifyStationSecret } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  try {
    const stationSecret = req.headers.get("x-station-secret");
    if (!verifyStationSecret(stationSecret)) {
      return NextResponse.json(
        { error: "Invalid station secret" },
        { status: 403 },
      );
    }

    const { wallet, iris_image_base64 } = await req.json();

    if (!wallet || !iris_image_base64) {
      return NextResponse.json(
        { error: "wallet and iris_image_base64 are required" },
        { status: 400 },
      );
    }

    // TODO: Send iris_image_base64 to open-iris GPU server
    // The server:
    //   1. Extracts template from the new image
    //   2. Loads the stored template for this wallet from Supabase
    //   3. Computes Hamming distance between the two IrisCodes
    //   4. Returns match if distance < 0.32 (typical threshold)
    //
    // const matchRes = await fetch(GPU_SERVER + "/match", {
    //   method: "POST",
    //   body: JSON.stringify({ wallet, iris_image_base64 }),
    // });

    return NextResponse.json({
      match: true,
      distance: 0.18,
      threshold: 0.32,
      wallet,
      message: "Iris match successful (mock — GPU server not connected yet)",
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
