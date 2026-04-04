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
    // The server runs the pipeline:
    //   1. Segmentation (AI model)
    //   2. Normalization (Cartesian → Polar)
    //   3. Feature extraction (Gabor filters → IrisCode)
    //   4. Returns: { iris_template: base64, iris_mask: base64 }
    //
    // Then store in Supabase:
    //   UPDATE users SET iris_template = ..., iris_mask = ..., iris_enrolled_at = now()
    //   WHERE wallet_address = wallet

    return NextResponse.json({
      success: true,
      wallet,
      message: "Iris template enrolled (mock — GPU server not connected yet)",
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
