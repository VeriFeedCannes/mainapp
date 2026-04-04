import { NextRequest, NextResponse } from "next/server";
import {
  serializeTransaction,
  keccak256,
  type TransactionSerializableEIP1559,
} from "viem";
import { getArxClient, arxChain } from "@/lib/arx-chain";
import { createPendingSign } from "@/lib/sessions";

export async function POST(req: NextRequest) {
  try {
    const { wallet } = (await req.json()) as { wallet: string };

    if (!wallet) {
      return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
    }

    console.log(`[ARX-TEST] Preparing test tx for ${wallet} on ${arxChain.name}(${arxChain.id})...`);

    const client = getArxClient();

    let nonce = 0;
    let maxFeePerGas = BigInt(20_000_000_000);
    let maxPriorityFeePerGas = BigInt(2_000_000_000);

    try {
      const results = await Promise.race([
        Promise.all([
          client.getTransactionCount({ address: wallet as `0x${string}` }),
          client.estimateFeesPerGas(),
        ]),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("RPC timeout")), 8000),
        ),
      ]);
      nonce = results[0];
      if (results[1].maxFeePerGas) maxFeePerGas = results[1].maxFeePerGas;
      if (results[1].maxPriorityFeePerGas) maxPriorityFeePerGas = results[1].maxPriorityFeePerGas;
    } catch (rpcErr) {
      console.warn(`[ARX-TEST] RPC call failed, using defaults: ${rpcErr}`);
    }

    const tx: TransactionSerializableEIP1559 = {
      type: "eip1559",
      chainId: arxChain.id,
      nonce,
      to: wallet as `0x${string}`,
      data: "0x",
      value: BigInt(0),
      maxFeePerGas,
      maxPriorityFeePerGas,
      gas: BigInt(21_000),
    };

    const serialized = serializeTransaction(tx);
    const digest = keccak256(serialized);
    const digestHex = digest.slice(2);

    console.log(
      `[ARX-TEST] OK — nonce=${nonce} digest=${digestHex.slice(0, 16)}...`,
    );

    const request = createPendingSign(
      wallet,
      0,
      digestHex,
      serialized,
      arxChain.id,
    );

    return NextResponse.json({
      requestId: request.id,
      chain: arxChain.name,
      chainId: arxChain.id,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[ARX-TEST] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
