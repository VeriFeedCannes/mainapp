import { NextRequest, NextResponse } from "next/server";
import { validateSession, verifyStationSecret } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  try {
    const stationSecret = req.headers.get("x-station-secret");
    if (!verifyStationSecret(stationSecret)) {
      return NextResponse.json(
        { error: "Invalid station secret" },
        { status: 403 },
      );
    }

    const { session_id, station_id } = await req.json();

    if (!session_id || !station_id) {
      return NextResponse.json(
        { error: "session_id and station_id are required" },
        { status: 400 },
      );
    }

    const result = validateSession(session_id, station_id);

    if (!result.valid) {
      console.log(`[SESSION] validate REJECTED: ${result.error}`);
      return NextResponse.json(
        { valid: false, error: result.error },
        { status: 400 },
      );
    }

    console.log(`[SESSION] validate OK → status is now "scanned" | wallet=${result.session!.wallet} action=${result.session!.action}`);

    return NextResponse.json({
      valid: true,
      wallet: result.session!.wallet,
      action: result.session!.action,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
