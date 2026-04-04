import { NextRequest, NextResponse } from "next/server";
import { resetUserForDemo } from "@/lib/store";
import { clearAllForWallet } from "@/lib/sessions";

/**
 * POST /api/dev/reset-demo
 * Full demo reset for a wallet: user stats, badges, deposits, claims,
 * redemptions, sessions, plate associations.
 * Body: { wallet: string }
 * Disabled in production.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }

  try {
    const { wallet } = (await req.json()) as { wallet?: string };
    if (!wallet) {
      return NextResponse.json({ error: "wallet is required" }, { status: 400 });
    }

    resetUserForDemo(wallet);
    clearAllForWallet(wallet);

    console.log(`[DEV-RESET] Full demo reset for ${wallet.slice(0, 10)}…`);
    return NextResponse.json({ success: true, message: "Full demo reset done" });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
