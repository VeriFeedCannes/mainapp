import { NextRequest, NextResponse } from "next/server";
import {
  encodeFunctionData,
  serializeTransaction,
  keccak256,
  type TransactionSerializableEIP1559,
} from "viem";
import { getArxClient, arxChain } from "@/lib/arx-chain";
import { createPendingSign } from "@/lib/sessions";

const BADGE_CONTRACT =
  process.env.NEXT_PUBLIC_BADGE_CONTRACT ??
  "0x2BeE4bD96a4F7eA712B079c0A5C5440F05B50B4B";

const REDEEM_ABI = [
  {
    type: "function" as const,
    name: "redeemBadge",
    inputs: [{ name: "badgeId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable" as const,
  },
] as const;

export async function POST(req: NextRequest) {
  try {
    const { wallet, badgeId } = (await req.json()) as {
      wallet: string;
      badgeId: number;
    };

    if (!wallet || !badgeId) {
      return NextResponse.json(
        { error: "Missing wallet or badgeId" },
        { status: 400 },
      );
    }

    const client = getArxClient();

    const calldata = encodeFunctionData({
      abi: REDEEM_ABI,
      functionName: "redeemBadge",
      args: [BigInt(badgeId)],
    });

    const [nonce, gasPrice, estimatedGas] = await Promise.all([
      client.getTransactionCount({ address: wallet as `0x${string}` }),
      client.estimateFeesPerGas(),
      client
        .estimateGas({
          account: wallet as `0x${string}`,
          to: BADGE_CONTRACT as `0x${string}`,
          data: calldata,
        })
        .catch(() => BigInt(150_000)),
    ]);

    const tx: TransactionSerializableEIP1559 = {
      type: "eip1559",
      chainId: arxChain.id,
      nonce,
      to: BADGE_CONTRACT as `0x${string}`,
      data: calldata,
      value: BigInt(0),
      maxFeePerGas: gasPrice.maxFeePerGas ?? BigInt(1_000_000),
      maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas ?? BigInt(100_000),
      gas: estimatedGas,
    };

    const serialized = serializeTransaction(tx);
    const digest = keccak256(serialized);
    const digestHex = digest.slice(2);

    console.log(
      `[ARX-PREPARE] wallet=${wallet} badgeId=${badgeId} chain=${arxChain.id} nonce=${nonce} digest=${digestHex.slice(0, 16)}...`,
    );

    const request = createPendingSign(
      wallet,
      badgeId,
      digestHex,
      serialized,
      arxChain.id,
    );

    return NextResponse.json({ requestId: request.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[ARX-PREPARE] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
