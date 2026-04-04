import { NextResponse } from "next/server";
import { consumePendingArxAuth } from "@/lib/sessions";

export async function GET() {
  const pending = consumePendingArxAuth();

  if (!pending) {
    return NextResponse.json({ ready: false });
  }

  return NextResponse.json({
    ready: true,
    address: pending.address,
  });
}
