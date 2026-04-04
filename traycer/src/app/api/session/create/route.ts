import { NextRequest, NextResponse } from "next/server";
import { createSession, buildQrPayload, SessionAction } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  try {
    const { wallet, action, station_id } = await req.json();

    if (!wallet) {
      return NextResponse.json(
        { error: "wallet is required" },
        { status: 400 },
      );
    }

    const validActions: SessionAction[] = ["pickup", "enroll", "claim"];
    const sessionAction: SessionAction = validActions.includes(action)
      ? action
      : "pickup";

    const session = createSession(wallet, sessionAction, station_id);
    const qr_payload = buildQrPayload(session);

    return NextResponse.json({
      session_id: session.session_id,
      qr_payload,
      expires_at: session.expires_at,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
