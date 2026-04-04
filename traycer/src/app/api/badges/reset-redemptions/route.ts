import { NextRequest, NextResponse } from "next/server";
import { resetRedemptionsForWallet } from "@/lib/store";

/**
 * POST /api/badges/reset-redemptions
 * DEV/TEST only — clears Coffee Coupon redemption records in the JSON store.
 * Body (optional): { wallet?: string }
 *   - wallet set → only that wallet's redemptions removed
 *   - omitted → all redemptions cleared
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }

  let wallet: string | undefined;
  try {
    const body = await req.json();
    wallet = body.wallet;
  } catch {
    // no body = reset all
  }

  const count = resetRedemptionsForWallet(wallet);
  return NextResponse.json({ success: true, resetCount: count });
}
