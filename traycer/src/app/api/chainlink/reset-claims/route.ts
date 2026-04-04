import { NextRequest, NextResponse } from "next/server";
import { resetClaimsForWallet } from "@/lib/store";

/**
 * POST /api/chainlink/reset-claims
 *
 * DEV/TEST only — resets minted on-chain claims so CRE can re-mint.
 * Body (optional): { wallet?: string }
 *   - If wallet is provided, only that wallet's claims are reset.
 *   - If omitted, ALL claims are reset.
 *
 * Disabled in production (NODE_ENV === "production").
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "disabled in production" },
      { status: 403 },
    );
  }

  let wallet: string | undefined;
  try {
    const body = await req.json();
    wallet = body.wallet;
  } catch {
    // no body = reset all
  }

  const count = resetClaimsForWallet(wallet);

  console.log(
    "[DEV-RESET]",
    wallet ? `wallet ${wallet.slice(0, 10)}...` : "ALL",
    `${count} claims reset`,
  );

  return NextResponse.json({ success: true, resetCount: count });
}
