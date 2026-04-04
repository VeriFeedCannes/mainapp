import { NextRequest, NextResponse } from "next/server";
import { getPlateAssociation, verifyStationSecret } from "@/lib/sessions";

export async function GET(req: NextRequest) {
  const stationSecret = req.headers.get("x-station-secret");
  if (!verifyStationSecret(stationSecret)) {
    return NextResponse.json(
      { error: "Invalid station secret" },
      { status: 403 },
    );
  }

  const nfc_uid = req.nextUrl.searchParams.get("nfc_uid");
  if (!nfc_uid) {
    return NextResponse.json(
      { error: "nfc_uid required" },
      { status: 400 },
    );
  }

  const association = getPlateAssociation(nfc_uid);
  if (association) {
    return NextResponse.json({
      associated: true,
      wallet: association.wallet,
    });
  }

  return NextResponse.json({ associated: false });
}
