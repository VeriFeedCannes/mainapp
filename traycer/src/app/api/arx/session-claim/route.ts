import { NextRequest, NextResponse } from "next/server";
import { claimSessionByWallet, verifyStationSecret } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-station-secret");
  if (!verifyStationSecret(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { address } = (await req.json()) as { address: string };

    if (!address || !address.startsWith("0x")) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    const session = claimSessionByWallet(address);

    if (!session) {
      return NextResponse.json({ session: null });
    }

    console.log(
      `[ARX-SESSION] Claimed session ${session.session_id} (${session.action}) for ${address}`,
    );

    return NextResponse.json({
      session: {
        session_id: session.session_id,
        action: session.action,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
