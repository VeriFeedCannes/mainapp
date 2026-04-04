import { NextRequest, NextResponse } from "next/server";
import { signRequest } from "@worldcoin/idkit-core/signing";

/**
 * POST /api/idkit/rp-signature
 *
 * Generates an RP signature for World ID 4.0 proof requests.
 * The frontend calls this before opening the IDKit widget so that
 * World App can verify the request genuinely comes from our app.
 *
 * Import strategy:
 *   - @worldcoin/idkit-core/signing  — server-only RP signing util
 *   - @worldcoin/idkit               — React IDKitRequestWidget (frontend)
 *   - @worldcoin/minikit-js          — MiniKit 2.0 commands (frontend)
 */
export async function POST(req: NextRequest) {
  const signingKey = process.env.RP_SIGNING_KEY;
  if (!signingKey) {
    return NextResponse.json(
      { error: "RP_SIGNING_KEY not configured" },
      { status: 500 },
    );
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body;
  if (!action) {
    return NextResponse.json({ error: "action is required" }, { status: 400 });
  }

  try {
    const result = signRequest(action, signingKey);

    return NextResponse.json({
      sig: result.sig,
      nonce: result.nonce,
      created_at: result.createdAt,
      expires_at: result.expiresAt,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Signing failed";
    console.error("[RP-SIGNATURE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
