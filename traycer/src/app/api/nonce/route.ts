import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const cookieStore = await cookies();
  cookieStore.set("siwe", nonce, {
    secure: true,
    httpOnly: true,
    sameSite: "strict",
    maxAge: 600,
  });

  return NextResponse.json({ nonce });
}
