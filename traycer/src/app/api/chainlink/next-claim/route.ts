import { NextResponse } from "next/server";
import { getNextMintableClaim } from "@/lib/store";

/**
 * GET /api/chainlink/next-claim
 *
 * Called by CRE workflow to get the next unminted on-chain badge claim.
 * No wallet parameter needed — the backend decides.
 */
export async function GET() {
  const claim = getNextMintableClaim();

  if (!claim) {
    return NextResponse.json({
      hasClaim: false,
      claimId: "",
      wallet: "",
      eligible: false,
      badgeId: 0,
      totalReturns: 0,
    });
  }

  console.log(
    "[CRE-NEXT-CLAIM]",
    claim.wallet.slice(0, 10) + "...",
    "badgeId:", claim.badgeId,
    "claimType:", claim.claimType,
  );

  return NextResponse.json({
    hasClaim: true,
    claimId: claim.id,
    wallet: claim.wallet,
    eligible: true,
    badgeId: claim.badgeId,
    totalReturns: claim.totalReturns,
  });
}
