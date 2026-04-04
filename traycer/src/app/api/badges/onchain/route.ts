import { NextRequest, NextResponse } from "next/server";
import { getMintedBadgesByWallet } from "@/lib/store";

/**
 * GET /api/badges/onchain?wallet=0x...
 *
 * Returns all minted on-chain ERC-1155 badges for a given wallet.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const badges = getMintedBadgesByWallet(wallet);

  return NextResponse.json({ badges });
}
