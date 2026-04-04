import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { recoverMessageAddress, type Hex } from "viem";

interface RequestPayload {
  etherAddress: string;
  signature: string;
  nonce: string;
}

export async function POST(req: NextRequest) {
  try {
    const { etherAddress, signature, nonce } =
      (await req.json()) as RequestPayload;

    if (!etherAddress || !signature || !nonce) {
      return NextResponse.json(
        { status: "error", message: "Missing fields" },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const storedNonce = cookieStore.get("siwe")?.value;

    if (nonce !== storedNonce) {
      return NextResponse.json(
        { status: "error", message: "Invalid or expired nonce" },
        { status: 400 },
      );
    }

    const recovered = await recoverMessageAddress({
      message: nonce,
      signature: signature as Hex,
    });

    if (recovered.toLowerCase() !== etherAddress.toLowerCase()) {
      return NextResponse.json(
        {
          status: "error",
          message: `Signature mismatch: expected ${etherAddress}, got ${recovered}`,
        },
        { status: 403 },
      );
    }

    cookieStore.delete("siwe");

    return NextResponse.json({
      status: "success",
      isValid: true,
      address: recovered,
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
