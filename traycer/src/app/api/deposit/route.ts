import { NextRequest, NextResponse } from "next/server";
import {
  getPlateAssociation,
  removePlateAssociation,
  verifyStationSecret,
} from "@/lib/sessions";
import { analyzeImage, computeScore } from "@/lib/analyzer";
import { recordDeposit, getOrCreateUser, getNextMintableClaim } from "@/lib/store";
import { triggerCreSimulation } from "@/lib/cre-trigger";

export async function POST(req: NextRequest) {
  try {
    const stationSecret = req.headers.get("x-station-secret");
    if (!verifyStationSecret(stationSecret)) {
      return NextResponse.json(
        { error: "Invalid station secret" },
        { status: 403 },
      );
    }

    const { nfc_uid, photo_base64 } = await req.json();

    if (!nfc_uid) {
      return NextResponse.json(
        { error: "nfc_uid is required" },
        { status: 400 },
      );
    }

    console.log("[SERVER /api/deposit] NFC uid:", nfc_uid);

    const association = getPlateAssociation(nfc_uid);
    if (!association) {
      console.log("[SERVER /api/deposit] No active association for tag", nfc_uid);
      return NextResponse.json({
        action: "ignored",
        message: "No active association for this tag",
      });
    }

    console.log("[SERVER /api/deposit] Found association → wallet:", association.wallet);

    let analysis = null;
    if (photo_base64) {
      console.log("[SERVER /api/deposit] Running item-level analysis…");
      analysis = await analyzeImage(photo_base64);
      console.log(
        "[SERVER /api/deposit] Analysis done,",
        analysis.items.length,
        "items detected, confidence:",
        analysis.overall_confidence,
      );
    }

    const score = computeScore(analysis);

    removePlateAssociation(nfc_uid);
    console.log("[SERVER /api/deposit] Association removed, plate is free");

    getOrCreateUser(association.wallet);
    const deposit = recordDeposit(
      association.wallet,
      nfc_uid,
      analysis,
      score,
      !!photo_base64,
      photo_base64 || undefined,
    );

    console.log("[SERVER /api/deposit] Deposit recorded:", deposit.id, "score:", score);

    // If a new on-chain claim exists, trigger CRE simulate in the background
    const pendingClaim = getNextMintableClaim();
    if (pendingClaim) {
      console.log("[SERVER /api/deposit] Pending claim found, triggering CRE…");
      triggerCreSimulation();
    }

    return NextResponse.json({
      action: "return",
      wallet: association.wallet,
      nfc_uid,
      deposit_id: deposit.id,
      score,
      analysis,
      message: `Plate returned. +${score} points`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[SERVER /api/deposit] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
