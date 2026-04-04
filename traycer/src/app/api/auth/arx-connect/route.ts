import { NextRequest, NextResponse } from "next/server";
import { setPendingArxAuth, verifyStationSecret } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-station-secret");
  if (!verifyStationSecret(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { address } = (await req.json()) as { address: string };

    if (!address || !address.startsWith("0x") || address.length < 42) {
      return NextResponse.json(
        { error: "Invalid address" },
        { status: 400 },
      );
    }

    setPendingArxAuth(address);
    console.log(`[ARX-CONNECT] Wristband address registered: ${address}`);

    return NextResponse.json({ ok: true, address });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
