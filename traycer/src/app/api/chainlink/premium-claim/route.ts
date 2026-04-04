import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  hasPremiumClaimForWallet,
  createPremiumClaim,
  hasNullifierClaimed,
} from "@/lib/store";
import {
  verifyWorldIdV4,
  type IdKitResponse,
} from "@/lib/world-id";

/**
 * POST /api/chainlink/premium-claim
 *
 * Verifies World ID v4 proof for badge #4 (premium / Orb verified).
 * After verification, the frontend calls mintBadge(4) on-chain directly
 * via sendTransaction — no CRE pipeline needed for this badge.
 */
export async function POST(req: NextRequest) {
  let body: { wallet?: string; proof?: IdKitResponse };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400 },
    );
  }

  const { wallet, proof } = body;

  if (!wallet) {
    return NextResponse.json(
      { error: "wallet is required" },
      { status: 400 },
    );
  }

  const user = getUser(wallet);
  if (!user) {
    return NextResponse.json(
      { error: "User not found — return at least one tray first" },
      { status: 404 },
    );
  }

  if (hasPremiumClaimForWallet(wallet)) {
    return NextResponse.json(
      { error: "Premium badge already claimed for this wallet" },
      { status: 409 },
    );
  }

  if (!proof) {
    return NextResponse.json(
      { error: "World ID proof is required" },
      { status: 400 },
    );
  }

  let nullifierHash: string;

  {
    const rpId = process.env.RP_ID;
    if (!rpId) {
      return NextResponse.json(
        { error: "RP_ID not configured on server" },
        { status: 500 },
      );
    }

    const verifyRes = await verifyWorldIdV4(proof, rpId);

    if (!verifyRes.success) {
      console.log("[PREMIUM-CLAIM] World ID v4 verification failed:", verifyRes);
      return NextResponse.json(
        { error: "World ID verification failed", detail: verifyRes },
        { status: 403 },
      );
    }

    console.log("[PREMIUM-CLAIM] World ID v4 verified ✓");
    nullifierHash = verifyRes.nullifier ?? "unknown";

    if (hasNullifierClaimed(nullifierHash, "premium_badge")) {
      return NextResponse.json(
        { error: "This World ID has already claimed the premium badge" },
        { status: 409 },
      );
    }
  }

  const claim = createPremiumClaim(wallet, nullifierHash);

  console.log(
    "[PREMIUM-CLAIM]",
    proof ? "(VERIFIED-v4)" : "(DEV)",
    "wallet:", wallet.slice(0, 10) + "...",
    "claimId:", claim.id,
  );

  return NextResponse.json({
    success: true,
    claimId: claim.id,
    badgeId: 4,
  });
}
