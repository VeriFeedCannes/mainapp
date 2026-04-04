import { NextRequest, NextResponse } from "next/server";
import {
  verifyCloudProof,
  IVerifyResponse,
  ISuccessResult,
} from "@worldcoin/minikit-js";
import {
  getUser,
  recordClaim,
  hasNullifierClaimed,
  getClaimsByWallet,
} from "@/lib/store";

export interface RewardTier {
  id: string;
  title: string;
  cost: number;
  verification_level: "device" | "orb";
}

export const REWARD_TIERS: RewardTier[] = [
  { id: "coffee-coupon", title: "Coffee coupon", cost: 50, verification_level: "device" },
  { id: "meal-coupon", title: "Free meal coupon", cost: 200, verification_level: "device" },
  { id: "premium-meal", title: "Premium meal", cost: 500, verification_level: "orb" },
];

interface ClaimRequest {
  wallet: string;
  reward_type: string;
  proof: ISuccessResult;
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const userClaims = getClaimsByWallet(wallet);
  return NextResponse.json({ claims: userClaims, tiers: REWARD_TIERS });
}

export async function POST(req: NextRequest) {
  try {
    const { wallet, reward_type, proof } = (await req.json()) as ClaimRequest;

    if (!wallet || !reward_type || !proof) {
      return NextResponse.json(
        { error: "wallet, reward_type, and proof are required" },
        { status: 400 },
      );
    }

    const tier = REWARD_TIERS.find((t) => t.id === reward_type);
    if (!tier) {
      return NextResponse.json({ error: "Unknown reward type" }, { status: 400 });
    }

    const user = getUser(wallet);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (user.total_score < tier.cost) {
      return NextResponse.json(
        { error: "Not enough points", required: tier.cost, available: user.total_score },
        { status: 400 },
      );
    }

    // --- Verify World ID proof ---
    const app_id = process.env.APP_ID as `app_${string}`;
    const isDev = !app_id || app_id === "app_staging_0" || process.env.NODE_ENV === "development";

    let nullifier_hash: string;
    let verification_level: "device" | "orb";

    if (isDev) {
      // Dev mode: simulate verification
      console.log("[CLAIM] Dev mode — simulating World ID verification");
      nullifier_hash = `dev_${wallet}_${Date.now()}`;
      verification_level = tier.verification_level;
    } else {
      const action = `claim-${reward_type}`;
      const verifyRes = (await verifyCloudProof(
        proof,
        app_id,
        action,
        wallet,
      )) as IVerifyResponse;

      if (!verifyRes.success) {
        console.log("[CLAIM] World ID verification failed:", verifyRes);
        return NextResponse.json(
          { error: "World ID verification failed" },
          { status: 403 },
        );
      }

      nullifier_hash = proof.nullifier_hash;
      verification_level = tier.verification_level;
    }

    // --- Check nullifier uniqueness ---
    if (hasNullifierClaimed(nullifier_hash, reward_type)) {
      return NextResponse.json(
        { error: "Already claimed by this identity" },
        { status: 409 },
      );
    }

    // --- Execute claim ---
    const claim = recordClaim(
      wallet,
      reward_type,
      nullifier_hash,
      verification_level,
      tier.cost,
    );

    console.log(
      "[CLAIM] Success:",
      claim.id,
      "reward:", reward_type,
      "wallet:", wallet,
      "nullifier:", nullifier_hash.slice(0, 12) + "...",
      "points_spent:", tier.cost,
    );

    return NextResponse.json({
      success: true,
      claim_id: claim.id,
      reward_type,
      points_spent: tier.cost,
      remaining_score: user.total_score,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[CLAIM] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
