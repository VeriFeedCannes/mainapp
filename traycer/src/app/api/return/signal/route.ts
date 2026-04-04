import { NextRequest, NextResponse } from "next/server";
import {
  createReturnSignal,
  getReturnSignalByWallet,
  getReturnSignalByUid,
  setReturnSignalCapture,
  clearReturnSignal,
  getPlateAssociation,
  verifyStationSecret,
} from "@/lib/sessions";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const nfc_uid = req.nextUrl.searchParams.get("nfc_uid");

  if (wallet) {
    const signal = getReturnSignalByWallet(wallet);
    return NextResponse.json({ signal: signal ? { status: signal.status, nfc_uid: signal.nfc_uid } : null });
  }

  if (nfc_uid) {
    const signal = getReturnSignalByUid(nfc_uid);
    return NextResponse.json({ signal: signal ? { status: signal.status } : null });
  }

  return NextResponse.json({ error: "wallet or nfc_uid required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, nfc_uid, wallet } = body;

  if (action === "ready") {
    const stationSecret = req.headers.get("x-station-secret");
    if (!verifyStationSecret(stationSecret)) {
      return NextResponse.json({ error: "Invalid station secret" }, { status: 403 });
    }
    if (!nfc_uid) {
      return NextResponse.json({ error: "nfc_uid required" }, { status: 400 });
    }
    const assoc = getPlateAssociation(nfc_uid);
    if (!assoc) {
      return NextResponse.json({ error: "Tag not associated" }, { status: 404 });
    }
    const signal = createReturnSignal(nfc_uid, assoc.wallet);
    console.log("[SIGNAL] Return ready:", nfc_uid, "wallet:", assoc.wallet);
    return NextResponse.json({ ok: true, signal: { status: signal.status, wallet: assoc.wallet } });
  }

  if (action === "capture") {
    if (!wallet) {
      return NextResponse.json({ error: "wallet required" }, { status: 400 });
    }
    const ok = setReturnSignalCapture(wallet);
    if (!ok) {
      return NextResponse.json({ error: "No waiting signal for this wallet" }, { status: 404 });
    }
    console.log("[SIGNAL] Capture triggered for wallet:", wallet);
    return NextResponse.json({ ok: true });
  }

  if (action === "done") {
    const stationSecret = req.headers.get("x-station-secret");
    if (!verifyStationSecret(stationSecret)) {
      return NextResponse.json({ error: "Invalid station secret" }, { status: 403 });
    }
    if (!nfc_uid) {
      return NextResponse.json({ error: "nfc_uid required" }, { status: 400 });
    }
    clearReturnSignal(nfc_uid);
    console.log("[SIGNAL] Return done, signal cleared:", nfc_uid);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
