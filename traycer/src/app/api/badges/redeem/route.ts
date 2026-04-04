import { NextRequest, NextResponse } from "next/server";
import { hasRedeemedBadge, recordRedemption } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { wallet, badgeId, txHash } = body as {
      wallet?: string;
      badgeId?: number;
      txHash?: string;
    };

    if (!wallet || !txHash || typeof badgeId !== "number") {
      return NextResponse.json(
        { error: "wallet, badgeId (number) and txHash are required" },
        { status: 400 },
      );
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: "Invalid txHash format" }, { status: 400 });
    }

    if (hasRedeemedBadge(wallet, badgeId)) {
      return NextResponse.json(
        { error: "Coupon already redeemed", alreadyRedeemed: true },
        { status: 409 },
      );
    }

    const redemption = recordRedemption(wallet, badgeId, "coffee_coupon", txHash);

    return NextResponse.json({ success: true, redemption });
  } catch (e) {
    console.error("[REDEEM]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
