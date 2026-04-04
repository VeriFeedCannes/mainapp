import { NextRequest, NextResponse } from "next/server";
import { getPendingOnchainClaimsForWallet } from "@/lib/store";

/**
 * GET /api/chainlink/pending?wallet=0x...
 *
 * Returns on-chain badge claims waiting for CRE to mint.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const claims = getPendingOnchainClaimsForWallet(wallet);

  return NextResponse.json({
    claims: claims.map((c) => ({
      id: c.id,
      badgeId: c.badgeId,
      claimType: c.claimType,
      source: c.source,
    })),
  });
}
