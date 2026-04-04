import { NextRequest, NextResponse } from "next/server";
import { getUser, getLastDeposit, getCommunityStats, getLeaderboard } from "@/lib/store";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  const user = getUser(wallet);
  const lastDeposit = getLastDeposit(wallet);
  const community = getCommunityStats();
  const leaderboard = getLeaderboard(10);

  const rank = leaderboard.findIndex((l) => l.wallet === wallet) + 1;

  return NextResponse.json({
    user,
    last_deposit: lastDeposit,
    community,
    leaderboard,
    rank: rank > 0 ? rank : null,
  });
}
