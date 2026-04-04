import { NextRequest, NextResponse } from "next/server";
import { getSessionByWallet, getPlateByWallet } from "@/lib/sessions";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json(
      { error: "wallet query param required" },
      { status: 400 },
    );
  }

  const activeSession = getSessionByWallet(wallet);
  const plate = getPlateByWallet(wallet);

  return NextResponse.json({
    session: activeSession
      ? {
          session_id: activeSession.session_id,
          action: activeSession.action,
          status: activeSession.status,
        }
      : null,
    plate: plate
      ? {
          nfc_uid: plate.nfc_uid,
          associated_at: plate.associated_at,
        }
      : null,
  });
}
