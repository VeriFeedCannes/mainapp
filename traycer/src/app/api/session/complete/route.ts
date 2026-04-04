import { NextRequest, NextResponse } from "next/server";
import { completeSession, verifyStationSecret } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  try {
    const stationSecret = req.headers.get("x-station-secret");
    if (!verifyStationSecret(stationSecret)) {
      return NextResponse.json(
        { error: "Invalid station secret" },
        { status: 403 },
      );
    }

    const { session_id, nfc_uid } = await req.json();

    if (!session_id) {
      return NextResponse.json(
        { error: "session_id is required" },
        { status: 400 },
      );
    }

    const result = completeSession(session_id, nfc_uid);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      action: result.session!.action,
      wallet: result.session!.wallet,
      nfc_uid: result.session!.nfc_uid,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
