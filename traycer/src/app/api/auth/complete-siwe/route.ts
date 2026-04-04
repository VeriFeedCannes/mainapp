import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  MiniAppWalletAuthSuccessPayload,
  verifySiweMessage,
} from "@worldcoin/minikit-js";

interface RequestPayload {
  payload: MiniAppWalletAuthSuccessPayload;
  nonce: string;
}

export async function POST(req: NextRequest) {
  try {
    const { payload, nonce } = (await req.json()) as RequestPayload;

    const cookieStore = await cookies();
    const storedNonce = cookieStore.get("siwe")?.value;

    if (nonce !== storedNonce) {
      return NextResponse.json(
        { status: "error", isValid: false, message: "Invalid nonce" },
        { status: 400 },
      );
    }

    const validMessage = await verifySiweMessage(payload, nonce);

    cookieStore.delete("siwe");

    return NextResponse.json({
      status: "success",
      isValid: validMessage.isValid,
      address: payload.address,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json(
      { status: "error", isValid: false, message },
      { status: 500 },
    );
  }
}
