import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/store";

/**
 * GET /api/chainlink/verify?wallet=0x...
 *
 * Endpoint consumed by the Chainlink CRE workflow.
 * Returns eligibility data for on-chain ERC-1155 badge mint.
 *
 * Badge IDs:
 *   1 = first_return
 *   2 = regular       (≥3 returns)
 *   3 = committed     (≥7 returns)
 *   4 = premium_claim (World ID verified — future)
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const user = getUser(wallet);

  if (!user) {
    return NextResponse.json({
      wallet,
      eligible: false,
      badgeId: 0,
      claimType: "none",
      totalReturns: 0,
      totalScore: 0,
    });
  }

  let badgeId = 0;
  let claimType = "none";

  if (user.total_returns >= 7) {
    badgeId = 3;
    claimType = "committed_badge";
  } else if (user.total_returns >= 3) {
    badgeId = 2;
    claimType = "regular_badge";
  } else if (user.total_returns >= 1) {
    badgeId = 1;
    claimType = "first_return_badge";
  }

  const eligible = badgeId > 0;

  console.log(
    "[CRE-VERIFY]",
    wallet.slice(0, 10) + "...",
    "returns:", user.total_returns,
    "eligible:", eligible,
    "badgeId:", badgeId,
    "claimType:", claimType,
  );

  return NextResponse.json({
    wallet,
    eligible,
    badgeId,
    claimType,
    totalReturns: user.total_returns,
    totalScore: user.total_score,
  });
}
