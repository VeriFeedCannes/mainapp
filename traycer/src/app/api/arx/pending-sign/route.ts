import { NextRequest, NextResponse } from "next/server";
import { verifyStationSecret, getPendingSignByAddress } from "@/lib/sessions";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-station-secret");
  if (!verifyStationSecret(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const address = req.nextUrl.searchParams.get("address");
  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const pending = getPendingSignByAddress(address);
  if (!pending) {
    return NextResponse.json({ pending: false });
  }

  return NextResponse.json({
    pending: true,
    requestId: pending.id,
    digestHex: pending.digestHex,
    badgeId: pending.badgeId,
  });
}
