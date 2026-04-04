import { NextRequest, NextResponse } from "next/server";
import { verifyWorldId, type WorldIdProof } from "@/lib/world-id";

interface RequestPayload {
  payload: WorldIdProof;
  action: string;
  signal?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { payload, action, signal } = (await req.json()) as RequestPayload;
    const app_id = process.env.APP_ID;

    if (!app_id) {
      return NextResponse.json(
        { error: "APP_ID not configured" },
        { status: 500 },
      );
    }

    const verifyRes = await verifyWorldId(payload, app_id, action, signal);

    if (verifyRes.success) {
      return NextResponse.json({ verifyRes, status: 200 });
    } else {
      return NextResponse.json({ verifyRes, status: 400 });
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
