import { NextRequest, NextResponse } from "next/server";
import { getDeposit } from "@/lib/store";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const deposit = getDeposit(id);

  if (!deposit || !deposit.photo_base64) {
    return new NextResponse(null, { status: 404 });
  }

  const buffer = Buffer.from(deposit.photo_base64, "base64");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
