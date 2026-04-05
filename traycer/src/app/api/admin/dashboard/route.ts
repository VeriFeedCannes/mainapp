import { NextResponse } from "next/server";
import {
  getAllUsers,
  getAllDeposits,
  getAllRedemptions,
  getCommunityStats,
} from "@/lib/store";

export async function GET() {
  const users = getAllUsers().map((u) => ({
    wallet: u.wallet,
    username: u.username,
    total_score: u.total_score,
    total_returns: u.total_returns,
    badges: u.badges,
    world_id_verified: !!u.world_id_verified_at,
    created_at: u.created_at,
  }));

  const deposits = getAllDeposits().map((d) => ({
    id: d.id,
    wallet: d.wallet,
    nfc_uid: d.nfc_uid,
    score: d.score,
    photo_stored: d.photo_stored,
    analysis: d.analysis,
    created_at: d.created_at,
  }));

  const redemptions = getAllRedemptions().map((r) => ({
    id: r.id,
    wallet: r.wallet,
    badgeId: r.badgeId,
    couponCode: r.couponCode,
    txHash: r.txHash,
    createdAt: r.createdAt,
  }));

  const community = getCommunityStats();

  return NextResponse.json({ users, deposits, redemptions, community });
}
