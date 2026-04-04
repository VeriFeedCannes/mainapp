import { NextRequest, NextResponse } from "next/server";
import {
  serializeTransaction,
  recoverAddress,
  type Hex,
  type TransactionSerializableEIP1559,
  parseTransaction,
} from "viem";
import { getArxClient } from "@/lib/arx-chain";
import {
  verifyStationSecret,
  getPendingSignById,
  completePendingSign,
  failPendingSign,
} from "@/lib/sessions";

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-station-secret");
  if (!verifyStationSecret(secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { requestId, r, s } = (await req.json()) as {
      requestId: string;
      r: string;
      s: string;
      publicKey?: string;
    };

    if (!requestId || !r || !s) {
      return NextResponse.json(
        { error: "Missing requestId, r, or s" },
        { status: 400 },
      );
    }

    const pending = getPendingSignById(requestId);
    if (!pending || pending.status !== "pending") {
      return NextResponse.json(
        { error: "Sign request not found or already processed" },
        { status: 404 },
      );
    }

    const rHex = `0x${r.replace(/^0x/, "")}` as Hex;
    const sHex = `0x${s.replace(/^0x/, "")}` as Hex;
    const digest = `0x${pending.digestHex}` as Hex;

    let yParity: number | undefined;
    for (const tryParity of [0, 1] as const) {
      try {
        const recovered = await recoverAddress({
          hash: digest,
          signature: { r: rHex, s: sHex, yParity: tryParity },
        });
        if (recovered.toLowerCase() === pending.address.toLowerCase()) {
          yParity = tryParity;
          break;
        }
      } catch {
        continue;
      }
    }

    if (yParity === undefined) {
      console.error(
        `[ARX-SIGN] Could not recover address ${pending.address} from signature`,
      );
      failPendingSign(requestId, "Signature recovery failed");
      return NextResponse.json(
        { error: "Signature does not match expected address" },
        { status: 400 },
      );
    }

    console.log(
      `[ARX-SIGN] Signature verified — yParity=${yParity} address=${pending.address}`,
    );

    const parsed = parseTransaction(pending.unsignedTxSerialized as Hex);
    const unsignedTx: TransactionSerializableEIP1559 = {
      type: "eip1559",
      chainId: parsed.chainId ?? pending.chainId,
      nonce: parsed.nonce,
      to: parsed.to,
      data: parsed.data,
      value: parsed.value,
      maxFeePerGas: parsed.type === "eip1559" ? parsed.maxFeePerGas : undefined,
      maxPriorityFeePerGas: parsed.type === "eip1559" ? parsed.maxPriorityFeePerGas : undefined,
      gas: parsed.gas,
    };
    const signedSerialized = serializeTransaction(unsignedTx, {
      r: rHex,
      s: sHex,
      yParity,
    });

    const client = getArxClient();

    const txHash = await client.request({
      method: "eth_sendRawTransaction",
      params: [signedSerialized],
    });

    console.log(`[ARX-SIGN] Transaction broadcast — txHash=${txHash}`);

    completePendingSign(requestId, txHash);

    return NextResponse.json({ ok: true, txHash });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[ARX-SIGN] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
