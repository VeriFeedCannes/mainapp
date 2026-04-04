import { NextRequest, NextResponse } from "next/server";
import { markClaimMinted } from "@/lib/store";

/**
 * POST /api/chainlink/confirm-mint
 *
 * Called by CRE workflow after a successful on-chain mint.
 * Body: { claimId: string, txHash: string }
 *
 * Protection:
 *  - If CRE_WEBHOOK_SECRET is set, requires header `x-cre-secret` to match.
 *  - txHash format validated (0x + 64 hex chars).
 *  - Idempotent: same claimId + txHash → same success response.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRE_WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers.get("x-cre-secret");
    if (provided !== secret) {
      return NextResponse.json(
        { success: false, error: "unauthorized" },
        { status: 401 },
      );
    }
  }

  let body: { claimId?: string; txHash?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "invalid JSON body" },
      { status: 400 },
    );
  }

  const { claimId, txHash } = body;

  if (!claimId || !txHash) {
    return NextResponse.json(
      { success: false, error: "claimId and txHash required" },
      { status: 400 },
    );
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json(
      { success: false, error: "invalid txHash format" },
      { status: 400 },
    );
  }

  const claim = markClaimMinted(claimId, txHash);

  if (!claim) {
    return NextResponse.json(
      { success: false, error: "claim not found" },
      { status: 404 },
    );
  }

  console.log("[CRE-CONFIRM]", claimId, "txHash:", txHash.slice(0, 14) + "...");

  return NextResponse.json({
    success: true,
    claimId: claim.id,
    txHash: claim.txHash,
  });
}
