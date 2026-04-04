import { NextRequest, NextResponse } from "next/server";
import { getRedemptionsByWallet } from "@/lib/store";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet query param required" }, { status: 400 });
  }

  const redemptions = getRedemptionsByWallet(wallet);
  return NextResponse.json({ redemptions });
}
