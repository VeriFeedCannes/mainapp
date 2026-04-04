import { NextRequest, NextResponse } from "next/server";
import { getPendingSignById } from "@/lib/sessions";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const request = getPendingSignById(id);
  if (!request) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    status: request.status,
    txHash: request.txHash,
    error: request.error,
  });
}
