import { NextRequest, NextResponse } from "next/server";
import { getDepositsByWallet } from "@/lib/store";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const deposits = getDepositsByWallet(wallet).map((d) => ({
    id: d.id,
    nfc_uid: d.nfc_uid,
    score: d.score,
    photo_stored: d.photo_stored,
    analysis: d.analysis,
    created_at: d.created_at,
  }));

  return NextResponse.json({ deposits });
}
